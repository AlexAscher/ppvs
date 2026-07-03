import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * POST /api/signup-request
 *  { email, displayName, role, agencyName }
 *
 * v3 (temporary): signups no longer hit Supabase Auth directly — they land
 * in signup_requests for a human to review. Response is 200 as long as we
 * managed to persist (or de-dupe against) a pending row.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
    displayName?: string;
    role?: string;
    agencyName?: string | null;
  } | null;
  const email = (body?.email ?? "").trim().toLowerCase();
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return Response.json({ error: "A valid email is required" }, { status: 400 });
  }
  const displayName = (body?.displayName ?? "").trim() || null;
  const role = body?.role === "chatter" ? "chatter" : "agency";
  const agencyName = role === "agency" ? (body?.agencyName ?? "").trim() || null : null;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("signup_requests")
    .insert({ email, display_name: displayName, role, agency_name: agencyName, status: "pending" })
    .select("id")
    .single();
  if (error) {
    // 23505 = unique violation on the "pending email" partial index — the user
    // clicked submit twice or is retrying. Treat as success from their POV.
    if ((error as { code?: string }).code === "23505") {
      return Response.json({ ok: true, deduplicated: true });
    }
    console.error("[signup-request] insert failed:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, id: data.id });
}
