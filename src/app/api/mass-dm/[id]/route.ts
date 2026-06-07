import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET /api/mass-dm/[id] → { campaign, recentSent, recentFailed }
 *
 * Returns campaign row + a sample of recently-sent / recently-failed
 * recipients so the live UI can show the progress feed.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { data: campaign } = await admin
    .from("mass_dm_campaigns")
    .select(
      "id, model_id, message, filters, status, total_recipients, sent_count, failed_count, started_at, finished_at, last_heartbeat_at, created_at, agency_user_id, started_by",
    )
    .eq("id", id)
    .maybeSingle();
  if (!campaign) return Response.json({ error: "Not found" }, { status: 404 });
  const camp = campaign as {
    agency_user_id: string;
    started_by: string;
    [k: string]: unknown;
  };
  if (camp.agency_user_id !== user.id && camp.started_by !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [sentRes, failedRes] = await Promise.all([
    admin
      .from("mass_dm_recipients")
      .select("peer_username, first_name, sent_at")
      .eq("campaign_id", id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(8),
    admin
      .from("mass_dm_recipients")
      .select("peer_username, first_name, error")
      .eq("campaign_id", id)
      .eq("status", "failed")
      .order("ordinal", { ascending: false })
      .limit(8),
  ]);

  return Response.json({
    campaign,
    recentSent: sentRes.data ?? [],
    recentFailed: failedRes.data ?? [],
  });
}
