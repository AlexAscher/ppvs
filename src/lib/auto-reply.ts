import { NewMessage, NewMessageEvent } from "telegram/events";
import { CustomFile } from "telegram/client/uploads";
import type { TelegramClient } from "telegram";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

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
}

const subscribed: Set<string> =
  globalThis.__ppvs_auto_reply_subscribed__ ?? new Set();
globalThis.__ppvs_auto_reply_subscribed__ = subscribed;

const inflight: Set<string> =
  globalThis.__ppvs_auto_reply_inflight__ ?? new Set();
globalThis.__ppvs_auto_reply_inflight__ = inflight;

type ModelConfig = {
  auto_reply_enabled: boolean | null;
  auto_reply_text: string | null;
  auto_reply_media_url: string | null;
  auto_reply_media_type: string | null;
};

async function loadModelConfig(modelId: string): Promise<ModelConfig | null> {
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("models")
    .select("auto_reply_enabled, auto_reply_text, auto_reply_media_url, auto_reply_media_type")
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

/** Fetch the auto-reply media from Supabase Storage and wrap as gramJS CustomFile. */
async function customFileFromUrl(url: string): Promise<CustomFile | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const name =
      url.split("/").pop()?.split("?")[0] ?? `auto_reply_${Date.now()}`;
    return new CustomFile(name, buf.length, "", buf);
  } catch {
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

  client.addEventHandler(async (evt: NewMessageEvent) => {
    try {
      if (evt.message.out) return; // outgoing — that's the model
      const senderId = evt.message.senderId?.toString();
      if (!senderId) return;

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
        await sendAutoReply(client, senderId, config);
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
