import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET  /api/labels/status?modelId&peerIds=p1,p2  → { byPeer: { peerId: labelId } }
 * POST /api/labels/status { modelId, peerId, labelId|null } → set / clear status
 *
 * One status per (model, peer). labelId=null clears it.
 */
async function ownsModel(admin: ReturnType<typeof createAdminSupabaseClient>, modelId: string, userId: string) {
  const { data } = await admin.from("models").select("agency_user_id").eq("id", modelId).maybeSingle();
  return !!data && (data as { agency_user_id: string }).agency_user_id === userId;
}

export async function GET(req: NextRequest) {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const modelId = url.searchParams.get("modelId");
  if (!modelId) return Response.json({ error: "modelId required" }, { status: 400 });
  const admin = createAdminSupabaseClient();
  if (!(await ownsModel(admin, modelId, user.id))) return Response.json({ error: "Forbidden" }, { status: 403 });

  const peerIds = (url.searchParams.get("peerIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 300);
  if (!peerIds.length) return Response.json({ byPeer: {} });

  const { data } = await admin
    .from("conversation_status")
    .select("peer_id, label_id")
    .eq("model_id", modelId)
    .in("peer_id", peerIds);
  const byPeer: Record<string, string> = {};
  for (const r of (data ?? []) as { peer_id: string; label_id: string }[]) byPeer[r.peer_id] = r.label_id;
  return Response.json({ byPeer });
}

export async function POST(req: NextRequest) {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { modelId?: string; peerId?: string; labelId?: string | null } | null;
  if (!body?.modelId || !body?.peerId) return Response.json({ error: "modelId + peerId required" }, { status: 400 });
  const admin = createAdminSupabaseClient();
  if (!(await ownsModel(admin, body.modelId, user.id))) return Response.json({ error: "Forbidden" }, { status: 403 });

  if (!body.labelId) {
    await admin.from("conversation_status").delete().eq("model_id", body.modelId).eq("peer_id", body.peerId);
    return Response.json({ ok: true });
  }
  const { error } = await admin
    .from("conversation_status")
    .upsert(
      { model_id: body.modelId, peer_id: body.peerId, label_id: body.labelId, updated_at: new Date().toISOString() },
      { onConflict: "model_id,peer_id" },
    );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
