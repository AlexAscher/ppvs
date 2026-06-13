import { NextRequest } from "next/server";
import { after } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { withTelegramClient } from "@/lib/telegram-pool";
import { sendOriginalsAlbum } from "@/lib/ppv-delivery";
import { withTimeout } from "@/lib/with-timeout";
import { consume, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { sendSalesAlert } from "@/lib/sales-alerts";

export const maxDuration = 300;

// Cap each critical-path Supabase call so a flaky uplink can't pin the
// fan's "unlock" for 70s. On timeout we 503 fast and the client retries.
const DELIVER_QUERY_TIMEOUT_MS = 15_000;

type DeliverBody = { code: string };

type SendRow = {
  id: string;
  model_id: string;
  peer_id: string;
  peer_access_hash: string | null;
  peer_username: string | null;
  caption: string | null;
  status: string;
  total_price: number;
  expires_at: string | null;
  chatter_id: string | null;
};

type ModelRow = {
  session_string: string;
  api_id: number;
  api_hash: string;
  // Needed to fire Sales Alerts via the agency's bound bot chat.
  agency_user_id: string;
  name: string | null;
};

type ItemRowRaw = {
  ordinal: number;
  ppvs:
    | { id: string; name: string; media_url: string | null; tg_file_id: string | null }
    | { id: string; name: string; media_url: string | null; tg_file_id: string | null }[]
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
    // Rate-limit per IP — defense-in-depth against brute-forcing pay codes
    // (12 chars / 33-char alphabet is unfeasible to enumerate, but cap it
    // anyway). In-memory; for multi-instance prod swap for Upstash.
    const ip = getClientIp(req);
    if (!consume(`deliver|${ip}`, 20, 60_000)) return tooManyRequests(60);

    const body = (await req.json().catch(() => null)) as DeliverBody | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    // 12-char codes from the new alphabet; accept up to 16 for backward
    // compat with any older 8-char codes still in flight.
    if (!code || code.length < 6 || code.length > 16 || !/^[a-z0-9]+$/.test(code)) {
      return Response.json({ error: "Invalid code" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();

    let sendRaw: SendRow | null;
    let itemsRaw: unknown;
    try {
      const sendRes = await withTimeout(
        Promise.resolve(
          admin
            .from("ppv_sends")
            .select(
              "id, model_id, peer_id, peer_access_hash, peer_username, caption, status, total_price, expires_at, chatter_id",
            )
            .eq("code", code)
            .maybeSingle(),
        ),
        DELIVER_QUERY_TIMEOUT_MS,
        "deliver: load send",
      );
      if (sendRes.error) return Response.json({ error: `DB: ${sendRes.error.message}` }, { status: 500 });
      sendRaw = sendRes.data as SendRow | null;
      if (!sendRaw) return Response.json({ error: "Not found" }, { status: 404 });

      const itemsRes = await withTimeout(
        Promise.resolve(
          admin
            .from("ppv_send_items")
            .select("ordinal, ppvs(id, name, media_url, tg_file_id)")
            .eq("send_id", sendRaw.id)
            .order("ordinal", { ascending: true }),
        ),
        DELIVER_QUERY_TIMEOUT_MS,
        "deliver: load items",
      );
      if (itemsRes.error) return Response.json({ error: `DB: ${itemsRes.error.message}` }, { status: 500 });
      itemsRaw = itemsRes.data;
    } catch {
      // Timed out — tell the client to retry rather than hang 70s.
      return Response.json({ error: "Delivery is slow right now — try again." }, { status: 503 });
    }
    const send = sendRaw;

    // Urgency timer: once expired, a not-yet-paid order can't be unlocked.
    // Already paid/delivered orders stay deliverable (idempotent re-reveal).
    if (
      send.status !== "paid" &&
      send.status !== "delivered" &&
      send.expires_at &&
      Date.now() > new Date(send.expires_at).getTime()
    ) {
      return Response.json({ error: "This offer has expired." }, { status: 410 });
    }

    // Two parallel projections from the joined rows: the user-facing
    // DeliverItem list (returned to the browser for web reveal) and the
    // Telegram-side OriginalItem list (consumed by sendOriginalsAlbum).
    type JoinRow = { ppvId: string; name: string; mediaUrl: string; cachedFileId: string | null };
    const joined: JoinRow[] = ((itemsRaw ?? []) as unknown as ItemRowRaw[])
      .map((it) => {
        const ppv = Array.isArray(it.ppvs) ? it.ppvs[0] ?? null : it.ppvs;
        return {
          ppvId: ppv?.id ?? "",
          name: ppv?.name ?? "Item",
          mediaUrl: ppv?.media_url ?? "",
          cachedFileId: ppv?.tg_file_id ?? null,
        };
      })
      .filter((it) => !!it.mediaUrl && !!it.ppvId);

    const items: DeliverItem[] = joined.map((it) => ({
      name: it.name,
      mediaUrl: it.mediaUrl,
      isVideo: isLikelyVideoUrl(it.mediaUrl),
    }));

    const alreadyDelivered = send.status === "delivered";

    // Track 1: flip status so subsequent pollers/refreshes see it as paid.
    // This is the only DB write the fan's reveal waits on — keep it capped.
    if (!alreadyDelivered) {
      const now = new Date().toISOString();
      try {
        await withTimeout(
          Promise.resolve(
            admin.from("ppv_sends").update({ status: "paid", paid_at: now }).eq("id", send.id),
          ),
          DELIVER_QUERY_TIMEOUT_MS,
          "deliver: mark paid",
        );
      } catch {
        // Best-effort — the items are already returned below for the web
        // reveal; status will be reconciled on the next deliver call.
        console.error("[ppv/deliver] mark-paid timed out");
      }

      // Fire the Sales Alert in the background. The Malum webhook already
      // calls sendSalesAlert when it processes a real payment, but Malum is
      // currently disabled (the /pay button hits /api/ppv/deliver directly
      // to short-circuit the gateway). Without this hook, PPV sales never
      // trigger a notification while tips do — confusing for the agency.
      // We need the model's agency_user_id (loaded a few lines down for
      // the Telegram push), so we fetch a thin lookup here too.
      after(async () => {
        try {
          const { data: m } = await admin
            .from("models")
            .select("agency_user_id, name")
            .eq("id", send.model_id)
            .maybeSingle();
          const agencyUserId = (m as { agency_user_id?: string } | null)?.agency_user_id;
          if (!agencyUserId) return;
          // Pick the first item's name as the alert label — good enough
          // for a one-line bot message.
          const firstItem = joined[0];
          sendSalesAlert({
            type: "ppv",
            agencyUserId,
            modelId: send.model_id,
            modelName: (m as { name?: string } | null)?.name ?? undefined,
            fanDisplay: send.peer_username ? `@${send.peer_username}` : `Fan ${send.peer_id.slice(-4)}`,
            amount: Number(send.total_price ?? 0),
            itemName: firstItem?.name ?? "PPV",
            chatterId: send.chatter_id ?? null,
          });
        } catch (e) {
          console.error(
            "[ppv/deliver] sales alert failed:",
            e instanceof Error ? e.message : e,
          );
        }
      });

      // Inline chat-event so the chatter sees "Customer paid the PPV
      // ($X)" appear in their chat view alongside Telegram messages.
      // Fans never see this — it lives in chat_system_events, not in TG.
      after(async () => {
        try {
          await admin.from("chat_system_events").insert({
            model_id: send.model_id,
            peer_id: send.peer_id,
            kind: "ppv_paid",
            amount: Number(send.total_price ?? 0),
            body: `Customer paid the PPV ($${Number(send.total_price ?? 0).toFixed(2)})`,
          });
        } catch (e) {
          console.error(
            "[ppv/deliver] chat-event insert failed:",
            e instanceof Error ? e.message : e,
          );
        }
      });

      // fans.total_spent increment moved to the background after() block —
      // it's not needed for the web reveal and was adding 2 round-trips to
      // the fan's critical path.
      after(async () => {
        try {
          const { data: existing } = await admin
            .from("fans")
            .select("id, total_spent")
            .eq("model_id", send.model_id)
            .eq("peer_id", send.peer_id)
            .maybeSingle();
          const prev = Number((existing as { total_spent: number } | null)?.total_spent ?? 0);
          const next = prev + Number(send.total_price ?? 0);
          await admin.from("fans").upsert(
            {
              model_id: send.model_id,
              peer_id: send.peer_id,
              telegram_username: send.peer_username,
              total_spent: next,
              last_seen_at: now,
            },
            { onConflict: "model_id,peer_id" },
          );
        } catch (e: unknown) {
          console.error(
            "[ppv/deliver] fans.total_spent update failed:",
            e instanceof Error ? e.message : e,
          );
        }
      });
    }

    // Track 2: background Telegram push. Only fire once per send — if we've
    // already delivered, don't spam the fan with duplicates.
    if (!alreadyDelivered && items.length > 0) {
      const { data: modelRow, error: modelErr } = await admin
        .from("models")
        .select("session_string, api_id, api_hash, agency_user_id, name")
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
          // No caption on the unblurred delivery. The chatter's caption
          // already went out with the locked preview message; repeating it
          // on the unlocked album makes the fan see the same text twice.
          caption: "",
          session_string: model.session_string,
          api_id: model.api_id,
          api_hash: model.api_hash,
          // The new shape carries the cached file id per item so
          // sendOriginalsAlbum can skip the download+upload round-trip
          // on items we've already delivered before to *any* fan.
          originals: joined.map((j) => ({
            ppvId: j.ppvId,
            mediaUrl: j.mediaUrl,
            cachedFileId: j.cachedFileId,
          })),
        };

        after(async () => {
          try {
            const deliveryResult = await withTelegramClient(
              ctx.modelId,
              ctx.session_string,
              ctx.api_id,
              ctx.api_hash,
              async (tg) => {
                return await sendOriginalsAlbum(
                  tg,
                  ctx.peerId,
                  ctx.accessHash,
                  ctx.originals,
                  ctx.caption,
                  async (ppvId, serialized) => {
                    // Best-effort cache write — we don't fail delivery if
                    // this row update breaks, since the bytes already
                    // reached the fan.
                    try {
                      await admin
                        .from("ppvs")
                        .update({ tg_file_id: serialized })
                        .eq("id", ppvId);
                    } catch (e: unknown) {
                      console.error(
                        `[ppv/deliver] cache write failed for ppv=${ppvId}:`,
                        e instanceof Error ? e.message : e,
                      );
                    }
                  },
                );
              },
              300_000,
            );
            // Mark delivered. If some items couldn't be pushed to Telegram
            // (flaky uplink), note it — the fan still has every item on the
            // /pay web page, so this is a soft warning, not a failure.
            const partial =
              deliveryResult.failed > 0
                ? `Telegram: delivered ${deliveryResult.delivered}/${deliveryResult.total} (rest available on web)`
                : null;
            await admin
              .from("ppv_sends")
              .update({
                status: "delivered",
                delivered_at: new Date().toISOString(),
                error: partial,
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
