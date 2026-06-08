import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * Fire-and-forget side effects for every INCOMING fan message, called
 * from the gramJS NewMessage handler:
 *
 *   1. Timezone histogram — bump fan_activity_hours[UTC hour] so we can
 *      later infer the fan's most-active window.
 *   2. Mass DM A/B reply tracking — if this fan received a Mass DM in the
 *      last 48h and hasn't been marked yet, stamp responded_at so the
 *      campaign's reply-rate (and A/B winner) can be computed.
 *
 * Best-effort: never throws into the event loop.
 */
export function recordIncomingMessage(modelId: string, peerId: string): void {
  void (async () => {
    try {
      const admin = createAdminSupabaseClient();
      const hour = new Date().getUTCHours();

      // 1) Activity-hour histogram (atomic upsert+increment).
      await admin
        .rpc("bump_fan_activity_hour", { p_model: modelId, p_peer: peerId, p_hour: hour })
        .then(() => undefined, () => undefined);

      // 2) Reply tracking for recent campaigns of this model.
      const sinceIso = new Date(Date.now() - 48 * 3600_000).toISOString();
      const { data: camps } = await admin
        .from("mass_dm_campaigns")
        .select("id")
        .eq("model_id", modelId)
        .gte("created_at", sinceIso);
      const campIds = ((camps ?? []) as { id: string }[]).map((c) => c.id);
      if (campIds.length) {
        await admin
          .from("mass_dm_recipients")
          .update({ responded_at: new Date().toISOString() })
          .in("campaign_id", campIds)
          .eq("peer_id", peerId)
          .eq("status", "sent")
          .is("responded_at", null);
      }
    } catch {
      /* swallow */
    }
  })();
}
