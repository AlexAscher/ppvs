import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Split-resolution + period-report utilities used by the Payout UI and
 * the CSV export endpoint.
 *
 * Resolution priority for a sale:
 *   1. payout_splits (scope='chatter') matching (model_id, chatter_user_id)
 *   2. payout_splits (scope='model')   matching model_id
 *   3. agency_settings.default_split_*
 *   4. Hardcoded fallback 50/20/30 (only if even agency_settings missing)
 */

export type SplitPcts = {
  model_pct: number;
  chatter_pct: number;
  agency_pct: number;
};

export const HARDCODED_DEFAULT: SplitPcts = {
  model_pct: 50,
  chatter_pct: 20,
  agency_pct: 30,
};

export type SplitsLookup = {
  defaultPcts: SplitPcts;
  byModel: Map<string, SplitPcts>;
  /** key = `${model_id}:${chatter_user_id}` */
  byModelChatter: Map<string, SplitPcts>;
};

/**
 * Load every split that applies to this agency in a single round-trip
 * so report() can resolve per-sale splits in O(1).
 */
export async function loadSplitsLookup(
  admin: SupabaseClient,
  agencyUserId: string,
): Promise<SplitsLookup> {
  const [splitsRes, settingsRes] = await Promise.all([
    admin
      .from("payout_splits")
      .select("scope, model_id, chatter_user_id, model_pct, chatter_pct, agency_pct")
      .eq("agency_user_id", agencyUserId),
    admin
      .from("agency_settings")
      .select("default_split_model_pct, default_split_chatter_pct, default_split_agency_pct")
      .eq("user_id", agencyUserId)
      .maybeSingle(),
  ]);

  type SplitRow = {
    scope: "model" | "chatter";
    model_id: string;
    chatter_user_id: string | null;
    model_pct: number | string;
    chatter_pct: number | string;
    agency_pct: number | string;
  };
  const splits = (splitsRes.data ?? []) as SplitRow[];

  const byModel = new Map<string, SplitPcts>();
  const byModelChatter = new Map<string, SplitPcts>();
  for (const r of splits) {
    const pcts: SplitPcts = {
      model_pct: Number(r.model_pct),
      chatter_pct: Number(r.chatter_pct),
      agency_pct: Number(r.agency_pct),
    };
    if (r.scope === "chatter" && r.chatter_user_id) {
      byModelChatter.set(`${r.model_id}:${r.chatter_user_id}`, pcts);
    } else if (r.scope === "model") {
      byModel.set(r.model_id, pcts);
    }
  }

  let defaultPcts = HARDCODED_DEFAULT;
  if (settingsRes.data) {
    const s = settingsRes.data as {
      default_split_model_pct: number | string;
      default_split_chatter_pct: number | string;
      default_split_agency_pct: number | string;
    };
    defaultPcts = {
      model_pct: Number(s.default_split_model_pct),
      chatter_pct: Number(s.default_split_chatter_pct),
      agency_pct: Number(s.default_split_agency_pct),
    };
  }

  return { defaultPcts, byModel, byModelChatter };
}

export function resolveSplit(
  lookup: SplitsLookup,
  modelId: string,
  chatterId: string | null,
): SplitPcts {
  if (chatterId) {
    const c = lookup.byModelChatter.get(`${modelId}:${chatterId}`);
    if (c) return c;
  }
  const m = lookup.byModel.get(modelId);
  if (m) return m;
  return lookup.defaultPcts;
}

export function applySplit(gross: number, pcts: SplitPcts) {
  // Round at 2 decimals so cents stay whole. Agency cut takes the
  // rounding remainder so model+chatter+agency = gross exactly.
  const model = Math.round(gross * pcts.model_pct) / 100;
  const chatter = Math.round(gross * pcts.chatter_pct) / 100;
  const agency = Math.round((gross - model - chatter) * 100) / 100;
  return { model, chatter, agency };
}

// ───────────────────────────────────────────────────────────────────────
// Period report — per-sale rows + aggregated totals
// ───────────────────────────────────────────────────────────────────────

export type SaleRow = {
  date: string;        // ISO created_at / paid_at
  source: "ppv" | "tip";
  modelId: string;
  modelName: string;
  chatterId: string | null;
  chatterName: string;
  fanDisplay: string;
  itemName: string;    // PPV item name or "Tip" / tip message
  gross: number;
  modelCut: number;
  chatterCut: number;
  agencyCut: number;
};

export type PayoutReport = {
  rows: SaleRow[];
  totals: {
    gross: number;
    modelCut: number;
    chatterCut: number;
    agencyCut: number;
    sales: number;
  };
  /** Aggregated by (model, chatter). */
  byPair: {
    modelId: string;
    modelName: string;
    chatterId: string | null;
    chatterName: string;
    sales: number;
    gross: number;
    modelCut: number;
    chatterCut: number;
    agencyCut: number;
  }[];
};

type PpvRow = {
  id: string;
  model_id: string;
  chatter_id: string | null;
  peer_id: string;
  peer_username: string | null;
  total_price: number | string;
  paid_at: string | null;
  created_at: string;
  status: string;
};

type TipRow = {
  id: string;
  model_id: string;
  chatter_id: string | null;
  peer_id: string;
  peer_username: string | null;
  amount: number | string;
  message: string | null;
  paid_at: string | null;
  created_at: string;
  status: string;
};

export type BuildReportArgs = {
  admin: SupabaseClient;
  agencyUserId: string;
  /** ISO inclusive. */
  from: string;
  /** ISO exclusive. */
  to: string;
};

export async function buildPayoutReport({
  admin,
  agencyUserId,
  from,
  to,
}: BuildReportArgs): Promise<PayoutReport> {
  const lookup = await loadSplitsLookup(admin, agencyUserId);

  // Models the agency owns + their names
  const { data: modelsRaw } = await admin
    .from("models")
    .select("id, name")
    .eq("agency_user_id", agencyUserId);
  const models = (modelsRaw ?? []) as { id: string; name: string }[];
  const modelIds = models.map((m) => m.id);
  const nameByModel = new Map(models.map((m) => [m.id, m.name]));
  if (!modelIds.length) {
    return {
      rows: [],
      totals: { gross: 0, modelCut: 0, chatterCut: 0, agencyCut: 0, sales: 0 },
      byPair: [],
    };
  }

  // Paid PPVs and tips in window. Filter by paid_at (fallback created_at).
  const [ppvsRes, tipsRes] = await Promise.all([
    admin
      .from("ppv_sends")
      .select(
        "id, model_id, chatter_id, peer_id, peer_username, total_price, paid_at, created_at, status",
      )
      .in("model_id", modelIds)
      .in("status", ["paid", "delivered"])
      .gte("created_at", from)
      .lt("created_at", to),
    admin
      .from("tips")
      .select(
        "id, model_id, chatter_id, peer_id, peer_username, amount, message, paid_at, created_at, status",
      )
      .in("model_id", modelIds)
      .eq("status", "paid")
      .gte("created_at", from)
      .lt("created_at", to),
  ]);

  const ppvs = (ppvsRes.data ?? []) as PpvRow[];
  const tips = (tipsRes.data ?? []) as TipRow[];

  // Item names for PPV rows — joined from ppv_send_items → ppvs.
  const itemNameBySend = new Map<string, string>();
  if (ppvs.length) {
    const sendIds = ppvs.map((p) => p.id);
    const { data: itemsRaw } = await admin
      .from("ppv_send_items")
      .select("send_id, ordinal, ppvs(name)")
      .in("send_id", sendIds)
      .order("ordinal", { ascending: true });
    type ItemJoin = {
      send_id: string;
      ppvs: { name: string } | { name: string }[] | null;
    };
    const items = (itemsRaw ?? []) as ItemJoin[];
    const itemsBySend = new Map<string, string[]>();
    for (const it of items) {
      const name = Array.isArray(it.ppvs) ? it.ppvs[0]?.name : it.ppvs?.name;
      if (!name) continue;
      const arr = itemsBySend.get(it.send_id) ?? [];
      arr.push(name);
      itemsBySend.set(it.send_id, arr);
    }
    for (const [sendId, names] of itemsBySend.entries()) {
      itemNameBySend.set(
        sendId,
        names.length > 1 ? `${names[0]} +${names.length - 1} more` : names[0],
      );
    }
  }

  // Fan display names — `@username` if known, else peer_id.
  const fanByKey = new Map<string, string>();
  const allFanLookups = [
    ...ppvs.map((p) => ({ modelId: p.model_id, peerId: p.peer_id, username: p.peer_username })),
    ...tips.map((t) => ({ modelId: t.model_id, peerId: t.peer_id, username: t.peer_username })),
  ];
  for (const f of allFanLookups) {
    if (f.username) fanByKey.set(`${f.modelId}:${f.peerId}`, `@${f.username}`);
  }
  // Resolve any still-missing names via the fans table.
  const missingKeys = new Set(
    allFanLookups
      .filter((f) => !fanByKey.has(`${f.modelId}:${f.peerId}`))
      .map((f) => `${f.modelId}:${f.peerId}`),
  );
  if (missingKeys.size) {
    const missingPairs = [...missingKeys].map((k) => k.split(":"));
    const modelIdsMissing = [...new Set(missingPairs.map((p) => p[0]))];
    const peerIdsMissing = [...new Set(missingPairs.map((p) => p[1]))];
    const { data: fansRaw } = await admin
      .from("fans")
      .select("model_id, peer_id, telegram_username, telegram_name")
      .in("model_id", modelIdsMissing)
      .in("peer_id", peerIdsMissing);
    type FanRow = {
      model_id: string;
      peer_id: string;
      telegram_username: string | null;
      telegram_name: string | null;
    };
    for (const f of (fansRaw ?? []) as FanRow[]) {
      const key = `${f.model_id}:${f.peer_id}`;
      if (!fanByKey.has(key)) {
        const disp = f.telegram_username
          ? `@${f.telegram_username}`
          : f.telegram_name || "Fan";
        fanByKey.set(key, disp);
      }
    }
  }

  // Chatter names — resolve each unique chatter_id once via auth.
  const chatterIds = new Set<string>();
  for (const p of ppvs) if (p.chatter_id) chatterIds.add(p.chatter_id);
  for (const t of tips) if (t.chatter_id) chatterIds.add(t.chatter_id);
  const chatterNameById = new Map<string, string>();
  await Promise.all(
    [...chatterIds].map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id);
        const u = data?.user;
        const name =
          (u?.user_metadata?.full_name as string) ||
          (u?.user_metadata?.display_name as string) ||
          u?.email?.split("@")[0] ||
          "Chatter";
        chatterNameById.set(id, name);
      } catch {
        chatterNameById.set(id, "Chatter");
      }
    }),
  );

  const rows: SaleRow[] = [];
  for (const p of ppvs) {
    const gross = Number(p.total_price ?? 0);
    if (!gross) continue;
    const pcts = resolveSplit(lookup, p.model_id, p.chatter_id);
    const cut = applySplit(gross, pcts);
    rows.push({
      date: p.paid_at ?? p.created_at,
      source: "ppv",
      modelId: p.model_id,
      modelName: nameByModel.get(p.model_id) ?? "Model",
      chatterId: p.chatter_id,
      chatterName: p.chatter_id ? chatterNameById.get(p.chatter_id) ?? "Chatter" : "—",
      fanDisplay:
        fanByKey.get(`${p.model_id}:${p.peer_id}`) ??
        (p.peer_username ? `@${p.peer_username}` : "Fan"),
      itemName: itemNameBySend.get(p.id) ?? "PPV",
      gross,
      modelCut: cut.model,
      chatterCut: cut.chatter,
      agencyCut: cut.agency,
    });
  }
  for (const t of tips) {
    const gross = Number(t.amount ?? 0);
    if (!gross) continue;
    const pcts = resolveSplit(lookup, t.model_id, t.chatter_id);
    const cut = applySplit(gross, pcts);
    rows.push({
      date: t.paid_at ?? t.created_at,
      source: "tip",
      modelId: t.model_id,
      modelName: nameByModel.get(t.model_id) ?? "Model",
      chatterId: t.chatter_id,
      chatterName: t.chatter_id ? chatterNameById.get(t.chatter_id) ?? "Chatter" : "—",
      fanDisplay:
        fanByKey.get(`${t.model_id}:${t.peer_id}`) ??
        (t.peer_username ? `@${t.peer_username}` : "Fan"),
      itemName: t.message ? `Tip — ${t.message.slice(0, 40)}` : "Tip",
      gross,
      modelCut: cut.model,
      chatterCut: cut.chatter,
      agencyCut: cut.agency,
    });
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : -1));

  // Aggregates
  const totals = { gross: 0, modelCut: 0, chatterCut: 0, agencyCut: 0, sales: 0 };
  const pairAgg = new Map<
    string,
    {
      modelId: string;
      modelName: string;
      chatterId: string | null;
      chatterName: string;
      sales: number;
      gross: number;
      modelCut: number;
      chatterCut: number;
      agencyCut: number;
    }
  >();
  for (const r of rows) {
    totals.gross += r.gross;
    totals.modelCut += r.modelCut;
    totals.chatterCut += r.chatterCut;
    totals.agencyCut += r.agencyCut;
    totals.sales += 1;

    const key = `${r.modelId}:${r.chatterId ?? "_"}`;
    const cur = pairAgg.get(key);
    if (cur) {
      cur.sales += 1;
      cur.gross += r.gross;
      cur.modelCut += r.modelCut;
      cur.chatterCut += r.chatterCut;
      cur.agencyCut += r.agencyCut;
    } else {
      pairAgg.set(key, {
        modelId: r.modelId,
        modelName: r.modelName,
        chatterId: r.chatterId,
        chatterName: r.chatterName,
        sales: 1,
        gross: r.gross,
        modelCut: r.modelCut,
        chatterCut: r.chatterCut,
        agencyCut: r.agencyCut,
      });
    }
  }
  // Round totals for display.
  totals.gross = Math.round(totals.gross * 100) / 100;
  totals.modelCut = Math.round(totals.modelCut * 100) / 100;
  totals.chatterCut = Math.round(totals.chatterCut * 100) / 100;
  totals.agencyCut = Math.round(totals.agencyCut * 100) / 100;
  const byPair = [...pairAgg.values()].sort((a, b) => b.gross - a.gross);

  return { rows, totals, byPair };
}

/**
 * Serialize a report as CSV: one row per sale.
 *   date | source | model | chatter | fan | item | gross | model_cut | chatter_cut | agency_cut
 */
export function reportToCsv(report: PayoutReport): string {
  const header = [
    "date",
    "source",
    "model",
    "chatter",
    "fan",
    "item",
    "gross",
    "model_cut",
    "chatter_cut",
    "agency_cut",
  ].join(",");
  const body = report.rows
    .map((r) =>
      [
        r.date,
        r.source,
        csv(r.modelName),
        csv(r.chatterName),
        csv(r.fanDisplay),
        csv(r.itemName),
        r.gross.toFixed(2),
        r.modelCut.toFixed(2),
        r.chatterCut.toFixed(2),
        r.agencyCut.toFixed(2),
      ].join(","),
    )
    .join("\n");
  return `${header}\n${body}\n`;
}

function csv(v: string): string {
  if (v == null) return "";
  // Quote when comma, quote, or newline; double inner quotes.
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
