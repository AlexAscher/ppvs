import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { withTimeout } from "@/lib/with-timeout";
import { getCachedAuthUser } from "@/lib/auth-cache";
import { agencyNet } from "@/lib/platform";
import { computeAgencyBalances } from "@/lib/payouts-balance";
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
export type RecentSale = {
  fanName: string;
  amount: number;
  modelName: string;
  /** ms-epoch — client formats relative ("2h ago"). */
  ts: number;
};
export type DashboardStats = {
  netToday: number;
  netWeek: number;
  netMonth: number;
  netAllTime: number;
  sales: number;
  avgOrder: number;
  payingFans: number;
  /** Total fans recorded for the agency's models — the "chats started"
   *  denominator behind the dashboard's Conversion Rate card. */
  totalFans: number;
  activeChatters: number;
  availableBalance: number;
  pendingPayouts: number;
  chart: { date: string; value: number }[];
  /** Daily count of NEW fan rows (fans.created_at) for the last 7 days,
   *  feeding the "Conversations started" bar chart. Independent of the
   *  Net Sales series so the two charts reflect different metrics. */
  conversations7d: { date: string; value: number }[];
  models: ModelStat[];
  chatters: ChatterStat[];
  topFans: FanStat[];
  recentSales: RecentSale[];
  partial?: boolean;
};

/** New-fan rows per day, last 7 UTC days, in ascending order. Used by the
 *  Conversations started card. Uses fans.created_at as the "conversation
 *  started" signal — a fan row is created the first time we see a peer. */
async function buildConversations7d(
  admin: AdminClient,
  modelIds: string[],
): Promise<{ date: string; value: number }[]> {
  if (modelIds.length === 0) return [];
  const now = new Date();
  const days: string[] = [];
  const buckets = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const iso = d.toISOString().slice(0, 10);
    days.push(iso);
    buckets.set(iso, 0);
  }
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6)).toISOString();
  try {
    // Rule: a "conversation started" is a fan whose first message we have on
    // record AND who received a reply from the creator/agency (auto-reply
    // counts as a reply because the agency configured it; a fan reading our
    // reply or paying for a PPV proves an outbound existed).
    // Bucketed by the fan's first-message date (fans.created_at).
    const { data } = await admin
      .from("fans")
      .select("created_at, auto_replied_at, last_read_at, total_spent")
      .in("model_id", modelIds)
      .gte("created_at", cutoff);
    for (const r of (data ?? []) as {
      created_at: string;
      auto_replied_at: string | null;
      last_read_at: string | null;
      total_spent: number | string | null;
    }[]) {
      const wasReplied =
        !!r.auto_replied_at || !!r.last_read_at || Number(r.total_spent ?? 0) > 0;
      if (!wasReplied) continue;
      const key = new Date(r.created_at).toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  } catch { /* best-effort */ }
  return days.map((d) => ({ date: d, value: buckets.get(d) ?? 0 }));
}

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
    // Optional scope: ?modelId=<uuid> restricts every aggregate to a
    // single model. Anything not owned by the caller is ignored (falls
    // back to all models).
    const scopeModelId = new URL(req.url).searchParams.get("modelId");

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
    // Keep the full name map (so chart/labels resolve), but scope the
    // aggregated model id list when a valid modelId is requested.
    const nameByModel = new Map(models.map((m) => [m.id, m.name]));
    const scoped = scopeModelId && models.some((m) => m.id === scopeModelId);
    const modelIds = scoped ? [scopeModelId as string] : models.map((m) => m.id);

    const empty: DashboardStats = {
      netToday: 0, netWeek: 0, netMonth: 0, netAllTime: 0,
      sales: 0, avgOrder: 0, payingFans: 0, totalFans: 0, activeChatters: 0,
      availableBalance: 0, pendingPayouts: 0, chart: [], conversations7d: [], models: [], chatters: [], topFans: [],
      recentSales: [],
      partial,
    };
    if (modelIds.length === 0) return Response.json(empty);

    // ── Fast path: aggregate in Postgres via fn_dashboard_core ──────────────
    // One round-trip returns ~5 KB of pre-aggregated JSON instead of pulling
    // every ppv_sends + fans row across the Ireland↔EU link. Falls through to
    // the in-Node loaders below if the RPC is missing (migration not yet run)
    // or errors — so nothing breaks regardless of deploy order.
    try {
      const fastPath = await computeViaRpc(admin, user.id, modelIds, nameByModel, period, partial);
      if (fastPath) return Response.json(fastPath);
    } catch {
      /* fall through to the loader path */
    }

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
        // v3: free content (total_price = 0) never counts toward statistics.
        if (Number(s.total_price ?? 0) <= 0) continue;
        const ts = new Date(s.created_at).getTime();
        if (earliestPaidTs === undefined || ts < earliestPaidTs) earliestPaidTs = ts;
      }
    }
    const chartBuckets = buildChartBuckets(period, earliestPaidTs);

    for (const s of sends) {
      if (!PAID.has(s.status)) continue;
      // Revenue figures shown to the agency are NET of the platform's 10%
      // commission (taken off the top). agencyNet() applies (1 − fee).
      const price = agencyNet(Number(s.total_price ?? 0));
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

    const pendingPayouts = payouts
      .filter((p) => p.status === "pending")
      .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    // Hold-aware available balance — same helper /api/payouts uses, so the
    // number matches everywhere (only sales past the 30-day hold count).
    const { available: availableBalance } = await computeAgencyBalances(admin, user.id);

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

    // Recent Sales — the 10 most recently paid/delivered sends. Fetched
    // fresh from the DB rather than re-walking `sends` so we can sort by
    // created_at without holding the whole paginated list sorted in memory.
    let recentSales: RecentSale[] = [];
    try {
      const rs = await withTimeout(
        Promise.resolve(
          admin
            .from("ppv_sends")
            .select("model_id, peer_id, peer_username, total_price, created_at, status")
            .in("model_id", modelIds)
            .in("status", ["paid", "delivered"])
            .order("created_at", { ascending: false })
            .limit(10),
        ),
        Q_TIMEOUT,
        "dashboard: recent sales",
      );
      type RecentRow = {
        model_id: string;
        peer_id: string;
        peer_username: string | null;
        total_price: number | string;
        created_at: string;
      };
      // Resolve fan names from the fans table we already loaded (avoids
      // an extra round-trip per row).
      const fanByKey = new Map<string, { telegram_username: string | null; telegram_name: string | null }>();
      for (const f of fans) {
        fanByKey.set(`${f.model_id}:${f.peer_id}`, {
          telegram_username: f.telegram_username,
          telegram_name: f.telegram_name,
        });
      }
      recentSales = ((rs.data ?? []) as RecentRow[]).map((r) => {
        const fan = fanByKey.get(`${r.model_id}:${r.peer_id}`);
        const username = r.peer_username ?? fan?.telegram_username ?? null;
        const name = username
          ? `@${username}`
          : fan?.telegram_name || "Fan";
        return {
          fanName: name,
          amount: Number(r.total_price ?? 0),
          modelName: nameByModel.get(r.model_id) ?? "Model",
          ts: new Date(r.created_at).getTime(),
        };
      });
    } catch {
      // Best-effort — empty list is fine if this single query times out.
    }

    const totalFans = fans.length;

    // v3: Conversations started chart — daily count of new fan rows across
    // the agency's models for the last 7 days. Independent of Net Sales.
    const conversations7d = await buildConversations7d(admin, modelIds);

    const payload: DashboardStats = {
      netToday, netWeek, netMonth, netAllTime,
      sales, avgOrder, payingFans, totalFans, activeChatters,
      availableBalance, pendingPayouts,
      chart: chartBuckets.map((b) => ({ date: b.date, value: Math.round(b.value) })),
      conversations7d,
      models: modelStats,
      chatters,
      topFans,
      recentSales,
      partial,
    };
    return Response.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    // Timeouts land here — tell the client to retry.
    return Response.json({ error: msg }, { status: 503 });
  }
}

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

/**
 * Postgres-side aggregation via fn_dashboard_core. Returns the full
 * DashboardStats, or null when the RPC is unavailable / errors (the caller
 * then falls back to the in-Node loader path). Keeps chatter-name resolution,
 * recent sales, payouts + chart shaping in Node (cheap, small queries).
 */
async function computeViaRpc(
  admin: AdminClient,
  agencyUserId: string,
  modelIds: string[],
  nameByModel: Map<string, string>,
  period: ReturnType<typeof parseChartPeriod>,
  partial: boolean,
): Promise<DashboardStats | null> {
  const netMult = agencyNet(1); // (1 − platform fee), single source of truth
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = todayStart - 6 * 86_400_000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const rpc = await withTimeout(
    Promise.resolve(
      admin.rpc("fn_dashboard_core", {
        p_model_ids: modelIds,
        p_today: new Date(todayStart).toISOString(),
        p_week: new Date(weekStart).toISOString(),
        p_month: new Date(monthStart).toISOString(),
        p_net_mult: netMult,
      }),
    ),
    Q_TIMEOUT,
    "dashboard: rpc",
  );
  if (rpc.error || !rpc.data) return null;

  const core = rpc.data as {
    net_all: number; net_today: number; net_week: number; net_month: number;
    sales: number;
    models: { id: string; net: number; sales: number }[];
    chatters: { id: string; net: number; sales: number }[];
    paying_fans: number;
    top_fans: { username: string | null; name: string | null; spent: number }[];
    series: { d: string; value: number }[];
  };

  // Chart: daily series covers 7d/30d/all. 1d (hourly) needs intraday data
  // the daily series lacks, so pull just today's sends (small).
  let earliest: number | undefined;
  if (period === "all" && core.series.length > 0) {
    earliest = new Date(core.series[0].d).getTime();
  }
  const buckets = buildChartBuckets(period, earliest);
  if (period === "1d") {
    try {
      const r = await withTimeout(
        Promise.resolve(
          admin
            .from("ppv_sends")
            .select("total_price, created_at, status")
            .in("model_id", modelIds)
            .in("status", ["paid", "delivered"])
            .gte("created_at", new Date(todayStart).toISOString()),
        ),
        Q_TIMEOUT,
        "dashboard: 1d chart",
      );
      for (const s of (r.data ?? []) as { total_price: number | string; created_at: string }[]) {
        const b = bucketFor(buckets, new Date(s.created_at).getTime(), period);
        if (b) b.value += agencyNet(Number(s.total_price ?? 0));
      }
    } catch {
      /* empty chart is acceptable */
    }
  } else {
    for (const pt of core.series) {
      const b = bucketFor(buckets, new Date(pt.d).getTime(), period);
      if (b) b.value += Number(pt.value);
    }
  }

  // Chatter display names (best-effort, capped at 10).
  const chatters: ChatterStat[] = await Promise.all(
    core.chatters.slice(0, 10).map(async (c) => {
      let name = "Chatter";
      try {
        const { data } = await admin.auth.admin.getUserById(c.id);
        const u = data?.user;
        name =
          (u?.user_metadata?.full_name as string) ||
          (u?.user_metadata?.display_name as string) ||
          u?.email?.split("@")[0] ||
          "Chatter";
      } catch {
        /* keep default */
      }
      return { id: c.id, name, net: c.net, sales: c.sales };
    }),
  );

  // Recent sales + payouts + active-chatter count + total-fans count —
  // small, run in parallel. `totalFans` feeds the dashboard's Conversion
  // Rate card (= payingFans ÷ totalFans). HEAD count keeps payload tiny.
  const [recentRes, payoutsRes, linksRes, fansCountRes] = await Promise.all([
    withTimeout(
      Promise.resolve(
        admin
          .from("ppv_sends")
          .select("model_id, peer_username, total_price, created_at")
          .in("model_id", modelIds)
          .in("status", ["paid", "delivered"])
          // v3: exclude free content — recent sales must reflect real
          // revenue only.
          .gt("total_price", 0)
          .order("created_at", { ascending: false })
          .limit(10),
      ),
      Q_TIMEOUT,
      "dashboard: recent",
    ).catch(() => ({ data: [] as unknown[] })),
    withTimeout(
      Promise.resolve(admin.from("payouts").select("amount, status").eq("agency_user_id", agencyUserId)),
      Q_TIMEOUT,
      "dashboard: payouts",
    ).catch(() => ({ data: [] as { amount: number; status: string }[] })),
    withTimeout(
      Promise.resolve(admin.from("agency_chatters").select("chatter_id").eq("agency_id", agencyUserId)),
      Q_TIMEOUT,
      "dashboard: chatters",
    ).catch(() => ({ data: [] as { chatter_id: string }[] })),
    withTimeout(
      Promise.resolve(
        admin
          .from("fans")
          .select("id", { count: "exact", head: true })
          .in("model_id", modelIds),
      ),
      Q_TIMEOUT,
      "dashboard: total fans",
    ).catch(() => ({ count: 0 as number | null })),
  ]);

  const recentSales: RecentSale[] = (
    (recentRes.data ?? []) as {
      model_id: string;
      peer_username: string | null;
      total_price: number | string;
      created_at: string;
    }[]
  ).map((r) => ({
    fanName: r.peer_username ? `@${r.peer_username}` : "Fan",
    amount: Number(r.total_price ?? 0),
    modelName: nameByModel.get(r.model_id) ?? "Model",
    ts: new Date(r.created_at).getTime(),
  }));

  const payouts = (payoutsRes.data ?? []) as { amount: number; status: string }[];
  const pendingPayouts = payouts
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  // availableBalance must match the wallet card / /api/payouts exactly —
  // only sales that have CLEARED the 25-day hold count, net of committed
  // payouts. The previous shortcut `net_all - paidOrPending` ignored the
  // hold entirely so funds appeared withdrawable on day 1.
  const { available: availableBalance } = await computeAgencyBalances(admin, agencyUserId);
  const conversations7d = await buildConversations7d(admin, modelIds);

  const models: ModelStat[] = core.models.map((m) => ({
    id: m.id,
    name: nameByModel.get(m.id) ?? "Model",
    net: m.net,
    sales: m.sales,
  }));
  const topFans: FanStat[] = core.top_fans.map((f) => ({
    name: f.username ? `@${f.username}` : f.name || "Fan",
    spent: Number(f.spent),
  }));

  return {
    netToday: core.net_today,
    netWeek: core.net_week,
    netMonth: core.net_month,
    netAllTime: core.net_all,
    sales: core.sales,
    avgOrder: core.sales > 0 ? core.net_all / core.sales : 0,
    payingFans: core.paying_fans,
    totalFans: (fansCountRes as { count: number | null }).count ?? 0,
    activeChatters: ((linksRes.data ?? []) as { chatter_id: string }[]).length,
    availableBalance,
    pendingPayouts,
    chart: buckets.map((b) => ({ date: b.date, value: Math.round(b.value) })),
    conversations7d,
    models,
    chatters,
    topFans,
    recentSales,
    partial,
  };
}
