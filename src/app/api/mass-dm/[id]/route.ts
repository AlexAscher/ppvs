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

  // A/B breakdown: sent + replied per variant (best-effort; columns are
  // optional). responded_at is stamped by the incoming-message hook.
  let ab: { a: { sent: number; replied: number }; b: { sent: number; replied: number } } | null = null;
  if ((camp as { is_ab?: boolean }).is_ab) {
    const cnt = async (variant: string, replied: boolean) => {
      let q = admin
        .from("mass_dm_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("variant", variant)
        .eq("status", "sent");
      if (replied) q = q.not("responded_at", "is", null);
      const r = await q;
      return r.count ?? 0;
    };
    try {
      const [aSent, aRep, bSent, bRep] = await Promise.all([
        cnt("a", false), cnt("a", true), cnt("b", false), cnt("b", true),
      ]);
      ab = { a: { sent: aSent, replied: aRep }, b: { sent: bSent, replied: bRep } };
    } catch {
      ab = null;
    }
  }

  return Response.json({
    campaign,
    recentSent: sentRes.data ?? [],
    recentFailed: failedRes.data ?? [],
    ab,
  });
}
