import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * POST /api/mass-dm/[id]/stop
 *
 * Flips campaign status to 'cancelled' — the worker loop checks the
 * status field every iteration and bails out cleanly. Recipients that
 * have already been sent are kept (status='sent'); the remaining
 * 'pending' rows just stay pending.
 */
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
    .select("agency_user_id, started_by, status")
    .eq("id", id)
    .maybeSingle();
  if (!c) return Response.json({ error: "Not found" }, { status: 404 });
  const camp = c as { agency_user_id: string; started_by: string; status: string };
  if (camp.agency_user_id !== user.id && camp.started_by !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (camp.status === "completed" || camp.status === "cancelled") {
    return Response.json({ ok: true, alreadyDone: true });
  }

  await admin
    .from("mass_dm_campaigns")
    .update({
      status: "cancelled",
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
  return Response.json({ ok: true });
}
