import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * POST /api/settings/agency-name { name }
 *
 * Updates the agency's name in two places so chatters always see the
 * latest value:
 *   1. auth.users.user_metadata.agency_name — the canonical source. Read
 *      by /api/chatter/agency for the chatter dashboard.
 *   2. invitations.agency_name — kept in sync so any code still reading
 *      from the invitation snapshot (legacy) doesn't get stuck on the
 *      pre-rename string.
 *
 * Only the agency itself (role === "agency") can hit this.
 */
export async function POST(req: NextRequest) {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const role = (user.user_metadata?.role as "agency" | "chatter") ?? "chatter";
  if (role !== "agency") {
    return Response.json({ error: "Only the agency can change its name" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  const next = (body?.name ?? "").trim();
  if (!next || next.length > 80) {
    return Response.json({ error: "Name must be 1–80 chars" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  // 1. Update user_metadata. We have to use the admin API because the SSR
  //    client doesn't have access to .auth.admin.* methods.
  try {
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...(user.user_metadata ?? {}), agency_name: next },
    });
  } catch (e) {
    console.error("[settings/agency-name] updateUserById failed:", e);
    return Response.json({ error: "Could not update profile" }, { status: 500 });
  }

  // 2. Keep the invitations snapshot in sync — legacy code reads from it.
  await admin
    .from("invitations")
    .update({ agency_name: next })
    .eq("agency_id", user.id);

  return Response.json({ ok: true, name: next });
}
