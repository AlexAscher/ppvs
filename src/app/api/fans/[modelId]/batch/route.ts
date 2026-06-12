import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";

/**
 * GET /api/fans/[modelId]/batch?peerIds=id1,id2,...
 *
 * Returns the emoji tags for multiple peer IDs in a single query so the
 * chat list can show fan tags next to each username without N individual
 * fetches. Caps at 300 IDs to keep the IN clause reasonable.
 *
 * Response: { tags: Record<peerId, string[]> }
 * Missing rows (fan never opened / no tags) are omitted from the map.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const rawIds = new URL(req.url).searchParams.get("peerIds") ?? "";
    const peerIds = rawIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 300);

    if (peerIds.length === 0) return Response.json({ tags: {} });

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("fans")
      .select("peer_id, tags, total_spent")
      .eq("model_id", modelId)
      .in("peer_id", peerIds);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const tags: Record<string, string[]> = {};
    const spent: Record<string, number> = {};
    type Row = { peer_id: string; tags: string[] | null; total_spent: number | string | null };
    for (const row of (data ?? []) as Row[]) {
      if (row.tags && row.tags.length > 0) {
        tags[row.peer_id] = row.tags;
      }
      const n = Number(row.total_spent ?? 0);
      if (Number.isFinite(n) && n > 0) {
        spent[row.peer_id] = n;
      }
    }

    return Response.json({ tags, spent });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
