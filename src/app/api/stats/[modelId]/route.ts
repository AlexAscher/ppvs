import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { withTimeout } from "@/lib/with-timeout";
import { agencyNet } from "@/lib/platform";

// Hard cap so a saturated uplink can't pin this route for 70s. On
// timeout we 503 and the client keeps its last-known stats.
const STATS_QUERY_TIMEOUT_MS = 12_000;

/**
 * Aggregate stats for the chatter UI Stats tab. Computes from `ppv_sends`
 * server-side (no SQL function needed — we keep it as a single SELECT and
 * fold the math in JS, since volumes are small per model per query).
 *
 * Scopes:
 *   - "model": all sends for this model (default)
 *   - "me":    only sends this chatter made (chatter_id = caller)
 *
 * Returns (USD numbers as raw integers/floats, no `$` prefix):
 *   - todayNet, allTimeNet               — sum of total_price WHERE delivered
 *   - todaySales, allTimeSales           — count of sends WHERE delivered
 *   - unlocks                            — alias for allTimeSales (UI label)
 *   - todayMessages, allTimeMessages     — count of ppv_sends rows total
 *
 * Note: a real "messages count" would need a separate Telegram sync — that
 * lives later. For now "messages" = PPV sends, which is what the chatter
 * actually moves.
 */

type SendStatRow = {
  status: string;
  total_price: number;
  created_at: string;
};

function isToday(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") === "me" ? "me" : "model";

    const admin = createAdminSupabaseClient();
    let q = admin
      .from("ppv_sends")
      .select("status, total_price, created_at")
      .eq("model_id", modelId);
    if (scope === "me") q = q.eq("chatter_id", auth.userId);

    let data: SendStatRow[] | null;
    let error: { message: string } | null;
    try {
      const res = await withTimeout(
        Promise.resolve(q),
        STATS_QUERY_TIMEOUT_MS,
        "stats query",
      );
      data = res.data as SendStatRow[] | null;
      error = res.error;
    } catch {
      // Timed out — tell the client to keep last-known stats (it ignores
      // non-OK responses) rather than flashing zeros.
      return Response.json({ error: "stats timed out" }, { status: 503 });
    }
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const rows = data ?? [];
    const now = new Date();

    let todayNet = 0;
    let allTimeNet = 0;
    let todaySales = 0;
    let allTimeSales = 0;
    let todayMessages = 0;
    const allTimeMessages = rows.length;

    for (const r of rows) {
      const t = isToday(r.created_at, now);
      if (t) todayMessages += 1;
      if (r.status === "delivered" || r.status === "paid") {
        const price = Number(r.total_price ?? 0);
        allTimeNet += price;
        allTimeSales += 1;
        if (t) {
          todayNet += price;
          todaySales += 1;
        }
      }
    }

    return Response.json({
      todayNet,
      allTimeNet,
      // Gross-minus-platform-fee, matching the agency dashboard's "Net" figures.
      // Same PLATFORM_FEE_PCT constant is used everywhere, so the two views
      // agree to the cent regardless of what the fee is set to.
      todayNetAfterCut: agencyNet(todayNet),
      allTimeNetAfterCut: agencyNet(allTimeNet),
      todaySales,
      allTimeSales,
      unlocks: allTimeSales,
      todayMessages,
      allTimeMessages,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
