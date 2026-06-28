import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/bot-stars
 *
 * Pull the Stars bot's current balance via Bot API `getMyStarBalance` so the
 * admin can see incoming Stars without opening BotFather. Withdrawals are
 * still manual via @BotFather → Stars → Withdraw (Fragment).
 */
const API = "https://api.telegram.org";

export async function GET() {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const tok = process.env.TELEGRAM_STARS_BOT_TOKEN;
  if (!tok) return Response.json({ error: "TELEGRAM_STARS_BOT_TOKEN not configured" }, { status: 500 });

  try {
    const res = await fetch(`${API}/bot${tok}/getMyStarBalance`, { cache: "no-store" });
    const j = (await res.json()) as { ok?: boolean; result?: { amount?: number }; description?: string };
    if (!j.ok) return Response.json({ error: j.description ?? "Failed" }, { status: 502 });
    return Response.json({ stars: Number(j.result?.amount ?? 0) });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 502 });
  }
}
