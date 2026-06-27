import { requireAdmin } from "@/lib/admin-auth";
import { getBotStarBalance, starsToUsd } from "@/lib/stars";

/**
 * GET /api/admin/star-balance
 *
 * The Stars accumulated on our bot (PPV + tip revenue, pre-withdrawal). This is
 * what's available to withdraw Stars→TON on Fragment. USD is the ~$0.013/Star
 * withdrawal estimate, not a guaranteed rate.
 */
export async function GET() {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;
  try {
    const stars = await getBotStarBalance();
    return Response.json({ stars, usd: starsToUsd(stars) });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
