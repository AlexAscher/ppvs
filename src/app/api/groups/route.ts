import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET /api/groups → list this agency's fan groups (with member count)
 * POST /api/groups { name, color?, emoji? } → create a new group
 */

export async function GET() {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { data: groups } = await admin
    .from("fan_groups")
    .select("id, name, color, emoji, position")
    .eq("agency_user_id", user.id)
    .order("position", { ascending: true });

  type GroupRow = { id: string; name: string; color: string; emoji: string | null; position: number };
  const list = (groups ?? []) as GroupRow[];
  if (!list.length) return Response.json({ groups: [] });

  // Aggregate member counts per group in one query.
  const ids = list.map((g) => g.id);
  const { data: countsRaw } = await admin
    .from("fan_group_memberships")
    .select("group_id")
    .in("group_id", ids);
  type CountRow = { group_id: string };
  const counts = (countsRaw ?? []) as CountRow[];
  const sizeByGroup = new Map<string, number>();
  for (const c of counts) {
    sizeByGroup.set(c.group_id, (sizeByGroup.get(c.group_id) ?? 0) + 1);
  }

  return Response.json({
    groups: list.map((g) => ({ ...g, memberCount: sizeByGroup.get(g.id) ?? 0 })),
  });
}

export async function POST(req: NextRequest) {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    color?: string;
    emoji?: string | null;
    position?: number;
  } | null;
  if (!body?.name?.trim()) {
    return Response.json({ error: "name required" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("fan_groups")
    .insert({
      agency_user_id: user.id,
      name: body.name.trim().slice(0, 60),
      color: body.color?.match(/^#[0-9a-f]{3,8}$/i) ? body.color : "#00AFF0",
      emoji: body.emoji?.slice(0, 8) ?? null,
      position: body.position ?? 0,
    })
    .select("id, name, color, emoji, position")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ group: { ...data, memberCount: 0 } });
}
