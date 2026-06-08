import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * POST /api/presence  → heartbeat (upsert my last_seen_at = now)
 * GET  /api/presence  → { presence: { [userId]: lastSeenIso } } for the
 *                       agency's chatters (so the Chatters tab can show
 *                       online dots + "last active").
 */
export async function POST() {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();
  await admin
    .from("chatter_presence")
    .upsert(
      { user_id: user.id, last_seen_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  return Response.json({ ok: true });
}

export async function GET() {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();
  // The chatters working for this agency.
  const { data: links } = await admin
    .from("agency_chatters")
    .select("chatter_id")
    .eq("agency_id", user.id);
  const ids = [...new Set(((links ?? []) as { chatter_id: string }[]).map((l) => l.chatter_id))];
  if (ids.length === 0) return Response.json({ presence: {} });

  const { data: rows } = await admin
    .from("chatter_presence")
    .select("user_id, last_seen_at")
    .in("user_id", ids);

  const presence: Record<string, string> = {};
  for (const r of (rows ?? []) as { user_id: string; last_seen_at: string }[]) {
    presence[r.user_id] = r.last_seen_at;
  }
  return Response.json({ presence });
}
