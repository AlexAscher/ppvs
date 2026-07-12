import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";
import { withTimeout } from "@/lib/with-timeout";
import { PLATFORM_FEE_PCT } from "@/lib/platform";
import { PAID, listAgencies, resolveUserName, loadSends, loadFans } from "@/lib/admin-data";
import type {
  AdminAgencyDetail,
  AdminAgencyModel,
  AdminAgencyChatter,
  AdminAgencyFan,
  AdminAgencySale,
  AdminAgencyPayout,
} from "@/lib/admin-types";

/**
 * Full drill-down for one agency: per-model + per-chatter breakdown, the
 * complete fan list (with @usernames — the thing the admin specifically
 * wanted), top fans, recent sales, and payout history. View-only.
 */

export const maxDuration = 60;

const Q = 15_000;
const FANS_CAP = 2000;

type ModelRow = { id: string; name: string; session_status?: string | null };
type PayoutRow = { id: string; amount: number | string; status: string; created_at: string; address?: string | null; tx_hash?: string | null };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ agencyId: string }> }) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const { agencyId } = await params;
    const admin = createAdminSupabaseClient();
    const agencies = await listAgencies(admin);
    const info = agencies.get(agencyId);

    // models for this agency — session_status column may not exist; fall back.
    const withStatus = await withTimeout(
      Promise.resolve(
        admin.from("models").select("id, name, session_status").eq("agency_user_id", agencyId),
      ),
      Q,
      "admin/agency: models",
    );
    let models: ModelRow[];
    if (withStatus.error) {
      const base = await withTimeout(
        Promise.resolve(admin.from("models").select("id, name").eq("agency_user_id", agencyId)),
        Q,
        "admin/agency: models base",
      );
      models = (base.data ?? []) as ModelRow[];
    } else {
      models = (withStatus.data ?? []) as ModelRow[];
    }

    const modelIds = models.map((m) => m.id);
    const nameByModel = new Map(models.map((m) => [m.id, m.name]));

    const baseDetail = {
      id: agencyId,
      name: info?.name ?? "Agency",
      email: info?.email ?? "",
      payoutAddress: info?.payoutAddress ?? null,
      feePct: PLATFORM_FEE_PCT,
    };

    if (modelIds.length === 0) {
      const empty: AdminAgencyDetail = {
        ...baseDetail,
        gmv: 0,
        fee: 0,
        net: 0,
        sales: 0,
        avgOrder: 0,
        modelsCount: 0,
        chattersCount: 0,
        fansCount: 0,
        payingFans: 0,
        models: [],
        chatters: [],
        topFans: [],
        fans: [],
        recentSales: [],
        payouts: [],
      };
      return Response.json(empty);
    }

    let partial = false;
    const [sendsLoad, fansLoad, linksRes, payoutsRes] = await Promise.all([
      loadSends(admin, modelIds),
      loadFans(admin, modelIds),
      withTimeout(
        Promise.resolve(admin.from("agency_chatters").select("chatter_id").eq("agency_id", agencyId)),
        Q,
        "admin/agency: chatters",
      ).catch(() => {
        partial = true;
        return { data: [] as { chatter_id: string }[] };
      }),
      withTimeout(
        Promise.resolve(
          admin.from("payouts").select("id, amount, status, created_at, address, tx_hash").eq("agency_user_id", agencyId),
        ),
        Q,
        "admin/agency: payouts",
      ).catch(() => ({ data: [] as PayoutRow[] })),
    ]);
    if (sendsLoad.partial || fansLoad.partial) partial = true;

    const sends = sendsLoad.rows;
    const fans = fansLoad.rows;
    const links = (linksRes.data ?? []) as { chatter_id: string }[];
    const payoutsRaw = (payoutsRes.data ?? []) as PayoutRow[];

    let gmv = 0,
      sales = 0;
    const modelAgg = new Map<string, { gmv: number; sales: number }>();
    const chatterAgg = new Map<string, { gmv: number; sales: number }>();
    for (const s of sends) {
      if (!PAID.has(s.status)) continue;
      const price = Number(s.total_price ?? 0);
      gmv += price;
      sales += 1;
      const m = modelAgg.get(s.model_id) ?? { gmv: 0, sales: 0 };
      m.gmv += price;
      m.sales += 1;
      modelAgg.set(s.model_id, m);
      if (s.chatter_id) {
        const c = chatterAgg.get(s.chatter_id) ?? { gmv: 0, sales: 0 };
        c.gmv += price;
        c.sales += 1;
        chatterAgg.set(s.chatter_id, c);
      }
    }

    const fansByModel = new Map<string, number>();
    for (const f of fans) fansByModel.set(f.model_id, (fansByModel.get(f.model_id) ?? 0) + 1);

    const modelStats: AdminAgencyModel[] = models
      .map((m) => ({
        id: m.id,
        name: m.name,
        gmv: modelAgg.get(m.id)?.gmv ?? 0,
        sales: modelAgg.get(m.id)?.sales ?? 0,
        fans: fansByModel.get(m.id) ?? 0,
        sessionStatus: m.session_status ?? null,
      }))
      .sort((a, b) => b.gmv - a.gmv);

    // chatters: union of assigned (agency_chatters) + anyone who made a sale.
    const chatterIds = new Set<string>([...links.map((l) => l.chatter_id), ...chatterAgg.keys()]);
    const chatters: AdminAgencyChatter[] = await Promise.all(
      [...chatterIds].map(async (id) => ({
        id,
        name: await resolveUserName(admin, id),
        gmv: chatterAgg.get(id)?.gmv ?? 0,
        sales: chatterAgg.get(id)?.sales ?? 0,
      })),
    );
    chatters.sort((a, b) => b.gmv - a.gmv);

    // Dedupe by peer_id — the same Telegram user can have one `fans` row per
    // model of the same agency, so without dedupe the admin panel showed the
    // same person 2-3 times. We merge spend + keep the earliest last_seen so
    // the row reflects the fan, not any single model relationship.
    const fanByPeer = new Map<string, AdminAgencyFan>();
    for (const f of fans) {
      const key = String(f.peer_id ?? "");
      if (!key) continue;
      const modelName = nameByModel.get(f.model_id) ?? "—";
      const spent = Number(f.total_spent ?? 0);
      const existing = fanByPeer.get(key);
      if (!existing) {
        fanByPeer.set(key, {
          peerId: f.peer_id,
          username: f.telegram_username,
          name: f.telegram_name || (f.telegram_username ? `@${f.telegram_username}` : "Fan"),
          modelName,
          spent,
          lastSeen: f.last_seen_at,
        });
      } else {
        existing.spent += spent;
        // Keep the freshest last_seen across the fan's per-model rows.
        if (f.last_seen_at && (!existing.lastSeen || new Date(f.last_seen_at) > new Date(existing.lastSeen))) {
          existing.lastSeen = f.last_seen_at;
        }
        // If a duplicate row happens to have a display name and the first
        // didn't, upgrade it.
        if (!existing.username && f.telegram_username) existing.username = f.telegram_username;
        if ((!existing.name || existing.name === "Fan") && f.telegram_name) existing.name = f.telegram_name;
      }
    }
    const allFans: AdminAgencyFan[] = Array.from(fanByPeer.values())
      // Hide "nameless" stubs — fans with no @username AND no display name
      // (they'd render as the literal "Fan"). These come from auto-reply /
      // payment capture that ran before a dialog scan filled in identity. We
      // ALWAYS keep a nameless fan who spent money so no paying-fan record is
      // ever lost; only the $0 stubs are dropped from the list.
      .filter((f) => {
        const nameless = !f.username && (!f.name || f.name === "Fan");
        return !nameless || f.spent > 0;
      })
      .sort((a, b) => b.spent - a.spent);
    const topFans = allFans.filter((f) => f.spent > 0).slice(0, 10);
    const payingFans = allFans.filter((f) => f.spent > 0).length;

    const recentSales: AdminAgencySale[] = [...sends]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20)
      .map((s) => ({
        id: s.id,
        modelName: nameByModel.get(s.model_id) ?? "—",
        price: Number(s.total_price ?? 0),
        status: s.status,
        createdAt: s.created_at,
      }));

    const payouts: AdminAgencyPayout[] = payoutsRaw
      .map((p) => ({
        id: p.id,
        amount: Number(p.amount ?? 0),
        status: p.status,
        createdAt: p.created_at,
        address: p.address ?? null,
        txHash: p.tx_hash ?? null,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const payload: AdminAgencyDetail = {
      ...baseDetail,
      gmv,
      fee: gmv * PLATFORM_FEE_PCT,
      net: gmv * (1 - PLATFORM_FEE_PCT),
      sales,
      avgOrder: sales > 0 ? gmv / sales : 0,
      modelsCount: models.length,
      chattersCount: chatterIds.size,
      fansCount: allFans.length,
      payingFans,
      models: modelStats,
      chatters,
      topFans,
      fans: allFans.slice(0, FANS_CAP),
      recentSales,
      payouts,
      partial,
    };
    return Response.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    return Response.json({ error: msg }, { status: 503 });
  }
}
