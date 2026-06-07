import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET /api/groups/for-fan?modelId&peerId
 *
 * Returns the groups (id + name + color + emoji) the (model, peer) pair
 * is a member of. Used by FanProfileDrawer to render group chips and
 * by the chat list to colour-code rows.
 *
 * Also handy in batch: pass `peerIds=p1,p2,p3` to get a map
 * `{ peerId: GroupChip[] }` for the chat list filter painter.
 */

export async function GET(req: NextRequest) {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const modelId = url.searchParams.get("modelId");
  const peerId = url.searchParams.get("peerId");
  const peerIdsRaw = url.searchParams.get("peerIds");
  if (!modelId) return Response.json({ error: "modelId required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  // Verify the model belongs to the caller's agency before any data leaks.
  const { data: m } = await admin
    .from("models")
    .select("agency_user_id")
    .eq("id", modelId)
    .maybeSingle();
  if (!m || (m as { agency_user_id: string }).agency_user_id !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (peerIdsRaw) {
    const peerIds = peerIdsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 300);
    if (!peerIds.length) return Response.json({ byPeer: {} });

    const { data: memsRaw } = await admin
      .from("fan_group_memberships")
      .select("peer_id, group_id, fan_groups(id, name, color, emoji)")
      .eq("model_id", modelId)
      .in("peer_id", peerIds);

    type MemRow = {
      peer_id: string;
      group_id: string;
      fan_groups:
        | { id: string; name: string; color: string; emoji: string | null }
        | { id: string; name: string; color: string; emoji: string | null }[]
        | null;
    };
    const byPeer: Record<
      string,
      { id: string; name: string; color: string; emoji: string | null }[]
    > = {};
    for (const r of (memsRaw ?? []) as MemRow[]) {
      const g = Array.isArray(r.fan_groups) ? r.fan_groups[0] : r.fan_groups;
      if (!g) continue;
      const arr = byPeer[r.peer_id] ?? [];
      arr.push(g);
      byPeer[r.peer_id] = arr;
    }
    return Response.json({ byPeer });
  }

  if (!peerId) {
    return Response.json({ error: "peerId or peerIds required" }, { status: 400 });
  }

  const { data: memsRaw } = await admin
    .from("fan_group_memberships")
    .select("group_id, fan_groups(id, name, color, emoji)")
    .eq("model_id", modelId)
    .eq("peer_id", peerId);
  type MemRow = {
    group_id: string;
    fan_groups:
      | { id: string; name: string; color: string; emoji: string | null }
      | { id: string; name: string; color: string; emoji: string | null }[]
      | null;
  };
  const out: { id: string; name: string; color: string; emoji: string | null }[] = [];
  for (const r of (memsRaw ?? []) as MemRow[]) {
    const g = Array.isArray(r.fan_groups) ? r.fan_groups[0] : r.fan_groups;
    if (g) out.push(g);
  }
  return Response.json({ groups: out });
}
