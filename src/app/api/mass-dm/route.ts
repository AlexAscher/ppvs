import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET /api/mass-dm → list this agency's campaigns (most recent first).
 */
export async function GET() {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("mass_dm_campaigns")
    .select(
      "id, model_id, message, status, total_recipients, sent_count, failed_count, started_at, finished_at, created_at",
    )
    .eq("agency_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(40);

  return Response.json({ campaigns: data ?? [] });
}
