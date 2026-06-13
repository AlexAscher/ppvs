import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET /api/chatter/agency
 *
 * Returns the live agency name + model assignment for the calling chatter.
 * Used instead of `invitations.agency_name` (which is captured at invite
 * time and can go stale when the agency renames itself in Settings).
 *
 * Response: { agencyName: string|null, modelId: string|null, modelName: string|null }
 */
export async function GET() {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { data: link } = await admin
    .from("agency_chatters")
    .select("agency_id, model_id")
    .eq("chatter_id", user.id)
    .maybeSingle();
  const row = link as { agency_id: string | null; model_id: string | null } | null;
  if (!row?.agency_id) {
    return Response.json({ agencyName: null, modelId: null, modelName: null });
  }

  // Live agency_name from auth.users.user_metadata (set during signup and
  // editable via /api/settings/agency-name). Fall back to invitation
  // record if the metadata field is missing (agencies that pre-date the
  // signup field).
  let agencyName: string | null = null;
  try {
    const u = await admin.auth.admin.getUserById(row.agency_id);
    const md = (u.data?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const fromMeta = (md.agency_name as string | undefined)?.trim();
    agencyName = fromMeta || null;
  } catch {
    /* fall back to invitation lookup below */
  }
  if (!agencyName) {
    const { data: inv } = await admin
      .from("invitations")
      .select("agency_name")
      .eq("agency_id", row.agency_id)
      .eq("chatter_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    agencyName = (inv as { agency_name: string | null } | null)?.agency_name ?? null;
  }

  let modelName: string | null = null;
  if (row.model_id) {
    const { data: m } = await admin
      .from("models")
      .select("name")
      .eq("id", row.model_id)
      .maybeSingle();
    modelName = (m as { name: string | null } | null)?.name ?? null;
  }

  return Response.json({
    agencyName: agencyName ?? "Agency",
    modelId: row.model_id,
    modelName,
  });
}
