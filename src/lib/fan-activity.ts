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
 * Best-effort: never throws into the event loop, but logs failures via
 * console.warn so we can spot RLS / column-missing regressions.
 */
export function recordIncomingMessage(modelId: string, peerId: string): void {
  recordIncomingMessageAt(modelId, peerId, new Date().toISOString());
}

/**
 * Variant of recordIncomingMessage that lets the caller specify the
 * timestamp explicitly — used by the dialogs poll route to backfill
 * `last_response_at` from the most-recent INCOMING message Telegram
 * already remembers (so existing fans get a value the first time the
 * chatter opens the inbox after deploy, not just on future replies).
 */
export function recordIncomingMessageAt(
  modelId: string,
  peerId: string,
  atIso: string,
): void {
  void (async () => {
    try {
      const admin = createAdminSupabaseClient();
      const hour = new Date(atIso).getUTCHours();

      // 1) Activity-hour histogram (atomic upsert+increment). Older
      //    deployments without the RPC just log PGRST202 and continue.
      const rpcRes = await admin.rpc("bump_fan_activity_hour", {
        p_model: modelId,
        p_peer: peerId,
        p_hour: hour,
      });
      if (rpcRes.error && rpcRes.error.code !== "PGRST202") {
        console.warn("[fan-activity] bump_fan_activity_hour:", rpcRes.error.message);
      }

      // 2) Bump last_response_at on the fan row.
      const upd = await admin
        .from("fans")
        .update({ last_response_at: atIso })
        .eq("model_id", modelId)
        .eq("peer_id", peerId);
      if (upd.error) {
        console.warn("[fan-activity] last_response_at:", upd.error.message);
      }
    } catch (e) {
      console.warn(
        "[fan-activity] recordIncomingMessage failed:",
        e instanceof Error ? e.message : e,
      );
    }
  })();
}

/**
 * Fire-and-forget — bump fans.last_read_at to NOW when we detect the fan
 * has just read one of our outgoing messages (the dialog's
 * readOutboxMaxId moved). Called from the dialogs poll route after it
 * sees a per-fan increase (or first-sight seed so the value isn't
 * forever NULL on legacy rows).
 */
export function recordFanRead(modelId: string, peerId: string): void {
  void (async () => {
    try {
      const admin = createAdminSupabaseClient();
      const upd = await admin
        .from("fans")
        .update({ last_read_at: new Date().toISOString() })
        .eq("model_id", modelId)
        .eq("peer_id", peerId);
      if (upd.error) {
        console.warn("[fan-activity] last_read_at:", upd.error.message);
      }
    } catch (e) {
      console.warn(
        "[fan-activity] recordFanRead failed:",
        e instanceof Error ? e.message : e,
      );
    }
  })();
}
