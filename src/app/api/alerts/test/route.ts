import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { sendSalesAlert } from "@/lib/sales-alerts";

/**
 * POST /api/alerts/test
 *
 * Sends a dummy Sales Alert to the agency's configured channel using a
 * connected model session. Used by the "Send test" button in Settings.
 */
export async function POST() {
  const ssr = await createServerSupabaseClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();

  const { data: settings } = await admin
    .from("agency_settings")
    .select(
      "alerts_enabled, alerts_channel_id, alerts_channel_access_hash, alerts_sender_model_id",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (!settings) return Response.json({ error: "No settings saved yet" }, { status: 400 });
  const s = settings as {
    alerts_enabled: boolean;
    alerts_channel_id: string | null;
    alerts_channel_access_hash: string | null;
    alerts_sender_model_id: string | null;
  };
  if (!s.alerts_channel_id || !s.alerts_channel_access_hash) {
    return Response.json({ error: "Channel not selected" }, { status: 400 });
  }

  // Pick any connected model as the sender if none configured.
  let modelId = s.alerts_sender_model_id;
  let modelName = "Test Model";
  if (!modelId) {
    const { data: anyModel } = await admin
      .from("models")
      .select("id, name")
      .eq("agency_user_id", user.id)
      .neq("session_string", null)
      .limit(1)
      .maybeSingle();
    if (anyModel) {
      modelId = (anyModel as { id: string }).id;
      modelName = (anyModel as { name: string }).name;
    }
  } else {
    const { data: m } = await admin
      .from("models")
      .select("name")
      .eq("id", modelId)
      .maybeSingle();
    modelName = (m as { name?: string } | null)?.name ?? modelName;
  }
  if (!modelId) {
    return Response.json({ error: "No connected models — connect one first" }, { status: 400 });
  }

  // We *force* alerts_enabled=true at the source by inserting a temp
  // event regardless of the toggle. sendSalesAlert re-checks settings,
  // so flip alerts_enabled temporarily? No — easier: just bypass and
  // send a sample message directly through the same code path by
  // requiring alerts_enabled to already be true here.
  if (!s.alerts_enabled) {
    return Response.json(
      { error: "Enable alerts first to send a test" },
      { status: 400 },
    );
  }

  sendSalesAlert({
    type: "ppv",
    agencyUserId: user.id,
    modelId,
    modelName,
    fanDisplay: "@test_fan",
    amount: 42,
    itemName: "Test alert",
  });
  return Response.json({ ok: true });
}
