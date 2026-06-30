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
  auto_reply_media_url: string | null;
  auto_reply_media_type: string | null;
  auto_reply_delay_sec: number | null;
};

async function loadModelConfig(modelId: string): Promise<ModelConfig | null> {
  const admin = createAdminSupabaseClient();
  // select * so the optional auto_reply_delay_sec column comes through on
  // newer schemas without breaking on older ones.
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

/** Fetch the auto-reply media and wrap as a gramJS CustomFile.
 *
 *  ppvs bucket is private — a plain GET on the public URL returns 400 — so
 *  Supabase-storage URLs are downloaded via the service-role admin client.
 *  Other URLs go through plain fetch.
 */
async function customFileFromUrl(url: string): Promise<CustomFile | null> {
  try {
    const path = ppvMediaPathFromUrl(url);
    if (path) {
      const admin = createAdminSupabaseClient();
      const { data, error } = await admin.storage.from("ppvs").download(path);
      if (error || !data) {
        console.error("[auto-reply] storage download failed:", path, error?.message ?? "no data");
        return null;
      }
      const buf = Buffer.from(await data.arrayBuffer());
      const name = path.split("/").pop() ?? `auto_reply_${Date.now()}`;
      return new CustomFile(name, buf.length, "", buf);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      console.error("[auto-reply] fetch failed:", url, `HTTP ${res.status}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const name = url.split("/").pop()?.split("?")[0] ?? `auto_reply_${Date.now()}`;
    return new CustomFile(name, buf.length, "", buf);
  } catch (e) {
    console.error("[auto-reply] customFile error:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function sendAutoReply(
  client: TelegramClient,
  peerId: string,
  config: ModelConfig,
): Promise<void> {
  const text = (config.auto_reply_text ?? "").trim();
  const mediaUrl = config.auto_reply_media_url ?? "";

  // Media + text → caption on the media. Text only → plain message. Media
  // only → file with no caption. None → no-op.
  if (mediaUrl) {
    const file = await customFileFromUrl(mediaUrl);
    if (file) {
      await client.sendFile(peerId, {
        file,
        caption: text || "",
      });
      return;
    }
    // Media download failed — fall back to text-only if we have it.
  }

  if (text) {
    await client.sendMessage(peerId, { message: text, linkPreview: false });
  }
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
        if (!config.auto_reply_text && !config.auto_reply_media_url) return;

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
        await sendAutoReply(client, senderId, config);
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
