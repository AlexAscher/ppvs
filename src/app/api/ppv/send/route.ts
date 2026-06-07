import { NextRequest } from "next/server";
import { after } from "next/server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { withTelegramClient } from "@/lib/telegram-pool";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import {
  generatePpvCode,
  sendBlurredPreviewWithLink,
  sendOriginalsAlbum,
  type PpvPreviewItem,
  type OriginalItem,
} from "@/lib/ppv-delivery";
import { ppvMediaPathFromUrl } from "@/lib/ppv-storage";
import { consume, getClientIp, tooManyRequests } from "@/lib/rate-limit";

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
  /** Chatter-supplied price. 0 → free send (originals straight to TG). */
  totalPrice?: number;
};

type PpvRow = {
  id: string;
  name: string;
  price: number | string;
  media_url: string | null;
  preview_url: string | null;
  tg_file_id: string | null;
};

export async function POST(req: NextRequest) {
  try {
    // Modest rate-limit per IP so a runaway client can't spam Telegram pushes.
    const ip = getClientIp(req);
    if (!consume(`ppv-send|${ip}`, 30, 60_000)) return tooManyRequests(60);

    const raw = (await req.json().catch(() => null)) as Partial<SendBody> | null;
    const modelId = typeof raw?.modelId === "string" ? raw.modelId : "";
    const peerId = typeof raw?.peerId === "string" ? raw.peerId : "";
    const ppvIds = Array.isArray(raw?.ppvIds) ? raw.ppvIds.filter((x): x is string => typeof x === "string") : [];
    const caption = typeof raw?.caption === "string" ? raw.caption.slice(0, 4096) : undefined;
    const accessHash = typeof raw?.accessHash === "string" || raw?.accessHash === null ? raw.accessHash ?? null : null;
    const peerUsername = typeof raw?.peerUsername === "string" || raw?.peerUsername === null ? raw?.peerUsername ?? null : null;
    // Chatter-set price. Anything non-finite or negative is clamped to 0 (free).
    const rawPrice = typeof raw?.totalPrice === "number" ? raw.totalPrice : 0;
    const chatterPrice =
      Number.isFinite(rawPrice) && rawPrice > 0 ? Math.round(rawPrice * 100) / 100 : 0;
    if (!modelId || !peerId || ppvIds.length === 0 || ppvIds.length > 50) {
      return Response.json({ error: "modelId, peerId and ppvIds (1–50) required" }, { status: 400 });
    }
    const body: SendBody = { modelId, peerId, ppvIds, caption, accessHash, peerUsername, totalPrice: chatterPrice };

    const auth = await authorizeModelAccess(body.modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const admin = createAdminSupabaseClient();

    // Load the selected PPV items, restricted to the chosen model so a
    // chatter can't smuggle items from another model into a send. tg_file_id
    // lets the free-send path reuse the lazy file_id cache for instant delivery.
    const { data: ppvRows, error: ppvErr } = await admin
      .from("ppvs")
      .select("id, name, price, media_url, preview_url, tg_file_id")
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

    // Chatter sets the price (UI input). 0 = free gift.
    const totalPrice = chatterPrice;
    const isFreeSend = totalPrice <= 0;

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

    // Build the public pay URL. Prefer the brand-neutral Telegram bot
    // Mini App deep link (`t.me/<bot>/<app>?startapp=<code>`) so fans
    // never see the platform domain in chat. Falls back to the legacy
    // /pay/<code> web URL if NEXT_PUBLIC_PAY_BOT_USERNAME is unset.
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const { buildMiniAppLink } = await import("@/lib/telegram-webapp");
    const payUrl =
      buildMiniAppLink({ startParam: code }) ?? `${baseUrl}/pay/${code}`;

    const previewItems: PpvPreviewItem[] = ordered
      .filter((p): p is PpvRow & { media_url: string } => !!p.media_url)
      .map((p) => ({ ppvId: p.id, mediaUrl: p.media_url, previewUrl: p.preview_url }));

    // Map ppvId → media_url so the backfill callback can derive the preview
    // storage path (same {userId}/{id}_preview.jpg convention as upload).
    const mediaUrlByPpvId = new Map(previewItems.map((p) => [p.ppvId, p.mediaUrl]));

    // For the free-send path: build OriginalItem[] (same shape /api/ppv/deliver
    // uses) so we can reuse sendOriginalsAlbum directly.
    const originalItems: OriginalItem[] = ordered
      .filter((p): p is PpvRow & { media_url: string } => !!p.media_url)
      .map((p) => ({
        ppvId: p.id,
        mediaUrl: p.media_url,
        cachedFileId: p.tg_file_id,
      }));

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
      originalItems,
      mediaUrlByPpvId,
      payUrl,
      totalPrice,
      isFreeSend,
    };

    // Upload a freshly-generated blur as the item's preview_url so the next
    // send skips the heavy original download. Derives the storage path from
    // the original's path: {userId}/{id}.{ext} → {userId}/{id}_preview.jpg.
    async function backfillPreview(ppvId: string, jpeg: Buffer): Promise<void> {
      const mediaUrl = sendCtx.mediaUrlByPpvId.get(ppvId);
      if (!mediaUrl) return;
      const origPath = ppvMediaPathFromUrl(mediaUrl);
      if (!origPath) return;
      const previewPath = `${origPath.replace(/\.[^./]+$/, "")}_preview.jpg`;
      const { error: upErr } = await admin.storage
        .from("ppvs")
        .upload(previewPath, jpeg, { contentType: "image/jpeg", upsert: true });
      if (upErr) {
        console.warn(`[ppv/send] preview backfill upload failed for ppv=${ppvId}:`, upErr.message);
        return;
      }
      const publicUrl = admin.storage.from("ppvs").getPublicUrl(previewPath).data.publicUrl;
      await admin.from("ppvs").update({ preview_url: publicUrl }).eq("id", ppvId);
    }

    // ─── Background delivery ────────────────────────────────────────────────
    // We respond to the chatter immediately so the UI feels snappy. The
    // actual gramJS upload runs after the response is sent.
    //
    // Paid send: download previews + push blurred album + pay-link caption.
    //   Status: pending → sending → sent (or failed).
    //
    // Free send: skip the preview path entirely, push originals directly to
    // TG with the chatter's caption. No pay link. Mark delivered up-front so
    // the row reflects the final state.
    //   Status: pending → delivered (or failed).
    after(async () => {
      try {
        const nextStatus = sendCtx.isFreeSend ? "delivered" : "sending";
        await admin.from("ppv_sends").update({ status: nextStatus }).eq("id", sendCtx.sendId);

        await withTelegramClient(
          sendCtx.modelId,
          sendCtx.session_string,
          sendCtx.api_id,
          sendCtx.api_hash,
          async (tg) => {
            if (sendCtx.isFreeSend) {
              // Originals straight to fan as a single album (forceAlbum=true)
              // so multi-file free sends arrive as one grouped message
              // instead of N individual messages. Cached file_ids are
              // bypassed for this path — small cost, much better UX.
              await sendOriginalsAlbum(
                tg,
                sendCtx.peerId,
                sendCtx.accessHash,
                sendCtx.originalItems,
                sendCtx.caption,
                async (ppvId, serialized) => {
                  try {
                    await admin.from("ppvs").update({ tg_file_id: serialized }).eq("id", ppvId);
                  } catch (e: unknown) {
                    console.error(
                      `[ppv/send free] cache write failed for ppv=${ppvId}:`,
                      e instanceof Error ? e.message : e,
                    );
                  }
                },
                true, // forceAlbum
              );
            } else {
              await sendBlurredPreviewWithLink(
                tg,
                sendCtx.peerId,
                sendCtx.accessHash,
                sendCtx.previewItems,
                sendCtx.caption,
                sendCtx.payUrl,
                sendCtx.totalPrice,
                backfillPreview,
              );
            }
          },
          180_000,
        );

        if (sendCtx.isFreeSend) {
          await admin
            .from("ppv_sends")
            .update({ status: "delivered", delivered_at: new Date().toISOString(), error: null })
            .eq("id", sendCtx.sendId);
        } else {
          await admin.from("ppv_sends").update({ status: "sent", error: null }).eq("id", sendCtx.sendId);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed";
        console.error("[ppv/send background] error:", message);
        await admin
          .from("ppv_sends")
          .update({ status: "failed", error: message })
          .eq("id", sendCtx.sendId);
      }
    });

    return Response.json({ ok: true, code, payUrl, status: "pending", isFree: isFreeSend });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[ppv/send POST] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
