import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";

/**
 * GET /api/ppv/pricing-stats?modelId=<uuid>
 *
 * Pure stats (no AI) to help a chatter price a send: average paid PPV,
 * the most common price bucket, and the highest sale. Surfaced in the
 * send panel so they don't under-price.
 *
 * Response: { avgPaid, sales, commonRange, topSale }
 */
export async function GET(req: NextRequest) {
  try {
    const modelId = new URL(req.url).searchParams.get("modelId") ?? "";
    if (!modelId) return Response.json({ error: "modelId required" }, { status: 400 });
    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const admin = createAdminSupabaseClient();
    const { data } = await admin
      .from("ppv_sends")
      .select("total_price, status")
      .eq("model_id", modelId)
      .in("status", ["paid", "delivered"])
      .limit(2000);

    const prices = ((data ?? []) as { total_price: number | string }[])
      .map((s) => Number(s.total_price ?? 0))
      .filter((p) => p > 0);

    if (prices.length === 0) {
      return Response.json({ avgPaid: 0, sales: 0, commonRange: null, topSale: 0 });
    }

    const avgPaid = Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100;
    const topSale = Math.max(...prices);

    // Modal price bucket.
    const buckets: [string, (p: number) => boolean][] = [
      ["$5–15", (p) => p >= 5 && p < 15],
      ["$15–25", (p) => p >= 15 && p < 25],
      ["$25–40", (p) => p >= 25 && p < 40],
      ["$40–60", (p) => p >= 40 && p < 60],
      ["$60+", (p) => p >= 60],
      ["under $5", (p) => p < 5],
    ];
    let commonRange: string | null = null;
    let best = -1;
    for (const [label, test] of buckets) {
      const c = prices.filter(test).length;
      if (c > best) {
        best = c;
        commonRange = label;
      }
    }

    return Response.json({ avgPaid, sales: prices.length, commonRange, topSale });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
