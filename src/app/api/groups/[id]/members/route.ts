import { NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * POST   /api/groups/[id]/members { modelId, peerId } → add a fan to the group
 * DELETE /api/groups/[id]/members?modelId&peerId      → remove
 * GET    /api/groups/[id]/members                     → list { model_id, peer_id }[]
 */

async function authorizeGroup(id: string, userId: string) {
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("fan_groups")
    .select("agency_user_id")
    .eq("id", id)
    .maybeSingle();
  const g = data as { agency_user_id: string } | null;
  if (!g || g.agency_user_id !== userId) return null;
  return admin;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ssr = await createServerSupabaseClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = await authorizeGroup(id, user.id);
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    modelId?: string;
    peerId?: string;
  } | null;
  if (!body?.modelId || !body?.peerId) {
    return Response.json({ error: "modelId + peerId required" }, { status: 400 });
  }

  // Verify the model belongs to this agency to prevent cross-agency assignment.
  const { data: m } = await admin
    .from("models")
    .select("agency_user_id")
    .eq("id", body.modelId)
    .maybeSingle();
  if (!m || (m as { agency_user_id: string }).agency_user_id !== user.id) {
    return Response.json({ error: "Model not yours" }, { status: 403 });
  }

  const { error } = await admin
    .from("fan_group_memberships")
    .upsert(
      {
        group_id: id,
        model_id: body.modelId,
        peer_id: body.peerId,
      },
      { onConflict: "group_id,model_id,peer_id" },
    );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ssr = await createServerSupabaseClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = await authorizeGroup(id, user.id);
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const modelId = url.searchParams.get("modelId");
  const peerId = url.searchParams.get("peerId");
  if (!modelId || !peerId) {
    return Response.json({ error: "modelId + peerId required" }, { status: 400 });
  }

  const { error } = await admin
    .from("fan_group_memberships")
    .delete()
    .eq("group_id", id)
    .eq("model_id", modelId)
    .eq("peer_id", peerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ssr = await createServerSupabaseClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = await authorizeGroup(id, user.id);
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { data } = await admin
    .from("fan_group_memberships")
    .select("model_id, peer_id, added_at")
    .eq("group_id", id)
    .order("added_at", { ascending: false });
  return Response.json({ members: data ?? [] });
}
