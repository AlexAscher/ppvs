import { NextRequest } from "next/server";
import { after } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { withTelegramClient } from "@/lib/telegram-pool";
import { sendOriginalsAlbum } from "@/lib/ppv-delivery";

export const maxDuration = 300;

type DeliverBody = { code: string };

type SendRow = {
  id: string;
  model_id: string;
  peer_id: string;
  peer_access_hash: string | null;
  caption: string | null;
  status: string;
};

type ModelRow = {
  session_string: string;
  api_id: number;
  api_hash: string;
};

type ItemRowRaw = {
  ordinal: number;
  ppvs:
    | { name: string; media_url: string | null }
    | { name: string; media_url: string | null }[]
    | null;
};

export type DeliverItem = {
  name: string;
  mediaUrl: string;
  isVideo: boolean;
};

function isLikelyVideoUrl(url: string): boolean {
  const u = url.toLowerCase().split("?")[0];
  return /\.(mp4|mov|webm|m4v|mkv)$/.test(u);
}

/**
 * Two-track delivery:
 *
 *   Track 1 (web — instant): mark the send as paid, gather originals'
 *   public URLs, return them to the caller. The browser shows the
 *   originals on the same /pay page within milliseconds — no server-side
 *   file transfer involved.
 *
 *   Track 2 (Telegram — background): schedule a gramJS push of the same
 *   originals to the fan's DM via `after()`. If the chatter's network
 *   can't carry the bytes, web (Track 1) still delivers the content; the
 *   Telegram copy is best-effort and may fail/retry.
 *
 * Idempotent: if status is already `delivered`, we skip Track 2 (don't
 * send dupes) and just return the items for Track 1 again.
 */
export async function POST(req: NextRequest) {
  try {
    const { code } = (await req.json()) as DeliverBody;
    if (!code) return Response.json({ error: "code required" }, { status: 400 });

    const admin = createAdminSupabaseClient();

    const { data: sendRaw, error: sendErr } = await admin
      .from("ppv_sends")
      .select("id, model_id, peer_id, peer_access_hash, caption, status")
      .eq("code", code)
      .maybeSingle();
    if (sendErr) return Response.json({ error: `DB: ${sendErr.message}` }, { status: 500 });
    if (!sendRaw) return Response.json({ error: "Not found" }, { status: 404 });
    const send = sendRaw as SendRow;

    const { data: itemsRaw, error: itemsErr } = await admin
      .from("ppv_send_items")
      .select("ordinal, ppvs(name, media_url)")
      .eq("send_id", send.id)
      .order("ordinal", { ascending: true });
    if (itemsErr) return Response.json({ error: `DB: ${itemsErr.message}` }, { status: 500 });

    const items: DeliverItem[] = ((itemsRaw ?? []) as unknown as ItemRowRaw[])
      .map((it) => {
        const ppv = Array.isArray(it.ppvs) ? it.ppvs[0] ?? null : it.ppvs;
        return {
          name: ppv?.name ?? "Item",
          mediaUrl: ppv?.media_url ?? "",
          isVideo: ppv?.media_url ? isLikelyVideoUrl(ppv.media_url) : false,
        };
      })
      .filter((it) => !!it.mediaUrl);

    const alreadyDelivered = send.status === "delivered";

    // Track 1: flip status so subsequent pollers/refreshes see it as paid,
    // and ensure the fan keeps seeing originals on reload.
    if (!alreadyDelivered) {
      const now = new Date().toISOString();
      await admin
        .from("ppv_sends")
        .update({ status: "paid", paid_at: now })
        .eq("id", send.id);
    }

    // Track 2: background Telegram push. Only fire once per send — if we've
    // already delivered, don't spam the fan with duplicates.
    if (!alreadyDelivered && items.length > 0) {
      const { data: modelRow, error: modelErr } = await admin
        .from("models")
        .select("session_string, api_id, api_hash")
        .eq("id", send.model_id)
        .single();

      if (modelErr || !modelRow) {
        console.error("[ppv/deliver] model lookup failed — skipping Telegram push:", modelErr);
      } else {
        const model = modelRow as ModelRow;
        const ctx = {
          sendId: send.id,
          modelId: send.model_id,
          peerId: send.peer_id,
          accessHash: send.peer_access_hash,
          caption: send.caption ?? "",
          session_string: model.session_string,
          api_id: model.api_id,
          api_hash: model.api_hash,
          mediaUrls: items.map((it) => it.mediaUrl),
        };

        after(async () => {
          try {
            await withTelegramClient(
              ctx.modelId,
              ctx.session_string,
              ctx.api_id,
              ctx.api_hash,
              async (tg) => {
                await sendOriginalsAlbum(
                  tg,
                  ctx.peerId,
                  ctx.accessHash,
                  ctx.mediaUrls,
                  ctx.caption,
                );
              },
              300_000,
            );
            await admin
              .from("ppv_sends")
              .update({
                status: "delivered",
                delivered_at: new Date().toISOString(),
                error: null,
              })
              .eq("id", ctx.sendId);
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : "Failed";
            console.error("[ppv/deliver background] telegram push failed:", message);
            // Stay at `paid` rather than `failed` — the fan already got
            // their content on the /pay page, so this isn't a hard failure.
            await admin
              .from("ppv_sends")
              .update({ error: `Telegram push failed: ${message}` })
              .eq("id", ctx.sendId);
          }
        });
      }
    }

    return Response.json({
      ok: true,
      items,
      caption: send.caption,
      alreadyDelivered,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[ppv/deliver POST] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
