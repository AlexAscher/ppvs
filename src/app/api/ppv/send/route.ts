import { NextRequest } from "next/server";
import { after } from "next/server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { withTelegramClient } from "@/lib/telegram-pool";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import {
  generatePpvCode,
  sendBlurredPreviewWithLink,
  type PpvPreviewItem,
} from "@/lib/ppv-delivery";

// PPV send delivery can take 30–120s on slow networks. Allow the route's
// after() callback to run that long on serverful platforms (Vercel limits
// hobby tier to 60s; bump if you upgrade).
export const maxDuration = 300;

type SendBody = {
  modelId: string;
  peerId: string;
  accessHash: string | null;
  peerUsername?: string | null;
  caption?: string;
  ppvIds: string[];
};

type PpvRow = {
  id: string;
  name: string;
  price: number | string;
  media_url: string | null;
  preview_url: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SendBody;
    if (!body.modelId || !body.peerId || !Array.isArray(body.ppvIds) || body.ppvIds.length === 0) {
      return Response.json({ error: "modelId, peerId and ppvIds required" }, { status: 400 });
    }

    const auth = await authorizeModelAccess(body.modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const admin = createAdminSupabaseClient();

    // Load the selected PPV items, restricted to the chosen model so a
    // chatter can't smuggle items from another model into a send.
    const { data: ppvRows, error: ppvErr } = await admin
      .from("ppvs")
      .select("id, name, price, media_url, preview_url")
      .in("id", body.ppvIds)
      .eq("model_id", body.modelId);
    if (ppvErr) {
      return Response.json({ error: `DB: ${ppvErr.message}` }, { status: 500 });
    }
    const items = (ppvRows ?? []) as PpvRow[];
    if (items.length === 0) {
      return Response.json({ error: "No matching PPVs found" }, { status: 404 });
    }

    // Preserve the order the chatter selected (the DB query has no guaranteed order).
    const byId = new Map(items.map((p) => [p.id, p]));
    const ordered = body.ppvIds.map((id) => byId.get(id)).filter((x): x is PpvRow => !!x);

    const totalPrice = ordered.reduce((s, p) => s + Number(p.price ?? 0), 0);

    // Generate a unique code. UNIQUE constraint will reject collisions; retry
    // a few times. With 8 chars from a 33-char alphabet, collisions are
    // astronomically rare but we handle them anyway.
    let code = "";
    let sendId = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      code = generatePpvCode();
      const { data: inserted, error: insertErr } = await admin
        .from("ppv_sends")
        .insert({
          code,
          model_id: body.modelId,
          chatter_id: auth.userId,
          peer_id: body.peerId,
          peer_access_hash: body.accessHash ?? null,
          peer_username: body.peerUsername ?? null,
          caption: body.caption ?? null,
          total_price: totalPrice,
          status: "pending",
        })
        .select("id")
        .single();
      if (!insertErr && inserted) {
        sendId = (inserted as { id: string }).id;
        break;
      }
      // 23505 = unique_violation in Postgres
      if (insertErr && (insertErr as { code?: string }).code !== "23505") {
        return Response.json({ error: `DB insert: ${insertErr.message}` }, { status: 500 });
      }
    }
    if (!sendId) {
      return Response.json({ error: "Could not generate unique code" }, { status: 500 });
    }

    // Junction rows preserving the chatter's selection order.
    const itemRows = ordered.map((p, idx) => ({
      send_id: sendId,
      ppv_id: p.id,
      ordinal: idx,
    }));
    const { error: linkErr } = await admin.from("ppv_send_items").insert(itemRows);
    if (linkErr) {
      // Best-effort rollback so a half-broken send doesn't sit in the DB.
      await admin.from("ppv_sends").delete().eq("id", sendId);
      return Response.json({ error: `DB items: ${linkErr.message}` }, { status: 500 });
    }

    // Build the public pay URL. Falls back to the request origin in dev.
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const payUrl = `${baseUrl}/pay/${code}`;

    const previewItems: PpvPreviewItem[] = ordered
      .filter((p): p is PpvRow & { media_url: string } => !!p.media_url)
      .map((p) => ({ mediaUrl: p.media_url, previewUrl: p.preview_url }));

    // Capture context for the background task before we leave the request scope.
    const sendCtx = {
      sendId,
      modelId: body.modelId,
      peerId: body.peerId,
      accessHash: body.accessHash ?? null,
      caption: body.caption ?? "",
      session_string: auth.model.session_string,
      api_id: auth.model.api_id,
      api_hash: auth.model.api_hash,
      previewItems,
      payUrl,
      totalPrice,
    };

    // ─── Background delivery ────────────────────────────────────────────────
    // We respond to the chatter immediately so the UI feels snappy. The
    // actual gramJS upload (download previews from Supabase + push to
    // Telegram MTProto in 10-file albums) runs after the response is sent.
    // Status transitions: pending → sending → sent (or failed).
    after(async () => {
      try {
        await admin.from("ppv_sends").update({ status: "sending" }).eq("id", sendCtx.sendId);

        await withTelegramClient(
          sendCtx.modelId,
          sendCtx.session_string,
          sendCtx.api_id,
          sendCtx.api_hash,
          async (tg) => {
            await sendBlurredPreviewWithLink(
              tg,
              sendCtx.peerId,
              sendCtx.accessHash,
              sendCtx.previewItems,
              sendCtx.caption,
              sendCtx.payUrl,
              sendCtx.totalPrice,
            );
          },
          180_000,
        );

        await admin.from("ppv_sends").update({ status: "sent", error: null }).eq("id", sendCtx.sendId);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed";
        console.error("[ppv/send background] error:", message);
        await admin
          .from("ppv_sends")
          .update({ status: "failed", error: message })
          .eq("id", sendCtx.sendId);
      }
    });

    return Response.json({ ok: true, code, payUrl, status: "pending" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[ppv/send POST] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
