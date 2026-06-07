import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";

/**
 * GET /api/fans/[modelId]/engagement?peerIds=id1,id2,...
 *
 * Returns an engagement score 0–100 per peer so the chat list can paint a
 * hot-lead dot (🟢 ≥60 / 🟡 ≥30 / 🔴 <30) next to each fan.
 *
 * We score from data we actually persist (we don't store message bodies —
 * those live in Telegram). Three signals, weighted:
 *   - Spend     (0–40): total_spent, capped at $100 → 40
 *   - Recency   (0–30): days since last_seen, linear to 0 at 30 days
 *   - Frequency (0–30): paid PPV + tip count, 5+ → 30
 *
 * Response: { scores: Record<peerId, number> }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const peerIds = (new URL(req.url).searchParams.get("peerIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 300);
    if (peerIds.length === 0) return Response.json({ scores: {} });

    const admin = createAdminSupabaseClient();

    const [fansRes, sendsRes, tipsRes] = await Promise.all([
      admin
        .from("fans")
        .select("peer_id, total_spent, last_seen_at")
        .eq("model_id", modelId)
        .in("peer_id", peerIds),
      admin
        .from("ppv_sends")
        .select("peer_id, status")
        .eq("model_id", modelId)
        .in("peer_id", peerIds)
        .in("status", ["paid", "delivered"]),
      admin
        .from("tips")
        .select("peer_id, status")
        .eq("model_id", modelId)
        .in("peer_id", peerIds)
        .eq("status", "paid"),
    ]);

    // Count paid purchases per peer.
    const purchases = new Map<string, number>();
    for (const s of (sendsRes.data ?? []) as { peer_id: string }[]) {
      purchases.set(s.peer_id, (purchases.get(s.peer_id) ?? 0) + 1);
    }
    for (const t of (tipsRes.data ?? []) as { peer_id: string }[]) {
      purchases.set(t.peer_id, (purchases.get(t.peer_id) ?? 0) + 1);
    }

    const now = Date.now();
    const scores: Record<string, number> = {};
    for (const f of (fansRes.data ?? []) as {
      peer_id: string;
      total_spent: number | string | null;
      last_seen_at: string | null;
    }[]) {
      const spent = Number(f.total_spent ?? 0);
      const spendPts = Math.min(40, (spent / 100) * 40);

      let recencyPts = 0;
      if (f.last_seen_at) {
        const days = (now - new Date(f.last_seen_at).getTime()) / 86_400_000;
        recencyPts = Math.max(0, 30 - days); // 0 at 30+ days
      }

      const count = purchases.get(f.peer_id) ?? 0;
      const freqPts = Math.min(30, count * 6);

      scores[f.peer_id] = Math.round(
        Math.max(0, Math.min(100, spendPts + recencyPts + freqPts)),
      );
    }

    return Response.json({ scores });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
