import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";
import { withTimeout } from "@/lib/with-timeout";
import { PLATFORM_FEE_PCT } from "@/lib/platform";
import { PAID, listAgencies, loadSends, loadFans } from "@/lib/admin-data";
import type { AdminAgencyRow, AdminAgenciesPayload } from "@/lib/admin-types";

/**
 * Flat list of every agency on the platform with a one-row summary
 * (models / chatters / fans counts, GMV, platform fee, last activity).
 * Backs the admin "Agencies" tab; click a row to drill into the detail route.
 */

export const maxDuration = 60;

const Q = 15_000;

type ModelRow = { id: string; agency_user_id: string };
type LinkRow = { agency_id: string };

export async function GET() {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const admin = createAdminSupabaseClient();
    const agencies = await listAgencies(admin);

    let partial = false;
    const [modelsRes, linksRes, sendsLoad, fansLoad] = await Promise.all([
      withTimeout(
        Promise.resolve(admin.from("models").select("id, agency_user_id")),
        Q,
        "admin/agencies: models",
      ).catch(() => {
        partial = true;
        return { data: [] as ModelRow[] };
      }),
      withTimeout(
        Promise.resolve(admin.from("agency_chatters").select("agency_id")),
        Q,
        "admin/agencies: chatters",
      ).catch(() => {
        partial = true;
        return { data: [] as LinkRow[] };
      }),
      loadSends(admin),
      loadFans(admin),
    ]);
    if (sendsLoad.partial || fansLoad.partial) partial = true;

    const models = (modelsRes.data ?? []) as ModelRow[];
    const sends = sendsLoad.rows;
    const fans = fansLoad.rows;
    const links = (linksRes.data ?? []) as LinkRow[];

    const agencyByModel = new Map<string, string>();
    const modelsByAgency = new Map<string, number>();
    for (const m of models) {
      agencyByModel.set(m.id, m.agency_user_id);
      modelsByAgency.set(m.agency_user_id, (modelsByAgency.get(m.agency_user_id) ?? 0) + 1);
    }
    const chattersByAgency = new Map<string, number>();
    for (const l of links) {
      chattersByAgency.set(l.agency_id, (chattersByAgency.get(l.agency_id) ?? 0) + 1);
    }
    const fansByAgency = new Map<string, number>();
    for (const f of fans) {
      const a = agencyByModel.get(f.model_id);
      if (a) fansByAgency.set(a, (fansByAgency.get(a) ?? 0) + 1);
    }

    const gmvByAgency = new Map<string, { gmv: number; sales: number; last: number }>();
    for (const s of sends) {
      if (!PAID.has(s.status)) continue;
      const a = agencyByModel.get(s.model_id);
      if (!a) continue;
      const price = Number(s.total_price ?? 0);
      const ts = new Date(s.created_at).getTime();
      const cur = gmvByAgency.get(a) ?? { gmv: 0, sales: 0, last: 0 };
      cur.gmv += price;
      cur.sales += 1;
      if (ts > cur.last) cur.last = ts;
      gmvByAgency.set(a, cur);
    }

    const rows: AdminAgencyRow[] = [...agencies.values()]
      .map((ag) => {
        const g = gmvByAgency.get(ag.id) ?? { gmv: 0, sales: 0, last: 0 };
        return {
          id: ag.id,
          name: ag.name,
          email: ag.email,
          payoutAddress: ag.payoutAddress,
          models: modelsByAgency.get(ag.id) ?? 0,
          chatters: chattersByAgency.get(ag.id) ?? 0,
          fans: fansByAgency.get(ag.id) ?? 0,
          gmv: g.gmv,
          fee: g.gmv * PLATFORM_FEE_PCT,
          net: g.gmv * (1 - PLATFORM_FEE_PCT),
          sales: g.sales,
          lastActivity: g.last ? new Date(g.last).toISOString() : null,
        };
      })
      .sort((a, b) => b.gmv - a.gmv);

    return Response.json({ agencies: rows, partial } satisfies AdminAgenciesPayload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    return Response.json({ error: msg }, { status: 503 });
  }
}
