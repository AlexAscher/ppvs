import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * Fire-and-forget side effects for every INCOMING fan message, called
 * from the gramJS NewMessage handler:
 *
 *   1. Timezone histogram — bump fan_activity_hours[UTC hour] so we can
 *      later infer the fan's most-active window.
 *   2. Bump fans.last_response_at so the Fan Profile drawer can show how
 *      recently the fan messaged us.
 *
 * Best-effort: never throws into the event loop.
 */
export function recordIncomingMessage(modelId: string, peerId: string): void {
  void (async () => {
    try {
      const admin = createAdminSupabaseClient();
      const nowIso = new Date().toISOString();
      const hour = new Date().getUTCHours();

      // 1) Activity-hour histogram (atomic upsert+increment).
      await admin
        .rpc("bump_fan_activity_hour", { p_model: modelId, p_peer: peerId, p_hour: hour })
        .then(() => undefined, () => undefined);

      // 2) Bump last_response_at on the fan row. Tolerant of older schemas
      //    where the column doesn't exist yet — the update just errors and
      //    we ignore it (best-effort path).
      await admin
        .from("fans")
        .update({ last_response_at: nowIso })
        .eq("model_id", modelId)
        .eq("peer_id", peerId)
        .then(() => undefined, () => undefined);
    } catch {
      /* swallow */
    }
  })();
}

/**
 * Fire-and-forget — bump fans.last_read_at to NOW when we detect the fan
 * has just read one of our outgoing messages (the dialog's
 * readOutboxMaxId moved). Called from the dialogs poll route after it
 * sees a per-fan increase.
 */
export function recordFanRead(modelId: string, peerId: string): void {
  void (async () => {
    try {
      const admin = createAdminSupabaseClient();
      await admin
        .from("fans")
        .update({ last_read_at: new Date().toISOString() })
        .eq("model_id", modelId)
        .eq("peer_id", peerId)
        .then(() => undefined, () => undefined);
    } catch {
      /* swallow */
    }
  })();
}
