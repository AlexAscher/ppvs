import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { withTimeout } from "@/lib/with-timeout";
import { getCachedAuthUser } from "@/lib/auth-cache";
import {
  loadSends,
  loadFans,
  PAID,
  startOfDay,
  buildChartBuckets,
  bucketFor,
  parseChartPeriod,
} from "@/lib/admin-data";

/**
 * Agency dashboard aggregate. Everything is computed live from existing
 * tables — no precomputed stats table:
 *   - ppv_sends: revenue (status paid/delivered), per-model, per-chatter
 *   - fans:      paying-fan count (total_spent > 0)
 *   - agency_chatters: active chatter count + names
 *   - payouts:   withdrawals → available balance (optional table)
 *
 * Agency-only: we resolve the agency via the SSR session, then use the
 * admin client to read across the agency's models (RLS-bypassing, but
 * scoped in-query to model_ids the caller owns).
 *
 * Resilient: every individual query is wrapped so one slow request can't
 * 503 the whole dashboard. A `partial: true` flag tells the UI to surface
 * a banner + retry button instead of leaving the user stuck on "...".
 */

export const maxDuration = 60;

// Generous per-query budget — Supabase round-trips on a flaky uplink routinely
// take 10–25s. We'd rather wait than 503 with empty cards.
const Q_TIMEOUT = 45_000;

export type ModelStat = { id: string; name: string; net: number; sales: number };
export type ChatterStat = { id: string; name: string; net: number; sales: number };
export type FanStat = { name: string; spent: number };
export type DashboardStats = {
  netToday: number;
  netWeek: number;
  netMonth: number;
  netAllTime: number;
  sales: number;
  avgOrder: number;
  payingFans: number;
  activeChatters: number;
  availableBalance: number;
  pendingPayouts: number;
  chart: { date: string; value: number }[];
  models: ModelStat[];
  chatters: ChatterStat[];
  topFans: FanStat[];
  partial?: boolean;
};

export async function GET(req: NextRequest) {
  try {
    // Cached + 8s-timeout auth lookup — a bare getUser() on a flaky uplink
    // could hang 30–70s and false-401 the dashboard.
    const user = await getCachedAuthUser();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    // Chart period — UI buttons feed it as ?period=1d|7d|30d|all. Anything
    // else falls back to 7d. The stat cards above the chart (Net Today /
    // Week / Month / All Time) are NOT affected — they always show their
    // canonical windows so the user can read both at once.
    const period = parseChartPeriod(new URL(req.url).searchParams.get("period"));

    const admin = createAdminSupabaseClient();

    let partial = false;

    // 1. Agency's models. If it times out, render an empty dashboard with
    //    `partial:true` rather than 503ing the whole route.
    let models: { id: string; name: string }[] = [];
    try {
      const r = await withTimeout(
        Promise.resolve(admin.from("models").select("id, name").eq("agency_user_id", user.id)),
        Q_TIMEOUT,
        "dashboard: models",
      );
      if (r.error) partial = true;
      else models = (r.data ?? []) as { id: string; name: string }[];
    } catch {
      partial = true;
    }
    const modelIds = models.map((m) => m.id);
    const nameByModel = new Map(models.map((m) => [m.id, m.name]));

    const empty: DashboardStats = {
      netToday: 0, netWeek: 0, netMonth: 0, netAllTime: 0,
      sales: 0, avgOrder: 0, payingFans: 0, activeChatters: 0,
      availableBalance: 0, pendingPayouts: 0, chart: [], models: [], chatters: [], topFans: [],
      partial,
    };
    if (modelIds.length === 0) return Response.json(empty);

    // 2. Sends + fans via paginated loaders (small per-page requests survive
    //    flaky uplinks much better than one giant SELECT). Chatters + payouts
    //    are tiny — single-shot with .catch.
    const [sendsLoad, fansLoad, linksRes, payoutsRes] = await Promise.all([
      loadSends(admin, modelIds),
      loadFans(admin, modelIds),
      withTimeout(
        Promise.resolve(admin.from("agency_chatters").select("chatter_id").eq("agency_id", user.id)),
        Q_TIMEOUT,
        "dashboard: chatters",
      ).catch(() => { partial = true; return { data: [] as { chatter_id: string }[] }; }),
      // payouts table is optional — swallow errors if it doesn't exist yet.
      withTimeout(
        Promise.resolve(
          admin.from("payouts").select("amount, status").eq("agency_user_id", user.id),
        ),
        Q_TIMEOUT,
        "dashboard: payouts",
      ).catch(() => ({ data: [] as { amount: number; status: string }[] })),
    ]);
    if (sendsLoad.partial || fansLoad.partial) partial = true;

    // SendLite/FanLite supersets cover everything used below (model_id,
    // chatter_id, total_price, status, created_at / total_spent, telegram_*).
    const sends = sendsLoad.rows;
    const fans = fansLoad.rows;
    const links = (linksRes.data ?? []) as { chatter_id: string }[];
    const payouts = (payoutsRes.data ?? []) as { amount: number; status: string }[];

    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = todayStart - 6 * 86_400_000; // last 7 days incl. today
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let netToday = 0, netWeek = 0, netMonth = 0, netAllTime = 0, sales = 0;
    const modelAgg = new Map<string, { net: number; sales: number }>();
    const chatterAgg = new Map<string, { net: number; sales: number }>();

    // For "all" we anchor the weekly buckets at the earliest paid sale —
    // pre-scan once so the buckets cover real data (not an empty stretch
    // before the project started).
    let earliestPaidTs: number | undefined;
    if (period === "all") {
      for (const s of sends) {
        if (!PAID.has(s.status)) continue;
        const ts = new Date(s.created_at).getTime();
        if (earliestPaidTs === undefined || ts < earliestPaidTs) earliestPaidTs = ts;
      }
    }
    const chartBuckets = buildChartBuckets(period, earliestPaidTs);

    for (const s of sends) {
      if (!PAID.has(s.status)) continue;
      const price = Number(s.total_price ?? 0);
      const ts = new Date(s.created_at).getTime();
      netAllTime += price;
      sales += 1;
      if (ts >= todayStart) netToday += price;
      if (ts >= weekStart) netWeek += price;
      if (ts >= monthStart) netMonth += price;

      const m = modelAgg.get(s.model_id) ?? { net: 0, sales: 0 };
      m.net += price; m.sales += 1; modelAgg.set(s.model_id, m);

      if (s.chatter_id) {
        const c = chatterAgg.get(s.chatter_id) ?? { net: 0, sales: 0 };
        c.net += price; c.sales += 1; chatterAgg.set(s.chatter_id, c);
      }

      // Bucket by selected granularity (hour / day / week).
      const bucket = bucketFor(chartBuckets, ts, period);
      if (bucket) bucket.value += price;
    }

    const payingFans = fans.filter((f) => Number(f.total_spent) > 0).length;
    const activeChatters = links.length;

    const topFans: FanStat[] = fans
      .filter((f) => Number(f.total_spent) > 0)
      .sort((a, b) => Number(b.total_spent) - Number(a.total_spent))
      .slice(0, 5)
      .map((f) => ({
        name: f.telegram_username
          ? `@${f.telegram_username}`
          : f.telegram_name || "Fan",
        spent: Number(f.total_spent),
      }));
    const avgOrder = sales > 0 ? netAllTime / sales : 0;

    const paidOrPending = payouts
      .filter((p) => p.status !== "rejected")
      .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    const pendingPayouts = payouts
      .filter((p) => p.status === "pending")
      .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    const availableBalance = Math.max(0, netAllTime - paidOrPending);

    const modelStats: ModelStat[] = [...modelAgg.entries()]
      .map(([id, v]) => ({ id, name: nameByModel.get(id) ?? "Model", net: v.net, sales: v.sales }))
      .sort((a, b) => b.net - a.net);

    // Resolve chatter display names (best-effort, few of them).
    const chatterEntries = [...chatterAgg.entries()].sort((a, b) => b[1].net - a[1].net).slice(0, 10);
    const chatters: ChatterStat[] = await Promise.all(
      chatterEntries.map(async ([id, v]) => {
        let name = "Chatter";
        try {
          const { data } = await admin.auth.admin.getUserById(id);
          const u = data?.user;
          name =
            (u?.user_metadata?.full_name as string) ||
            (u?.user_metadata?.display_name as string) ||
            u?.email?.split("@")[0] ||
            "Chatter";
        } catch {
          /* keep default */
        }
        return { id, name, net: v.net, sales: v.sales };
      }),
    );

    const payload: DashboardStats = {
      netToday, netWeek, netMonth, netAllTime,
      sales, avgOrder, payingFans, activeChatters,
      availableBalance, pendingPayouts,
      chart: chartBuckets.map((b) => ({ date: b.date, value: Math.round(b.value) })),
      models: modelStats,
      chatters,
      topFans,
      partial,
    };
    return Response.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    // Timeouts land here — tell the client to retry.
    return Response.json({ error: msg }, { status: 503 });
  }
}
