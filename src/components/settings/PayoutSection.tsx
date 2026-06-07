"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";

/**
 * Payout & Splits — agency Settings section.
 *
 * Three concerns:
 *   1. Global default split (model%, chatter%, agency%) — applied to every
 *      sale unless a per-model or per-(model,chatter) override exists.
 *   2. Per-model overrides — table view, add/edit/delete.
 *   3. Per-(model, chatter) overrides — table view, add/edit/delete.
 *
 * Plus a live period breakdown (this month by default) with totals and
 * an Export CSV button that streams raw transactions for bookkeeping.
 */

type DefaultSplit = {
  default_split_model_pct: number;
  default_split_chatter_pct: number;
  default_split_agency_pct: number;
};

type SplitRow = {
  id: string;
  scope: "model" | "chatter";
  model_id: string;
  chatter_user_id: string | null;
  model_pct: number;
  chatter_pct: number;
  agency_pct: number;
};

type ModelLite = { id: string; name: string };
type ChatterLite = { id: string; name: string };

type PairAgg = {
  modelId: string;
  modelName: string;
  chatterId: string | null;
  chatterName: string;
  sales: number;
  gross: number;
  modelCut: number;
  chatterCut: number;
  agencyCut: number;
};
type ReportTotals = {
  gross: number;
  modelCut: number;
  chatterCut: number;
  agencyCut: number;
  sales: number;
};

function todayYMD(): string {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonthYMD(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function fmt$(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function PayoutSection() {
  const supabase = createClient();

  const [defaultSplit, setDefaultSplit] = useState<DefaultSplit>({
    default_split_model_pct: 50,
    default_split_chatter_pct: 20,
    default_split_agency_pct: 30,
  });
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [models, setModels] = useState<ModelLite[]>([]);
  const [chatters, setChatters] = useState<ChatterLite[]>([]);
  const [msg, setMsg] = useState("");

  // Period
  const [from, setFrom] = useState(firstOfMonthYMD());
  const [to, setTo] = useState(todayYMD());
  const [report, setReport] = useState<{ totals: ReportTotals; byPair: PairAgg[] } | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setMsg("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Splits + default
    const r1 = await fetch("/api/payout/splits");
    if (r1.ok) {
      const j = (await r1.json()) as { splits: SplitRow[]; default: DefaultSplit };
      setSplits(j.splits ?? []);
      setDefaultSplit(j.default);
    }

    // Models the agency owns
    const { data: mRows } = await supabase
      .from("models")
      .select("id, name")
      .eq("agency_user_id", user.id);
    setModels((mRows ?? []) as ModelLite[]);

    // Chatters working for the agency (via agency_chatters join with invitations).
    // We use the invitation email as the display name since auth.users isn't
    // queryable from the client.
    const { data: links } = await supabase
      .from("agency_chatters")
      .select("chatter_id, invitations:invitation_id(chatter_email)")
      .eq("agency_id", user.id);
    type LinkRow = {
      chatter_id: string;
      invitations: { chatter_email: string } | { chatter_email: string }[] | null;
    };
    const rows = (links ?? []) as LinkRow[];
    const seen = new Set<string>();
    const list: ChatterLite[] = [];
    for (const r of rows) {
      if (seen.has(r.chatter_id)) continue;
      seen.add(r.chatter_id);
      const inv = Array.isArray(r.invitations) ? r.invitations[0] : r.invitations;
      list.push({
        id: r.chatter_id,
        name: inv?.chatter_email ?? r.chatter_id.slice(0, 8),
      });
    }
    setChatters(list);

    void loadReport();
  }

  async function loadReport() {
    setLoadingReport(true);
    try {
      const r = await fetch(`/api/payout/report?from=${from}&to=${to}`);
      if (r.ok) {
        const j = (await r.json()) as { totals: ReportTotals; byPair: PairAgg[] };
        setReport({ totals: j.totals, byPair: j.byPair });
      }
    } finally {
      setLoadingReport(false);
    }
  }

  async function saveDefault(next: DefaultSplit) {
    const sum =
      Number(next.default_split_model_pct) +
      Number(next.default_split_chatter_pct) +
      Number(next.default_split_agency_pct);
    if (Math.abs(sum - 100) > 0.01) {
      setMsg(`Error: must sum to 100 (now ${sum.toFixed(2)})`);
      return;
    }
    setDefaultSplit(next);
    const r = await fetch("/api/payout/splits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        default: {
          model_pct: next.default_split_model_pct,
          chatter_pct: next.default_split_chatter_pct,
          agency_pct: next.default_split_agency_pct,
        },
      }),
    });
    if (r.ok) {
      setMsg("Default split saved ✓");
      void loadReport();
    } else {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setMsg(`Error: ${j.error ?? "save failed"}`);
    }
  }

  async function saveOverride(payload: {
    scope: "model" | "chatter";
    model_id: string;
    chatter_user_id?: string | null;
    model_pct: number;
    chatter_pct: number;
    agency_pct: number;
  }) {
    const r = await fetch("/api/payout/splits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      setMsg("Override saved ✓");
      await loadAll();
    } else {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setMsg(`Error: ${j.error ?? "save failed"}`);
    }
  }

  async function deleteOverride(id: string) {
    const r = await fetch(`/api/payout/splits?id=${id}`, { method: "DELETE" });
    if (r.ok) await loadAll();
  }

  const card = "bg-[#161a22] border border-[#2a2d35] rounded-xl p-5 md:p-6";
  const input =
    "w-full px-3 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1]";
  const btn =
    "px-4 py-2 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[12px] hover:from-[#5558e3] hover:to-[#4338ca] transition-all disabled:opacity-50";
  const btnGhost =
    "px-3 py-1.5 bg-[#1f2937] border border-[#374151] text-white rounded text-[11px] hover:bg-[#252b36]";

  const nameByModel = useMemo(() => new Map(models.map((m) => [m.id, m.name])), [models]);
  const nameByChatter = useMemo(() => new Map(chatters.map((c) => [c.id, c.name])), [chatters]);

  return (
    <div className={card}>
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold text-white">Payout & Splits</h2>
        <p className="text-[12px] text-[#9ca3af] mt-0.5">
          Configure revenue split between model, chatter, and agency. Per-model
          and per-chatter overrides supported.
        </p>
      </div>

      {/* DEFAULT */}
      <div className="mb-6">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#9ca3af] mb-2">
          Default split (applied to every sale unless overridden)
        </h3>
        <PercentTriplet
          model={defaultSplit.default_split_model_pct}
          chatter={defaultSplit.default_split_chatter_pct}
          agency={defaultSplit.default_split_agency_pct}
          onSave={(m, c, a) =>
            saveDefault({
              default_split_model_pct: m,
              default_split_chatter_pct: c,
              default_split_agency_pct: a,
            })
          }
        />
      </div>

      {/* OVERRIDES */}
      <div className="mb-6">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#9ca3af] mb-2">
          Overrides
        </h3>
        <div className="space-y-2">
          {splits.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 bg-[#0f131a] border border-[#2a2d35] rounded-lg p-2.5"
            >
              <div className="flex-1 text-[12px] text-white">
                <div className="font-medium">
                  {nameByModel.get(s.model_id) ?? "Model"}
                  {s.scope === "chatter" && s.chatter_user_id && (
                    <>
                      {" "}
                      → {nameByChatter.get(s.chatter_user_id) ?? "Chatter"}
                    </>
                  )}
                </div>
                <div className="text-[11px] text-[#9ca3af]">
                  Model {Number(s.model_pct).toFixed(0)}% · Chatter {Number(s.chatter_pct).toFixed(0)}% · Agency{" "}
                  {Number(s.agency_pct).toFixed(0)}%
                </div>
              </div>
              <button className={btnGhost} onClick={() => deleteOverride(s.id)}>
                Delete
              </button>
            </div>
          ))}
          {!splits.length && (
            <div className="text-[12px] text-[#6b7280] italic">No overrides yet.</div>
          )}
        </div>
        <NewOverrideForm
          models={models}
          chatters={chatters}
          onSave={saveOverride}
          btn={btn}
          input={input}
        />
      </div>

      {/* PERIOD REPORT */}
      <div>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#9ca3af] mb-2">
          Period breakdown
        </h3>
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <div>
            <label className="text-[11px] text-[#9ca3af] block mb-1">From</label>
            <input
              type="date"
              className={input}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[11px] text-[#9ca3af] block mb-1">To</label>
            <input
              type="date"
              className={input}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <button className={btn} onClick={loadReport} disabled={loadingReport}>
            {loadingReport ? "Loading…" : "Apply"}
          </button>
          <a
            className={btn}
            href={`/api/payout/export?from=${from}&to=${to}`}
            download
          >
            Export CSV
          </a>
        </div>

        {report && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat title="Gross" value={fmt$(report.totals.gross)} />
              <Stat title="Model cut" value={fmt$(report.totals.modelCut)} />
              <Stat title="Chatter cut" value={fmt$(report.totals.chatterCut)} />
              <Stat title="Agency cut" value={fmt$(report.totals.agencyCut)} />
            </div>
            {report.byPair.length > 0 && (
              <div className="bg-[#0f131a] border border-[#2a2d35] rounded-lg overflow-hidden mt-3">
                <table className="w-full text-[12px]">
                  <thead className="bg-[#161a22]">
                    <tr className="text-left text-[#9ca3af]">
                      <th className="px-3 py-2">Model</th>
                      <th className="px-3 py-2">Chatter</th>
                      <th className="px-3 py-2 text-right">Sales</th>
                      <th className="px-3 py-2 text-right">Gross</th>
                      <th className="px-3 py-2 text-right">Model</th>
                      <th className="px-3 py-2 text-right">Chatter</th>
                      <th className="px-3 py-2 text-right">Agency</th>
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    {report.byPair.map((p) => (
                      <tr key={`${p.modelId}:${p.chatterId ?? "_"}`} className="border-t border-[#2a2d35]">
                        <td className="px-3 py-2">{p.modelName}</td>
                        <td className="px-3 py-2">{p.chatterName}</td>
                        <td className="px-3 py-2 text-right">{p.sales}</td>
                        <td className="px-3 py-2 text-right">{fmt$(p.gross)}</td>
                        <td className="px-3 py-2 text-right">{fmt$(p.modelCut)}</td>
                        <td className="px-3 py-2 text-right">{fmt$(p.chatterCut)}</td>
                        <td className="px-3 py-2 text-right">{fmt$(p.agencyCut)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {msg && (
        <p
          className={`mt-3 text-[11px] ${msg.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}
        >
          {msg}
        </p>
      )}
    </div>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-[#0f131a] border border-[#2a2d35] rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-[#9ca3af]">
        {title}
      </div>
      <div className="text-[16px] font-semibold text-white mt-0.5">{value}</div>
    </div>
  );
}

function PercentTriplet({
  model,
  chatter,
  agency,
  onSave,
}: {
  model: number;
  chatter: number;
  agency: number;
  onSave: (m: number, c: number, a: number) => void;
}) {
  const [m, setM] = useState(model);
  const [c, setC] = useState(chatter);
  const [a, setA] = useState(agency);
  useEffect(() => {
    setM(model);
    setC(chatter);
    setA(agency);
  }, [model, chatter, agency]);
  const sum = Number(m) + Number(c) + Number(a);
  const ok = Math.abs(sum - 100) < 0.01;
  const inputCls =
    "w-20 px-2 py-1.5 bg-[#1f2937] border border-[#374151] rounded text-[12px] text-white focus:outline-none focus:border-[#6366f1]";
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Pct label="Model %" value={m} onChange={setM} inputCls={inputCls} />
      <Pct label="Chatter %" value={c} onChange={setC} inputCls={inputCls} />
      <Pct label="Agency %" value={a} onChange={setA} inputCls={inputCls} />
      <div className={`text-[11px] ${ok ? "text-emerald-400" : "text-red-400"}`}>
        Sum: {sum.toFixed(2)}
      </div>
      <button
        disabled={!ok}
        onClick={() => onSave(Number(m), Number(c), Number(a))}
        className="px-4 py-2 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[12px] hover:from-[#5558e3] hover:to-[#4338ca] transition-all disabled:opacity-50"
      >
        Save default
      </button>
    </div>
  );
}

function Pct({
  label,
  value,
  onChange,
  inputCls,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  inputCls: string;
}) {
  return (
    <div>
      <label className="text-[11px] text-[#9ca3af] block mb-1">{label}</label>
      <input
        className={inputCls}
        type="number"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function NewOverrideForm({
  models,
  chatters,
  onSave,
  btn,
  input,
}: {
  models: ModelLite[];
  chatters: ChatterLite[];
  onSave: (p: {
    scope: "model" | "chatter";
    model_id: string;
    chatter_user_id?: string | null;
    model_pct: number;
    chatter_pct: number;
    agency_pct: number;
  }) => Promise<void>;
  btn: string;
  input: string;
}) {
  const [scope, setScope] = useState<"model" | "chatter">("model");
  const [modelId, setModelId] = useState<string>("");
  const [chatterId, setChatterId] = useState<string>("");
  const [m, setM] = useState(50);
  const [c, setC] = useState(20);
  const [a, setA] = useState(30);

  useEffect(() => {
    if (!modelId && models.length) setModelId(models[0].id);
  }, [models, modelId]);
  useEffect(() => {
    if (scope === "chatter" && !chatterId && chatters.length) setChatterId(chatters[0].id);
  }, [scope, chatters, chatterId]);

  const sum = m + c + a;
  const ok = Math.abs(sum - 100) < 0.01 && modelId && (scope === "model" || chatterId);

  return (
    <div className="mt-3 bg-[#0f131a] border border-[#2a2d35] rounded-lg p-3 space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">
        Add override
      </div>
      <div className="flex flex-wrap gap-2">
        <select className={input + " w-auto"} value={scope} onChange={(e) => setScope(e.target.value as "model" | "chatter")}>
          <option value="model">Model</option>
          <option value="chatter">Model + Chatter</option>
        </select>
        <select className={input + " w-auto"} value={modelId} onChange={(e) => setModelId(e.target.value)}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        {scope === "chatter" && (
          <select className={input + " w-auto"} value={chatterId} onChange={(e) => setChatterId(e.target.value)}>
            {chatters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            {!chatters.length && <option value="">No chatters yet</option>}
          </select>
        )}
        <input className={input + " w-20"} type="number" placeholder="Model %" value={m} onChange={(e) => setM(Number(e.target.value))} />
        <input className={input + " w-20"} type="number" placeholder="Chatter %" value={c} onChange={(e) => setC(Number(e.target.value))} />
        <input className={input + " w-20"} type="number" placeholder="Agency %" value={a} onChange={(e) => setA(Number(e.target.value))} />
        <button
          className={btn}
          disabled={!ok}
          onClick={async () => {
            await onSave({
              scope,
              model_id: modelId,
              chatter_user_id: scope === "chatter" ? chatterId : null,
              model_pct: m,
              chatter_pct: c,
              agency_pct: a,
            });
          }}
        >
          Add
        </button>
      </div>
      <div className={`text-[11px] ${Math.abs(sum - 100) < 0.01 ? "text-emerald-400" : "text-red-400"}`}>
        Sum: {sum.toFixed(2)}
      </div>
    </div>
  );
}
