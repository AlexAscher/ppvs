import { requireAdmin } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET /api/admin/signup-requests
 *
 * Returns pending + recently-reviewed signup requests for the admin panel
 * tab. Each row is annotated with `emailInUse: true` when a Supabase Auth
 * user with the same email already exists — the UI paints that row red so
 * the admin can spot duplicate attempts at a glance.
 */
export async function GET() {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("signup_requests")
    .select("id, email, display_name, role, agency_name, status, created_at, reviewed_at, note")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as {
    id: string; email: string; display_name: string | null; role: string;
    agency_name: string | null; status: string; created_at: string;
    reviewed_at: string | null; note: string | null;
  }[];

  // Build a lowercase set of existing auth emails so we can annotate each
  // request. listUsers paginates at 1000/page — we scan every page.
  const existing = new Set<string>();
  try {
    const PER_PAGE = 1000;
    for (let page = 1; page <= 100; page++) {
      const { data: users, error: uErr } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
      if (uErr) break;
      for (const u of users.users) if (u.email) existing.add(u.email.toLowerCase());
      if (users.users.length < PER_PAGE) break;
    }
  } catch {
    /* best-effort — admin still sees the list, just without duplicate flags */
  }

  return Response.json({
    requests: rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      role: r.role,
      agencyName: r.agency_name,
      status: r.status,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
      note: r.note,
      emailInUse: existing.has(r.email.toLowerCase()),
    })),
  });
}
