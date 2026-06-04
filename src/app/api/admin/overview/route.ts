import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";
import { withTimeout } from "@/lib/with-timeout";
import { PLATFORM_FEE_PCT } from "@/lib/platform";
import { PAID, startOfDay, makeChartBuckets, listAgencies, loadSends, loadFans } from "@/lib/admin-data";
import type {
  AdminOverview,
  AdminTopAgency,
  AdminTopFan,
  AdminTopModel,
} from "@/lib/admin-types";

/**
 * Platform-wide admin overview. GMV across every agency, the platform's
 * commission cut, head-counts, a 14-day GMV chart, and leaderboards
 * (top agencies / fans / models). View-only; gated by requireAdmin().
 */

export const maxDuration = 60;

const Q = 15_000;

type ModelRow = { id: string; name: string; agency_user_id: string };

export async function GET() {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const admin = createAdminSupabaseClient();
    const agencies = await listAgencies(admin);

    let partial = false;
    const [modelsRes, linksRes, sendsLoad, fansLoad] = await Promise.all([
      withTimeout(
        Promise.resolve(admin.from("models").select("id, name, agency_user_id")),
        Q,
        "admin/overview: models",
      ).catch(() => {
        partial = true;
        return { data: [] as ModelRow[] };
      }),
      withTimeout(
        Promise.resolve(admin.from("agency_chatters").select("chatter_id")),
        Q,
        "admin/overview: chatters",
      ).catch(() => {
        partial = true;
        return { data: [] as { chatter_id: string }[] };
      }),
      loadSends(admin),
      loadFans(admin),
    ]);
    if (sendsLoad.partial || fansLoad.partial) partial = true;

    const models = (modelsRes.data ?? []) as ModelRow[];
    const sends = sendsLoad.rows;
    const fans = fansLoad.rows;
    const links = (linksRes.data ?? []) as { chatter_id: string }[];

    const agencyByModel = new Map<string, string>();
    const nameByModel = new Map<string, string>();
    for (const m of models) {
      agencyByModel.set(m.id, m.agency_user_id);
      nameByModel.set(m.id, m.name);
    }

    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = todayStart - 6 * 86_400_000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let gmvToday = 0,
      gmvWeek = 0,
      gmvMonth = 0,
      gmvAllTime = 0,
      sales = 0;
    const chart = makeChartBuckets(14);
    const agencyAgg = new Map<string, { gmv: number; sales: number }>();
    const modelAgg = new Map<string, { gmv: number; sales: number }>();

    for (const s of sends) {
      if (!PAID.has(s.status)) continue;
      const price = Number(s.total_price ?? 0);
      const ts = new Date(s.created_at).getTime();
      gmvAllTime += price;
      sales += 1;
      if (ts >= todayStart) gmvToday += price;
      if (ts >= weekStart) gmvWeek += price;
      if (ts >= monthStart) gmvMonth += price;

      const dayTs = startOfDay(new Date(ts));
      const b = chart.find((x) => x.ts === dayTs);
      if (b) b.value += price;

      const agId = agencyByModel.get(s.model_id);
      if (agId) {
        const a = agencyAgg.get(agId) ?? { gmv: 0, sales: 0 };
        a.gmv += price;
        a.sales += 1;
        agencyAgg.set(agId, a);
      }
      const mm = modelAgg.get(s.model_id) ?? { gmv: 0, sales: 0 };
      mm.gmv += price;
      mm.sales += 1;
      modelAgg.set(s.model_id, mm);
    }

    const payingFans = fans.filter((f) => Number(f.total_spent) > 0).length;

    const topAgencies: AdminTopAgency[] = [...agencyAgg.entries()]
      .map(([id, v]) => ({
        id,
        name: agencies.get(id)?.name ?? "Agency",
        gmv: v.gmv,
        sales: v.sales,
        fee: v.gmv * PLATFORM_FEE_PCT,
      }))
      .sort((a, b) => b.gmv - a.gmv)
      .slice(0, 8);

    const topModels: AdminTopModel[] = [...modelAgg.entries()]
      .map(([id, v]) => ({
        id,
        name: nameByModel.get(id) ?? "Model",
        agencyName: agencies.get(agencyByModel.get(id) ?? "")?.name ?? "—",
        gmv: v.gmv,
        sales: v.sales,
      }))
      .sort((a, b) => b.gmv - a.gmv)
      .slice(0, 8);

    const topFans: AdminTopFan[] = fans
      .filter((f) => Number(f.total_spent) > 0)
      .sort((a, b) => Number(b.total_spent) - Number(a.total_spent))
      .slice(0, 10)
      .map((f) => ({
        username: f.telegram_username,
        name: f.telegram_name || (f.telegram_username ? `@${f.telegram_username}` : "Fan"),
        spent: Number(f.total_spent),
        agencyName: agencies.get(agencyByModel.get(f.model_id) ?? "")?.name ?? "—",
        modelName: nameByModel.get(f.model_id) ?? "—",
      }));

    const payload: AdminOverview = {
      gmvToday,
      gmvWeek,
      gmvMonth,
      gmvAllTime,
      platformRevenueToday: gmvToday * PLATFORM_FEE_PCT,
      platformRevenueAllTime: gmvAllTime * PLATFORM_FEE_PCT,
      agencyNetAllTime: gmvAllTime * (1 - PLATFORM_FEE_PCT),
      feePct: PLATFORM_FEE_PCT,
      sales,
      avgOrder: sales > 0 ? gmvAllTime / sales : 0,
      agencies: agencies.size,
      models: models.length,
      chatters: links.length,
      fans: fans.length,
      payingFans,
      chart: chart.map((b) => ({ date: b.date, value: Math.round(b.value) })),
      topAgencies,
      topFans,
      topModels,
      partial,
    };
    return Response.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    return Response.json({ error: msg }, { status: 503 });
  }
}
