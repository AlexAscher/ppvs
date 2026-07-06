import { NewMessage, NewMessageEvent } from "telegram/events";
import { CustomFile } from "telegram/client/uploads";
import type { TelegramClient } from "telegram";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { ppvMediaPathFromUrl } from "@/lib/ppv-storage";

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

async function fanNeedsAutoReply(modelId: string, peerId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("fans")
    .select("auto_replied_at")
    .eq("model_id", modelId)
    .eq("peer_id", peerId)
    .maybeSingle();
  // No row → never been seen, definitely needs auto-reply.
  if (!data) return true;
  // Row exists but auto_replied_at is null → still a candidate.
  return !(data as { auto_replied_at: string | null }).auto_replied_at;
}

async function markFanReplied(modelId: string, peerId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  await admin.from("fans").upsert(
    {
      model_id: modelId,
      peer_id: peerId,
      auto_replied_at: new Date().toISOString(),
    },
    { onConflict: "model_id,peer_id" },
  );
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
    .select("id, media_url")
    .in("id", ppvIds);
  const byId = new Map<string, string>();
  for (const r of (data ?? []) as { id: string; media_url: string | null }[]) {
    if (r.media_url) byId.set(r.id, r.media_url);
  }
  // Preserve the agency-picked order — .in() doesn't guarantee it.
  return ppvIds
    .map((id) => ({ id, mediaUrl: byId.get(id) ?? "" }))
    .filter((x) => !!x.mediaUrl);
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

  // Stars > 0 → native Paid Media via @ppvstarbot (business connection).
  // Same code path as /api/ppv/send paid — the fan sees the blur + "Unlock
  // for ⭐ N" overlay and the chatter view renders it as a PPV bubble.
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
            // Auto-replies have no ppv_sends row, so we don't have a code to
            // pass back through the purchased_paid_media webhook. Use a
            // stable synthetic payload so the webhook can tell "this was an
            // auto-reply, no server-side fulfillment needed".
            payload: `ar_${modelId.slice(0, 8)}_${Date.now().toString(36)}`,
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

        const needs = await fanNeedsAutoReply(modelId, senderId);
        if (!needs) return;

        // Mark FIRST so a second incoming from the same fan during our
        // gramJS send doesn't trigger a duplicate auto-reply.
        await markFanReplied(modelId, senderId);
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
