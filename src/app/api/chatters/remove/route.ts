import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * POST /api/chatters/remove  { chatterId }
 *
 * Removes a chatter from the agency entirely — deletes EVERY model
 * assignment row for (agency, chatter). Used by the "Remove from team"
 * action, which must clear all of a multi-model chatter's rows, not just
 * one. Scoped to the caller's own agency_id so it can't touch other teams.
 */
export async function POST(req: NextRequest) {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { chatterId?: string };
  const chatterId = typeof body.chatterId === "string" ? body.chatterId : "";
  if (!chatterId) return Response.json({ error: "chatterId required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("agency_chatters")
    .delete()
    .eq("agency_id", user.id)
    .eq("chatter_id", chatterId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
