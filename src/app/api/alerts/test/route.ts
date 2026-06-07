import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { sendSalesAlert } from "@/lib/sales-alerts";

/**
 * POST /api/alerts/test
 *
 * Fires a dummy Sales Alert through the same path real sales use
 * (sendSalesAlert → bot DM if connected, else legacy channel). Used by
 * the "Send test" button in Settings.
 */
export async function POST() {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { data: settings } = await admin
    .from("agency_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!settings) return Response.json({ error: "No settings saved yet" }, { status: 400 });
  const s = settings as Record<string, unknown>;

  if (!s.alerts_enabled) {
    return Response.json({ error: "Enable alerts first to send a test" }, { status: 400 });
  }
  const botConnected = !!s.alerts_bot_chat_id;
  const channelConnected = !!s.alerts_channel_id && !!s.alerts_channel_access_hash;
  if (!botConnected && !channelConnected) {
    return Response.json(
      { error: "Connect the alerts bot first (tap Connect)" },
      { status: 400 },
    );
  }

  // Resolve a model name just for nicer copy; not required for bot path.
  let modelName = "Test Model";
  const { data: anyModel } = await admin
    .from("models")
    .select("id, name")
    .eq("agency_user_id", user.id)
    .limit(1)
    .maybeSingle();
  const modelId = (anyModel as { id?: string } | null)?.id ?? user.id;
  modelName = (anyModel as { name?: string } | null)?.name ?? modelName;

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
