import { after } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { runCampaign } from "@/lib/mass-dm";

/**
 * POST /api/mass-dm/[id]/start
 *
 * Marks the campaign 'running' and kicks the worker loop via Next 16's
 * after() — the API responds immediately while the worker continues
 * iterating recipients. On Vercel, maxDuration would cap this; on the
 * self-hosted Contabo target, the long-running Node server keeps the
 * worker alive as long as the process is up.
 *
 * Restart story: if the process dies mid-campaign, the row stays
 * 'running' with a stale last_heartbeat_at. A future /resume endpoint
 * (or process-startup reaper) re-invokes runCampaign(id) and the loop
 * picks up where it left off (pending recipients in ordinal order).
 */
export const maxDuration = 3600;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ssr = await createServerSupabaseClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { data: c } = await admin
    .from("mass_dm_campaigns")
    .select("id, agency_user_id, started_by, status")
    .eq("id", id)
    .maybeSingle();
  if (!c) return Response.json({ error: "Campaign not found" }, { status: 404 });
  const camp = c as { agency_user_id: string; started_by: string; status: string };
  if (camp.agency_user_id !== user.id && camp.started_by !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (camp.status === "completed" || camp.status === "cancelled") {
    return Response.json({ error: `Already ${camp.status}` }, { status: 400 });
  }

  after(async () => {
    await runCampaign(id);
  });

  return Response.json({ ok: true });
}
