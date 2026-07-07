import { NewMessage, NewMessageEvent } from "telegram/events";
import { CustomFile } from "telegram/client/uploads";
import type { TelegramClient } from "telegram";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { ppvMediaPathFromUrl } from "@/lib/ppv-storage";
import { generatePpvCode } from "@/lib/ppv-code";
import { starsToUsd } from "@/lib/stars";

/**
 * Auto-reply on first-fan-message.
 *
 * Wiring:
 *   - When a model's gramJS client connects (in telegram-pool), we attach a
 *     NewMessage handler that fires for any incoming message.
 *   - For each incoming message we check:
 *       1. The model has `auto_reply_enabled` and at least text or media.
 *       2. The sender's fan row has `auto_replied_at = null` (or no fan row
 *          exists yet — this is their first message ever to this model).
 *     If both pass, we send the configured text/media via gramJS and bump
 *     `auto_replied_at = now()` on the fan row (upsert, since a brand-new
 *     fan won't have one yet).
 *
 * All DB I/O is wrapped in a per-process in-flight set so a single fan
 * spamming us in the same second doesn't race two auto-replies.
 */

declare global {
  var __ppvs_auto_reply_subscribed__: Set<string> | undefined;
  var __ppvs_auto_reply_inflight__: Set<string> | undefined;
  /** UNIX-seconds of the last OUTGOING message per (modelId, peerId). The
   *  auto-reply scheduler reads this right before firing — if anything
   *  outgoing landed between the fan's first message and the end of the
   *  configured delay, we treat the conversation as "handled by a human"
   *  and skip the auto-reply. */
  var __ppvs_auto_reply_lastout__: Map<string, number> | undefined;
}

const subscribed: Set<string> =
  globalThis.__ppvs_auto_reply_subscribed__ ?? new Set();
globalThis.__ppvs_auto_reply_subscribed__ = subscribed;

const inflight: Set<string> =
  globalThis.__ppvs_auto_reply_inflight__ ?? new Set();
globalThis.__ppvs_auto_reply_inflight__ = inflight;

const lastOutgoing: Map<string, number> =
  globalThis.__ppvs_auto_reply_lastout__ ?? new Map();
globalThis.__ppvs_auto_reply_lastout__ = lastOutgoing;

type ModelConfig = {
  auto_reply_enabled: boolean | null;
  auto_reply_text: string | null;
  auto_reply_delay_sec: number | null;
  auto_reply_stars: number | null;
  auto_reply_ppv_ids: string[] | null;
  tg_user_id: string | null;
};

async function loadModelConfig(modelId: string): Promise<ModelConfig | null> {
  const admin = createAdminSupabaseClient();
  // select * so newly-added AR columns come through on migrated schemas
  // without breaking on older ones.
  const { data } = await admin
    .from("models")
    .select("*")
    .eq("id", modelId)
    .maybeSingle();
  return (data as ModelConfig | null) ?? null;
}

/**
 * Atomically CLAIM the "auto-reply slot" for a (model, peer) pair.
 * Returns true iff THIS caller is the one that should fire the auto-reply.
 *
 * The batch-88 flow used check-then-act (fanNeedsAutoReply + upsert), which
 * held only inside one process (via the `inflight` set). Between processes
 * — or between the same process's polls if two fan messages land in the
 * same second — both callers could pass the check and both fire. This
 * function collapses read-and-write into a single row update so at most
 * ONE caller wins.
 *
 * Semantics:
 *   - If no fans row exists yet: create it with auto_replied_at = now(),
 *     return true. UNIQUE(model_id, peer_id) turns the concurrent duplicate
 *     insert into a 23505 that we recover from by re-running the CAS UPDATE.
 *   - If a row exists AND auto_replied_at IS NULL: UPDATE flips it to now();
 *     the RETURNING count is 1 → caller wins. If a concurrent caller already
 *     flipped it, the WHERE fails, RETURNING is empty → this caller loses.
 *   - If the row already has auto_replied_at set: no rows updated → false.
 */
async function claimAutoReplySlot(modelId: string, peerId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const nowIso = new Date().toISOString();
  // First try to compare-and-swap: only flip if still null. Works whether
  // or not a row already exists.
  const { data: updated } = await admin
    .from("fans")
    .update({ auto_replied_at: nowIso })
    .eq("model_id", modelId)
    .eq("peer_id", peerId)
    .is("auto_replied_at", null)
    .select("id");
  if (updated && updated.length > 0) return true;

  // No matching row to update — either the row exists with a non-null flag
  // (already replied), or the row doesn't exist yet. Check which case we're in.
  const { data: existing } = await admin
    .from("fans")
    .select("id, auto_replied_at")
    .eq("model_id", modelId)
    .eq("peer_id", peerId)
    .maybeSingle();
  if (existing) {
    // Row exists, auto_replied_at is non-null → someone else already fired.
    return !(existing as { auto_replied_at: string | null }).auto_replied_at;
  }

  // No row yet — try to create with the flag pre-set. Concurrent inserts
  // race here; UNIQUE(model_id, peer_id) turns the loser into a 23505.
  const { error: insErr } = await admin.from("fans").insert({
    model_id: modelId,
    peer_id: peerId,
    auto_replied_at: nowIso,
  });
  if (!insErr) return true;
  if ((insErr as { code?: string }).code === "23505") {
    // A concurrent caller inserted first. If ITS auto_replied_at is null
    // (rare — it'd have to have inserted then not flipped), retry the CAS.
    // Otherwise we lost the race — return false so we don't double-send.
    const { data: after } = await admin
      .from("fans")
      .select("auto_replied_at")
      .eq("model_id", modelId)
      .eq("peer_id", peerId)
      .maybeSingle();
    return !((after as { auto_replied_at: string | null } | null)?.auto_replied_at);
  }
  // Unexpected insert error — log and treat as "already replied" so we don't
  // fire a duplicate if a second attempt happens to succeed.
  console.error(
    "[auto-reply] fan-insert failed:",
    (insErr as { message?: string }).message ?? String(insErr),
  );
  return false;
}

/** Download a Vault PPV media file straight from Supabase Storage via the
 *  service-role admin client (the `ppvs` bucket is private). Non-Storage
 *  URLs are refused — matches the SSRF hardening in business-bot.fetchBytes. */
async function customFileFromStorage(url: string): Promise<CustomFile | null> {
  try {
    const path = ppvMediaPathFromUrl(url);
    if (!path) {
      console.error("[auto-reply] refusing non-Storage media URL:", url);
      return null;
    }
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.storage.from("ppvs").download(path);
    if (error || !data) {
      console.error("[auto-reply] storage download failed:", path, error?.message ?? "no data");
      return null;
    }
    const buf = Buffer.from(await data.arrayBuffer());
    const name = path.split("/").pop() ?? `auto_reply_${Date.now()}`;
    return new CustomFile(name, buf.length, "", buf);
  } catch (e) {
    console.error("[auto-reply] customFile error:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function loadPpvMedia(
  ppvIds: string[],
): Promise<{ id: string; mediaUrl: string }[]> {
  if (ppvIds.length === 0) return [];
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("ppvs")
    .select("id, media_url, review_status")
    .in("id", ppvIds);
  const byId = new Map<string, string>();
  for (const r of (data ?? []) as {
    id: string;
    media_url: string | null;
    review_status?: string | null;
  }[]) {
    // Skip anything not approved. This defends against a race where
    // config was saved with an approved id, then admin rejected the
    // item before the fan sent their first message. Pre-moderation rows
    // (review_status null) are treated as approved — that column
    // shipped in batch 96, older PPVs predate it.
    if (r.review_status && r.review_status !== "approved") continue;
    if (r.media_url) byId.set(r.id, r.media_url);
  }
  // Preserve the agency-picked order — .in() doesn't guarantee it.
  return ppvIds
    .map((id) => ({ id, mediaUrl: byId.get(id) ?? "" }))
    .filter((x) => !!x.mediaUrl);
}

/**
 * Materialize a ppv_sends row + junction rows for an auto-reply so the
 * chatter workspace picks it up as a virtual PPV bubble (same code path
 * as chatter-composed sends). chatter_id is left null — the AR was fired
 * by the model's session, not a human chatter. total_price is 0 for free
 * ARs; for stars > 0 ARs it's the USD equivalent, so the purchased_paid_media
 * webhook can fulfill it (mark paid, bump fan.total_spent) using our code
 * as the payload.
 */
async function insertArPpvSend(
  modelId: string,
  peerId: string,
  ppvIds: string[],
  caption: string,
  totalPriceUsd: number,
  isPaidMedia: boolean,
): Promise<{ code: string; sendId: string } | null> {
  const admin = createAdminSupabaseClient();
  let code = "";
  let sendId = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generatePpvCode();
    const nowIso = new Date().toISOString();
    const { data, error } = await admin
      .from("ppv_sends")
      .insert({
        code,
        model_id: modelId,
        chatter_id: null,
        peer_id: peerId,
        peer_access_hash: null,
        peer_username: null,
        caption: caption || null,
        total_price: totalPriceUsd,
        // Free AR is delivered on send; native paid-media AR flips to
        // 'delivered' only when purchased_paid_media webhook lands.
        status: isPaidMedia ? "sent" : "delivered",
        delivered_at: isPaidMedia ? null : nowIso,
      })
      .select("id")
      .single();
    if (!error && data) {
      sendId = (data as { id: string }).id;
      break;
    }
    if (error && (error as { code?: string }).code !== "23505") {
      console.error("[auto-reply] ppv_sends insert failed:", error.message);
      return null;
    }
  }
  if (!sendId) return null;
  const itemRows = ppvIds.map((id, idx) => ({
    send_id: sendId,
    ppv_id: id,
    ordinal: idx,
  }));
  const { error: linkErr } = await admin.from("ppv_send_items").insert(itemRows);
  if (linkErr) {
    console.error("[auto-reply] ppv_send_items insert failed:", linkErr.message);
    await admin.from("ppv_sends").delete().eq("id", sendId);
    return null;
  }
  return { code, sendId };
}

async function sendAutoReply(
  client: TelegramClient,
  modelId: string,
  peerId: string,
  config: ModelConfig,
): Promise<void> {
  const text = (config.auto_reply_text ?? "").trim();
  const ppvIds = Array.isArray(config.auto_reply_ppv_ids)
    ? config.auto_reply_ppv_ids.filter((x): x is string => typeof x === "string")
    : [];
  const stars = Math.max(0, Math.floor(Number(config.auto_reply_stars ?? 0)));

  // No media → text-only greeting (still auto-fires so the model looks
  // responsive). No text either → no-op.
  if (ppvIds.length === 0) {
    if (text) await client.sendMessage(peerId, { message: text, linkPreview: false });
    return;
  }

  const media = await loadPpvMedia(ppvIds);
  if (media.length === 0) {
    // All picked PPVs are missing media (deleted?). Fall back to text.
    if (text) await client.sendMessage(peerId, { message: text, linkPreview: false });
    return;
  }

  // Materialize a ppv_sends row (+ ppv_send_items) up-front so the chatter
  // workspace renders this auto-reply as a virtual PPV bubble regardless of
  // whether it's free or Stars-priced. Without this row, native paid-media
  // messages are hidden by the chatter UI (see isPaidMedia in
  // /api/telegram/messages), and free-album AR shows as a plain photo.
  const totalPriceUsd = stars > 0 ? starsToUsd(stars) : 0;
  const send = await insertArPpvSend(
    modelId,
    peerId,
    media.map((m) => m.id),
    text,
    totalPriceUsd,
    stars > 0,
  );
  const arCode = send?.code ?? null;

  // Stars > 0 → native Paid Media via @ppvstarbot (business connection).
  // The code doubles as the invoice payload so the purchased_paid_media
  // webhook can find the row and fulfill it (mark paid, bump fan.total_spent).
  if (stars > 0) {
    const [{ findActiveBusinessConnection, sendPaidMediaAsBusiness }] = await Promise.all([
      import("@/lib/business-bot"),
    ]);
    const admin = createAdminSupabaseClient();
    let tgUserId = config.tg_user_id ?? null;
    if (!tgUserId) {
      try {
        const me = await client.getMe();
        tgUserId = me && "id" in me && me.id != null ? me.id.toString() : null;
        if (tgUserId) {
          await admin.from("models").update({ tg_user_id: tgUserId }).eq("id", modelId);
        }
      } catch {
        tgUserId = null;
      }
    }
    if (!tgUserId) {
      console.warn(`[auto-reply] no tg_user_id for model=${modelId} — falling back to free album`);
    } else {
      const conn = await findActiveBusinessConnection(admin, tgUserId);
      if (!conn) {
        console.warn(
          `[auto-reply] no business connection for model=${modelId} — falling back to free album`,
        );
      } else {
        const isVideo = (u: string) => /\.(mp4|mov|m4v|webm|mkv)(\?|$)/i.test(u);
        try {
          await sendPaidMediaAsBusiness({
            connectionId: conn.connectionId,
            chatId: peerId,
            stars,
            payload: arCode ?? generatePpvCode(),
            caption: text,
            media: media.map((m) => ({
              kind: isVideo(m.mediaUrl) ? "video" : "photo",
              url: m.mediaUrl,
            })),
          });
          return;
        } catch (e) {
          console.error(
            `[auto-reply] sendPaidMediaAsBusiness failed for model=${modelId}:`,
            e instanceof Error ? e.message : e,
          );
          // Fall through to free album so the fan at least gets something.
          // The ppv_sends row already exists — flip it to 'failed' so the
          // chatter view doesn't render a virtual PPV that never landed.
          if (send) {
            try {
              const admin2 = createAdminSupabaseClient();
              await admin2
                .from("ppv_sends")
                .update({ status: "failed", error: e instanceof Error ? e.message : "sendPaidMedia failed" })
                .eq("id", send.sendId);
            } catch { /* best-effort */ }
          }
        }
      }
    }
  }

  // Free album path (stars = 0, or paid path failed): download each media
  // as a CustomFile and send as an album with the caption on the first item.
  const files: CustomFile[] = [];
  for (const m of media) {
    const cf = await customFileFromStorage(m.mediaUrl);
    if (cf) files.push(cf);
  }
  if (files.length === 0) {
    if (text) await client.sendMessage(peerId, { message: text, linkPreview: false });
    return;
  }
  await client.sendFile(peerId, {
    file: files,
    caption: text || "",
  });
}

/**
 * Attach the auto-reply handler. Safe to call multiple times — guarded by
 * the per-model `subscribed` set so HMR / pool reconnects don't pile up
 * listeners on the same client.
 */
export function subscribeAutoReplyEvents(modelId: string, client: TelegramClient) {
  const key = `auto:${modelId}`;
  if (subscribed.has(key)) return;
  subscribed.add(key);

  // Outgoing-message listener: marks (model, peer) as "human handled" so the
  // delayed auto-reply scheduler below knows to bail.
  client.addEventHandler(async (evt: NewMessageEvent) => {
    try {
      if (!evt.message.out) return;
      // peerId for outgoing in a 1-1 chat == the user we sent to.
      const peer = evt.message.peerId;
      if (!peer) return;
      // Only DMs to a user are relevant — group/channel updates have a
      // different peer shape and never trigger an auto-reply anyway.
      const peerUser = (peer as unknown as { userId?: { toString(): string } }).userId;
      const peerId = peerUser ? peerUser.toString() : null;
      if (!peerId) return;
      lastOutgoing.set(`${modelId}:${peerId}`, Math.floor(Date.now() / 1000));
    } catch { /* swallow */ }
  }, new NewMessage({ outgoing: true }));

  client.addEventHandler(async (evt: NewMessageEvent) => {
    try {
      if (evt.message.out) return; // outgoing — that's the model
      const senderId = evt.message.senderId?.toString();
      if (!senderId) return;

      // ── Freshness gate ─────────────────────────────────────────────────
      // When the keep-alive worker (or a chatter polling) reconnects a model
      // that had its NewMessage handler detached, gramJS replays the message
      // queue it missed — including DMs from HOURS ago. Without this gate the
      // model would auto-reply to ancient first-messages every reconnect.
      // Anything older than 5 minutes is treated as historical and dropped.
      const msgDate = Number(evt.message.date ?? 0);
      const nowSec = Math.floor(Date.now() / 1000);
      if (!msgDate || nowSec - msgDate > 5 * 60) return;

      // Coalesce concurrent fires from the same fan — gramJS can deliver
      // the same message twice during re-sync.
      const inflightKey = `${modelId}:${senderId}`;
      if (inflight.has(inflightKey)) return;
      inflight.add(inflightKey);

      try {
        const config = await loadModelConfig(modelId);
        if (!config || !config.auto_reply_enabled) return;
        const hasMedia =
          Array.isArray(config.auto_reply_ppv_ids) &&
          config.auto_reply_ppv_ids.length > 0;
        if (!config.auto_reply_text && !hasMedia) return;

        // Atomically CLAIM the slot: this compare-and-swaps
        // fans.auto_replied_at NULL → now() in a single UPDATE, so at most
        // ONE caller ever wins for a given (model, peer). Any concurrent
        // caller (another poll, another process instance, a fan double-message
        // in the same second) sees the flag already set and bails out here.
        const claimed = await claimAutoReplySlot(modelId, senderId);
        if (!claimed) return;
        // Optional delay (1/2/5/10/30 min, agency-configurable). Lives
        // in-process via setTimeout — won't survive a process restart, which
        // is acceptable for a "human typing" delay.
        const delaySec = Number(config.auto_reply_delay_sec ?? 0);
        // Baseline: trigger time. If anything outgoing for this conversation
        // lands AFTER this point, a human has stepped in and we skip the
        // auto-reply entirely.
        const triggeredAtSec = Math.floor(Date.now() / 1000);
        if (delaySec > 0) {
          await new Promise((res) => setTimeout(res, delaySec * 1000));
        }
        const lastOut = lastOutgoing.get(`${modelId}:${senderId}`) ?? 0;
        if (lastOut > triggeredAtSec) {
          console.log(
            `[auto-reply] skipped for model=${modelId} peer=${senderId} — chatter replied during the ${delaySec}s window`,
          );
          return;
        }
        await sendAutoReply(client, modelId, senderId, config);
        // Reflect our own send in the outgoing-trace so a second fan message
        // arriving immediately after doesn't think the model is still idle.
        lastOutgoing.set(`${modelId}:${senderId}`, Math.floor(Date.now() / 1000));
      } catch (e: unknown) {
        console.error(
          `[auto-reply] failed for model=${modelId} peer=${senderId}:`,
          e instanceof Error ? e.message : e,
        );
      } finally {
        inflight.delete(inflightKey);
      }
    } catch {
      /* never let a handler error break gramJS */
    }
  }, new NewMessage({ incoming: true }));
}

/** Pool calls this when it evicts a broken client. */
export function clearAutoReplySubscription(modelId: string) {
  subscribed.delete(`auto:${modelId}`);
}
