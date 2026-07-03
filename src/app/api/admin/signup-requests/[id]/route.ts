import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * POST /api/admin/signup-requests/:id  { action: "approve" | "reject" }
 *
 * approve → create the Supabase Auth user from the stored request (email +
 *   password + role metadata), email pre-confirmed so they can log in
 *   immediately. Marks the request approved.
 * reject  → marks the request rejected. No account created.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action;
  if (action !== "approve" && action !== "reject") {
    return Response.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: reqRow, error: fetchErr } = await admin
    .from("signup_requests")
    .select("id, email, password, display_name, role, agency_name, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return Response.json({ error: fetchErr.message }, { status: 500 });
  if (!reqRow) return Response.json({ error: "Request not found" }, { status: 404 });
  const r = reqRow as {
    email: string; password: string | null; display_name: string | null;
    role: string; agency_name: string | null; status: string;
  };

  if (action === "reject") {
    await admin.from("signup_requests").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", id);
    return Response.json({ ok: true, status: "rejected" });
  }

  // approve → create the account
  if (!r.password) {
    return Response.json({ error: "No password stored for this request — reject and ask them to re-apply." }, { status: 400 });
  }
  const { error: createErr } = await admin.auth.admin.createUser({
    email: r.email,
    password: r.password,
    email_confirm: true,
    user_metadata: {
      display_name: r.display_name ?? undefined,
      role: r.role,
      agency_name: r.role === "agency" ? (r.agency_name ?? undefined) : undefined,
    },
  });
  if (createErr) {
    return Response.json({ error: `Could not create account: ${createErr.message}` }, { status: 400 });
  }
  await admin
    .from("signup_requests")
    .update({ status: "approved", reviewed_at: new Date().toISOString(), password: null })
    .eq("id", id);
  return Response.json({ ok: true, status: "approved" });
}
