import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";

/**
 * GET /api/fans/[modelId]/stats?peerId=…
 *
 * Per-fan spending summary for the profile drawer. Counts PPV unlocks +
 * paid tips for this fan, with this creator's model. We compute three
 * averages and one count:
 *   - avgPpv  : mean total_price of paid/delivered PPVs to this fan.
 *   - avgTip  : mean amount of paid tips from this fan.
 *   - purchased : ppv unlocks + paid tips (a single "purchase events" counter).
 * Plus rawSpent (for buying-power) and ppvCount / tipCount as a breakdown.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const peerId = new URL(req.url).searchParams.get("peerId");
    if (!peerId) return Response.json({ error: "peerId required" }, { status: 400 });

    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const admin = createAdminSupabaseClient();
    const [ppvRes, tipRes] = await Promise.all([
      admin
        .from("ppv_sends")
        .select("total_price, status")
        .eq("model_id", modelId)
        .eq("peer_id", peerId)
        .in("status", ["paid", "delivered"]),
      admin
        .from("tips")
        .select("amount, status")
        .eq("model_id", modelId)
        .eq("peer_id", peerId)
        .eq("status", "paid"),
    ]);

    type PpvRow = { total_price: number | string };
    type TipRow = { amount: number | string };
    const ppvs = (ppvRes.data ?? []) as PpvRow[];
    const tips = (tipRes.data ?? []) as TipRow[];

    let ppvSum = 0;
    for (const p of ppvs) ppvSum += Number(p.total_price ?? 0);
    let tipSum = 0;
    for (const t of tips) tipSum += Number(t.amount ?? 0);

    const round = (n: number) => Math.round(n * 100) / 100;

    return Response.json({
      ppvCount: ppvs.length,
      tipCount: tips.length,
      purchased: ppvs.length + tips.length,
      avgPpv: ppvs.length > 0 ? round(ppvSum / ppvs.length) : 0,
      avgTip: tips.length > 0 ? round(tipSum / tips.length) : 0,
      rawSpent: round(ppvSum + tipSum),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
