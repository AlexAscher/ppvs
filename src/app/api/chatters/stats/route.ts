import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { agencyNet } from "@/lib/platform";

/**
 * GET /api/chatters/stats
 *
 * Returns net earnings + sales count for every chatter under the
 * authenticated agency. Used by the Chatters tab so the agency can see
 * which chatter brought in what at a glance, without opening the
 * per-chatter ChatterStatsModal.
 *
 * Returns a map keyed by chatter_id (auth user id) → { net, sales }.
 * "Net" = gross after the platform's 10% fee, NOT yet split by payout
 * config. Mirrors how the chatter sees their own dashboard.
 */
export async function GET() {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();

  // Find all chatters working for this agency.
  const { data: links } = await admin
    .from("agency_chatters")
    .select("chatter_id")
    .eq("agency_id", user.id);
  const chatterIds = [
    ...new Set(((links ?? []) as { chatter_id: string }[]).map((r) => r.chatter_id)),
  ];
  if (chatterIds.length === 0) return Response.json({ stats: {} });

  // Pull paid PPV sends and tips for every chatter in two range queries.
  // For typical agency sizes (<50 chatters, <10k sales) this is cheaper
  // than N round-trips.
  const [sendsRes, tipsRes] = await Promise.all([
    admin
      .from("ppv_sends")
      .select("chatter_id, total_price, status")
      .in("chatter_id", chatterIds)
      .in("status", ["paid", "delivered"]),
    admin
      .from("tips")
      .select("chatter_id, amount, status")
      .in("chatter_id", chatterIds)
      .eq("status", "paid"),
  ]);

  type SendRow = { chatter_id: string; total_price: number | string };
  type TipRow = { chatter_id: string; amount: number | string };

  type Stat = { net: number; sales: number };
  const stats: Record<string, Stat> = {};
  function bump(id: string, gross: number) {
    if (!stats[id]) stats[id] = { net: 0, sales: 0 };
    stats[id].net += agencyNet(gross);
    stats[id].sales += 1;
  }

  for (const s of (sendsRes.data ?? []) as SendRow[]) {
    bump(s.chatter_id, Number(s.total_price ?? 0));
  }
  for (const t of (tipsRes.data ?? []) as TipRow[]) {
    bump(t.chatter_id, Number(t.amount ?? 0));
  }

  // Round net to 2dp for display.
  for (const id of Object.keys(stats)) {
    stats[id].net = Math.round(stats[id].net * 100) / 100;
  }

  return Response.json({ stats });
}
