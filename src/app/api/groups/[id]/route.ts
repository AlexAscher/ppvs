import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * PATCH /api/groups/[id] { name?, color?, emoji?, position? } — rename / recolor / reorder
 * DELETE /api/groups/[id] — delete (memberships cascade)
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    color?: string;
    emoji?: string | null;
    position?: number;
  } | null;
  if (!body) return Response.json({ error: "Bad JSON" }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name) update.name = body.name.trim().slice(0, 60);
  if (body.color?.match(/^#[0-9a-f]{3,8}$/i)) update.color = body.color;
  if (body.emoji !== undefined) update.emoji = body.emoji?.slice(0, 8) ?? null;
  if (typeof body.position === "number") update.position = body.position;

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("fan_groups")
    .update(update)
    .eq("id", id)
    .eq("agency_user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("fan_groups")
    .delete()
    .eq("id", id)
    .eq("agency_user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
