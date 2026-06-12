import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { agencyNet } from "@/lib/platform";

/**
 * GET /api/chatter/stats
 *
 * Returns the dashboard headline numbers for the currently-authenticated
 * chatter — net earnings (today / week / month / all-time), unique paying
 * fans, average order value, "PPVs opened" (sales where they sent the PPV),
 * and a rough conversion rate (paid / sent).
 *
 * "Net" is the chatter's share *after* the platform's 10% fee. Splits
 * between chatter/creator/agency live on payout_splits and are applied at
 * payout time; this dashboard intentionally shows the WHOLE post-fee
 * revenue from sales the chatter drove, not just their cut, so the chatter
 * can see the impact of their work even before the agency has configured
 * a split.
 */

export type ChatterStats = {
  netToday: number;
  netWeek: number;
  netMonth: number;
  netAllTime: number;
  payingFans: number;
  avgOrder: number;
  ppvsOpened: number;
  conversion: number; // 0..1 — paid+delivered / total sent
};

function dayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function GET() {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();

  // All PPV sends owned by this chatter (any status). Computed everything
  // server-side: it's much cheaper than streaming N rows to the client.
  const [sendsRes, tipsRes] = await Promise.all([
    admin
      .from("ppv_sends")
      .select("total_price, status, paid_at, delivered_at, created_at, peer_id")
      .eq("chatter_id", user.id),
    admin
      .from("tips")
      .select("amount, status, paid_at, created_at, peer_id")
      .eq("chatter_id", user.id),
  ]);

  type PSend = {
    total_price: number | string;
    status: string;
    paid_at: string | null;
    delivered_at: string | null;
    created_at: string;
    peer_id: string;
  };
  type Tip = {
    amount: number | string;
    status: string;
    paid_at: string | null;
    created_at: string;
    peer_id: string;
  };
  const sends = (sendsRes.data ?? []) as PSend[];
  const tips = (tipsRes.data ?? []) as Tip[];

  const now = new Date();
  const today = dayStart(now);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  let netToday = 0;
  let netWeek = 0;
  let netMonth = 0;
  let netAllTime = 0;
  let paid = 0;
  let totalPaidValue = 0;
  const payingFans = new Set<string>();

  function addPaid(row: { paid_at: string | null; created_at: string }, gross: number) {
    const tsIso = row.paid_at ?? row.created_at;
    const ts = new Date(tsIso);
    const net = agencyNet(gross); // gross × (1 − 10%)
    netAllTime += net;
    if (ts >= monthAgo) netMonth += net;
    if (ts >= weekAgo) netWeek += net;
    if (ts >= today) netToday += net;
  }

  for (const s of sends) {
    if (s.status === "paid" || s.status === "delivered") {
      const gross = Number(s.total_price ?? 0);
      addPaid(s, gross);
      paid += 1;
      totalPaidValue += gross;
      payingFans.add(s.peer_id);
    }
  }
  for (const t of tips) {
    if (t.status === "paid") {
      const gross = Number(t.amount ?? 0);
      addPaid(t, gross);
      payingFans.add(t.peer_id);
    }
  }

  const totalSends = sends.length;
  const conversion = totalSends > 0 ? paid / totalSends : 0;
  const avgOrder = paid > 0 ? totalPaidValue / paid : 0;

  const out: ChatterStats = {
    netToday: Math.round(netToday * 100) / 100,
    netWeek: Math.round(netWeek * 100) / 100,
    netMonth: Math.round(netMonth * 100) / 100,
    netAllTime: Math.round(netAllTime * 100) / 100,
    payingFans: payingFans.size,
    avgOrder: Math.round(avgOrder * 100) / 100,
    ppvsOpened: paid,
    conversion: Math.round(conversion * 1000) / 1000,
  };
  return Response.json(out);
}
