"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import type {
  AdminOverview,
  AdminAgenciesPayload,
  AdminAgencyRow,
  AdminAgencyDetail,
  AdminAgencyFan,
} from "@/lib/admin-types";

// ─── helpers ──────────────────────────────────────────────────────────────
function money(n: number): string {
  return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function initials(name: string): string {
  return name
    .replace(/^@/, "")
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function statusColor(s: string): string {
  const k = (s || "").toLowerCase();
  if (["paid", "delivered", "completed", "approved", "active", "connected"].includes(k))
    return "bg-[#10b981]/15 text-[#10b981]";
  if (["pending", "processing"].includes(k)) return "bg-[#f59e0b]/15 text-[#f59e0b]";
  if (["rejected", "failed", "expired"].includes(k)) return "bg-[#ef4444]/15 text-[#ef4444]";
  return "bg-[#6b7280]/20 text-[#9ca3af]";
}

// ─── small shared UI ──────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  emoji,
  highlight,
}: {
  label: string;
  value: string;
  emoji: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-4 border transition-colors ${
        highlight
          ? "bg-[#6366f1]/10 border-[#6366f1]/40"
          : "bg-[#161a22] border-[#2a2d35] hover:border-[#374151]"
      }`}
    >
      <div className="text-[20px] mb-2">{emoji}</div>
      <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-[22px] font-bold ${highlight ? "text-[#6366f1]" : "text-white"}`}>{value}</div>
    </div>
  );
}

function Panel({
  title,
  children,
  className = "",
  right,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  /** Optional control rendered on the right of the title row (e.g. a
   *  period switcher). Omitting it keeps the legacy layout untouched. */
  right?: React.ReactNode;
}) {
  return (
    <div className={`bg-[#161a22] border border-[#2a2d35] rounded-lg p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-[16px] font-semibold text-white">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function Avatar({ name, n }: { name: string; n?: number }) {
  return (
    <div className="relative w-9 h-9 shrink-0 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-full flex items-center justify-center text-white font-semibold text-[12px]">
      {initials(name) || "?"}
      {n != null && (
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#f59e0b] rounded-full flex items-center justify-center text-[10px] font-bold">
          {n}
        </div>
      )}
    </div>
  );
}

type AdminChartPeriod = "1d" | "7d" | "30d" | "all";

/**
 * GMV chart. See the matching `ChartCanvas` in the agency dashboard for
 * the rationale on `viewBox` + `vectorEffect="non-scaling-stroke"`.
 */
function LineChart({
  data,
  period,
}: {
  data: { date: string; value: number }[];
  period: AdminChartPeriod;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data || data.length === 0) {
    return (
      <div className="h-[180px] flex items-center justify-center text-[13px] text-[#6b7280]">
        No sales in this window.
      </div>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  const VB_W = 100;
  const VB_H = 50;
  const n = data.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * VB_W);
  const y = (v: number) => VB_H - (v / max) * VB_H;

  const linePoints = data.map((d, i) => `${x(i).toFixed(2)},${y(d.value).toFixed(2)}`).join(" ");
  const areaPath =
    `M ${x(0).toFixed(2)},${y(data[0].value).toFixed(2)} ` +
    data.slice(1).map((d, i) => `L ${x(i + 1).toFixed(2)},${y(d.value).toFixed(2)}`).join(" ") +
    ` L ${x(n - 1).toFixed(2)},${VB_H} L ${x(0).toFixed(2)},${VB_H} Z`;
  const targetLabels = period === "7d" ? 7 : 8;
  const stride = Math.max(1, Math.ceil(n / targetLabels));

  return (
    <div className="ml-2 mr-2">
      <div className="relative h-[180px]">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="absolute w-full border-t border-[#2a2d35]"
            style={{ top: `${i * 20}%` }}
          />
        ))}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="adminLineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#adminLineGrad)" />
          <polyline
            points={linePoints}
            fill="none"
            stroke="#6366f1"
            strokeWidth="0.6"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {data.map((point, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${x(i)}%`,
              top: `${(y(point.value) / VB_H) * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="w-3 h-3 bg-[#6366f1] rounded-full border-2 border-[#161a22] cursor-pointer hover:scale-150 transition-transform" />
            {hover === i && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 whitespace-nowrap shadow-xl z-10">
                <div className="text-[11px] text-[#9ca3af]">{point.date}</div>
                <div className="text-[14px] font-bold text-[#6366f1]">{money(point.value)}</div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="relative h-4 mt-2 text-[10px] text-[#6b7280] whitespace-nowrap">
        {data.map((point, i) =>
          i % stride === 0 || i === n - 1 ? (
            <span
              key={i}
              className="absolute"
              // See agency dashboard ChartCanvas for rationale: edge labels
              // get pinned to their edge so they don't wrap.
              style={
                i === 0
                  ? { left: 0 }
                  : i === n - 1
                    ? { right: 0 }
                    : { left: `${x(i)}%`, transform: "translateX(-50%)" }
              }
            >
              {point.date}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

function PeriodSwitcher({
  value,
  onChange,
}: {
  value: AdminChartPeriod;
  onChange: (p: AdminChartPeriod) => void;
}) {
  return (
    <div className="flex bg-[#0d1117] border border-[#2a2d35] rounded-lg p-0.5 text-[12px]">
      {(["1d", "7d", "30d", "all"] as AdminChartPeriod[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`px-3 py-1 rounded-md transition-colors ${
            value === p ? "bg-[#6366f1] text-white" : "text-[#9ca3af] hover:text-white"
          }`}
        >
          {p === "1d" ? "1 Day" : p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "All Time"}
        </button>
      ))}
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-[12px] text-red-400">{msg}</div>
  );
}

function PartialBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-lg text-[12px] text-[#f59e0b]">
      <span>⚠ Some data didn&apos;t finish loading (slow connection) — figures may be understated.</span>
      <button
        onClick={onRetry}
        className="px-3 py-1 rounded-md bg-[#f59e0b]/20 hover:bg-[#f59e0b]/30 font-medium shrink-0"
      >
        Refresh
      </button>
    </div>
  );
}

function FanRowItem({ fan }: { fan: AdminAgencyFan }) {
  const primary = fan.username ? `@${fan.username}` : fan.name;
  const secondary = fan.username ? fan.name : `ID ${fan.peerId}`;
  return (
    <div className="flex items-center gap-3 p-3 bg-[#1f2937]/30 rounded-lg">
      <Avatar name={fan.name} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-white truncate">{primary}</div>
        <div className="text-[11px] text-[#6b7280] truncate">
          {secondary} · {fan.modelName}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[14px] font-bold text-[#6366f1]">{money(fan.spent)}</div>
        <div className="text-[10px] text-[#6b7280]">{fmtDate(fan.lastSeen)}</div>
      </div>
    </div>
  );
}

// ─── Overview ───────────────────────────────────────────────────────────────
function OverviewView({ onOpenAgency }: { onOpenAgency: (id: string) => void }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [err, setErr] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  // Chart-only window — the headline cards above are unaffected.
  const [period, setPeriod] = useState<AdminChartPeriod>("7d");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/overview?period=${period}`);
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setErr("");
        setData(j as AdminOverview);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, period]);

  const feePct = data ? Math.round(data.feePct * 100) : 10;
  const cards: { label: string; value: string; emoji: string; highlight?: boolean }[] = data
    ? [
        { label: "GMV — All Time", value: money(data.gmvAllTime), emoji: "🌐" },
        { label: `Platform Rev (${feePct}%) — All Time`, value: money(data.platformRevenueAllTime), emoji: "🏦", highlight: true },
        { label: `Agencies' Net (${100 - feePct}%)`, value: money(data.agencyNetAllTime), emoji: "🤝" },
        { label: "GMV — Today", value: money(data.gmvToday), emoji: "💵" },
        { label: `Platform Rev (${feePct}%) — Today`, value: money(data.platformRevenueToday), emoji: "📈", highlight: true },
        { label: "GMV — This Month", value: money(data.gmvMonth), emoji: "📅" },
        { label: "Sales", value: String(data.sales), emoji: "👁️" },
        { label: "Avg Order", value: money(data.avgOrder), emoji: "🛒" },
        { label: "Agencies", value: String(data.agencies), emoji: "🏢" },
        { label: "Models", value: String(data.models), emoji: "👤" },
        { label: "Chatters", value: String(data.chatters), emoji: "💬" },
        { label: "Paying Fans", value: `${data.payingFans} / ${data.fans}`, emoji: "⭐" },
      ]
    : Array.from({ length: 12 }, () => ({ label: "Loading…", value: "…", emoji: "•" }));

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div>
          <h1 className="text-[24px] font-bold text-white mb-1">Platform Overview 🛡️</h1>
          <p className="text-[14px] text-[#9ca3af]">Everything across every agency, live.</p>
        </div>

        {err && <ErrorBanner msg={err} />}
        {data?.partial && <PartialBanner onRetry={() => setReloadKey((k) => k + 1)} />}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((c, i) => (
            <StatCard key={i} {...c} />
          ))}
        </div>

        <Panel
          title="GMV 📈"
          right={<PeriodSwitcher value={period} onChange={setPeriod} />}
        >
          <LineChart data={data?.chart ?? []} period={period} />
        </Panel>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top agencies */}
          <Panel title="Top Agencies 🏢">
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {(data?.topAgencies ?? []).length === 0 ? (
                <div className="py-6 text-center text-[13px] text-[#6b7280]">{data ? "No sales yet." : "Loading…"}</div>
              ) : (
                data!.topAgencies.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => onOpenAgency(a.id)}
                    className="w-full flex items-center gap-3 p-3 bg-[#1f2937]/30 rounded-lg hover:bg-[#1f2937]/60 transition-colors text-left"
                  >
                    <Avatar name={a.name} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-white truncate">{a.name}</div>
                      <div className="text-[11px] text-[#6b7280]">{a.sales} sales · fee {money(a.fee)}</div>
                    </div>
                    <div className="text-[14px] font-bold text-[#6366f1] shrink-0">{money(a.gmv)}</div>
                  </button>
                ))
              )}
            </div>
          </Panel>

          {/* Top models */}
          <Panel title="Top Models 👤">
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {(data?.topModels ?? []).length === 0 ? (
                <div className="py-6 text-center text-[13px] text-[#6b7280]">{data ? "No sales yet." : "Loading…"}</div>
              ) : (
                data!.topModels.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 bg-[#1f2937]/30 rounded-lg">
                    <Avatar name={m.name} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-white truncate">{m.name}</div>
                      <div className="text-[11px] text-[#6b7280] truncate">
                        {m.agencyName} · {m.sales} sales
                      </div>
                    </div>
                    <div className="text-[14px] font-bold text-[#6366f1] shrink-0">{money(m.gmv)}</div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          {/* Top fans */}
          <Panel title="Top Fans 🏆">
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {(data?.topFans ?? []).length === 0 ? (
                <div className="py-6 text-center text-[13px] text-[#6b7280]">
                  {data ? "No paying fans yet." : "Loading…"}
                </div>
              ) : (
                data!.topFans.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-[#1f2937]/30 rounded-lg">
                    <Avatar name={f.name} n={idx + 1} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-white truncate">
                        {f.username ? `@${f.username}` : f.name}
                      </div>
                      <div className="text-[11px] text-[#6b7280] truncate">
                        {f.agencyName} · {f.modelName}
                      </div>
                    </div>
                    <div className="text-[14px] font-bold text-[#6366f1] shrink-0">{money(f.spent)}</div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ─── Agencies list ────────────────────────────────────────────────────────────
function AgenciesView({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<AdminAgencyRow[] | null>(null);
  const [partial, setPartial] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/agencies");
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        const payload = j as AdminAgenciesPayload;
        setErr("");
        setRows(payload.agencies);
        setPartial(!!payload.partial);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s));
  }, [rows, q]);

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-bold text-white mb-1">Agencies 🏢</h1>
            <p className="text-[14px] text-[#9ca3af]">{rows ? `${rows.length} total` : "Loading…"} · click a row for full stats</p>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email…"
            className="bg-[#1f2937] border border-[#374151] rounded-lg px-3.5 py-2 text-[13px] text-white placeholder:text-[#6b7280] outline-none focus:border-[#6366f1] w-full sm:w-[280px]"
          />
        </div>

        {err && <ErrorBanner msg={err} />}
        {partial && <PartialBanner onRetry={() => setReloadKey((k) => k + 1)} />}

        <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[2fr_repeat(6,1fr)] gap-3 p-4 border-b border-[#2a2d35] bg-[#1f2937]/30 text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold">
              <div>Agency</div>
              <div className="text-right">Models</div>
              <div className="text-right">Chatters</div>
              <div className="text-right">Fans</div>
              <div className="text-right">Sales</div>
              <div className="text-right">GMV</div>
              <div className="text-right">Platform fee</div>
            </div>
            {filtered.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[#6b7280]">
                {rows ? "No agencies found." : "Loading…"}
              </div>
            ) : (
              filtered.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onOpen(a.id)}
                  className="w-full grid grid-cols-[2fr_repeat(6,1fr)] gap-3 p-4 border-b border-[#2a2d35] last:border-b-0 hover:bg-[#1f2937]/30 transition-colors text-left items-center"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={a.name} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-white truncate">{a.name}</div>
                      <div className="text-[11px] text-[#6b7280] truncate">{a.email || "—"}</div>
                    </div>
                  </div>
                  <div className="text-right text-[13px] text-[#d1d5db]">{a.models}</div>
                  <div className="text-right text-[13px] text-[#d1d5db]">{a.chatters}</div>
                  <div className="text-right text-[13px] text-[#d1d5db]">{a.fans}</div>
                  <div className="text-right text-[13px] text-[#d1d5db]">{a.sales}</div>
                  <div className="text-right text-[13px] font-bold text-[#6366f1]">{money(a.gmv)}</div>
                  <div className="text-right text-[13px] text-[#10b981]">{money(a.fee)}</div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Agency drill-down ────────────────────────────────────────────────────────
function AgencyDetail({ agencyId, onBack }: { agencyId: string; onBack: () => void }) {
  const [data, setData] = useState<AdminAgencyDetail | null>(null);
  const [err, setErr] = useState("");
  const [fanQ, setFanQ] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/agencies/${agencyId}`);
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setErr("");
        setData(j as AdminAgencyDetail);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agencyId, reloadKey]);

  const fans = useMemo(() => {
    if (!data) return [];
    const s = fanQ.trim().toLowerCase();
    if (!s) return data.fans;
    return data.fans.filter(
      (f) =>
        (f.username ?? "").toLowerCase().includes(s) ||
        f.name.toLowerCase().includes(s) ||
        f.modelName.toLowerCase().includes(s),
    );
  }, [data, fanQ]);

  const feePct = data ? Math.round(data.feePct * 100) : 10;

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[13px] text-[#9ca3af] hover:text-white transition-colors"
        >
          <span>←</span> Back to agencies
        </button>

        {err && <ErrorBanner msg={err} />}
        {data?.partial && <PartialBanner onRetry={() => setReloadKey((k) => k + 1)} />}

        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-14 h-14 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-2xl flex items-center justify-center text-white font-bold text-[20px] shrink-0">
            {initials(data?.name ?? "Agency") || "A"}
          </div>
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold text-white truncate">{data?.name ?? "Loading…"}</h1>
            <p className="text-[13px] text-[#9ca3af] truncate">
              {data?.email || "—"}
              {data?.payoutAddress ? ` · payout: ${data.payoutAddress}` : ""}
            </p>
          </div>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="GMV — All Time" value={data ? money(data.gmv) : "…"} emoji="🌐" />
          <StatCard label={`Platform Fee (${feePct}%)`} value={data ? money(data.fee) : "…"} emoji="🏦" highlight />
          <StatCard label={`Agency Net (${100 - feePct}%)`} value={data ? money(data.net) : "…"} emoji="🤝" />
          <StatCard label="Avg Order" value={data ? money(data.avgOrder) : "…"} emoji="🛒" />
          <StatCard label="Sales" value={data ? String(data.sales) : "…"} emoji="👁️" />
          <StatCard label="Models" value={data ? String(data.modelsCount) : "…"} emoji="👤" />
          <StatCard label="Chatters" value={data ? String(data.chattersCount) : "…"} emoji="💬" />
          <StatCard label="Paying Fans" value={data ? `${data.payingFans} / ${data.fansCount}` : "…"} emoji="⭐" />
        </div>

        {/* Models + Chatters */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Models 👤">
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {(data?.models ?? []).length === 0 ? (
                <div className="py-6 text-center text-[13px] text-[#6b7280]">{data ? "No creators." : "Loading…"}</div>
              ) : (
                data!.models.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 bg-[#1f2937]/30 rounded-lg">
                    <Avatar name={m.name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-white truncate">{m.name}</span>
                        {m.sessionStatus === "expired" && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#ef4444]/15 text-[#ef4444]">
                            expired
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#6b7280]">
                        {m.sales} sales · {m.fans} fans
                      </div>
                    </div>
                    <div className="text-[14px] font-bold text-[#6366f1] shrink-0">{money(m.gmv)}</div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="Chatters 💬">
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {(data?.chatters ?? []).length === 0 ? (
                <div className="py-6 text-center text-[13px] text-[#6b7280]">{data ? "No chatters." : "Loading…"}</div>
              ) : (
                data!.chatters.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 p-3 bg-[#1f2937]/30 rounded-lg">
                    <Avatar name={c.name} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-white truncate">{c.name}</div>
                      <div className="text-[11px] text-[#6b7280]">{c.sales} sales</div>
                    </div>
                    <div className="text-[14px] font-bold text-[#6366f1] shrink-0">{money(c.gmv)}</div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        {/* Top fans + recent sales */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Top Fans 🏆">
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {(data?.topFans ?? []).length === 0 ? (
                <div className="py-6 text-center text-[13px] text-[#6b7280]">{data ? "No paying fans yet." : "Loading…"}</div>
              ) : (
                data!.topFans.map((f, idx) => (
                  <div key={`${f.peerId}-${idx}`} className="relative">
                    <FanRowItem fan={f} />
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="Recent Sales 🧾">
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {(data?.recentSales ?? []).length === 0 ? (
                <div className="py-6 text-center text-[13px] text-[#6b7280]">{data ? "No sales yet." : "Loading…"}</div>
              ) : (
                data!.recentSales.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-3 bg-[#1f2937]/30 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-white truncate">{s.modelName}</div>
                      <div className="text-[11px] text-[#6b7280]">{fmtDateTime(s.createdAt)}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(s.status)}`}>
                      {s.status}
                    </span>
                    <div className="text-[14px] font-bold text-[#6366f1] shrink-0 w-[72px] text-right">{money(s.price)}</div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        {/* Payouts */}
        <Panel title="Payouts 💸">
          {(data?.payouts ?? []).length === 0 ? (
            <div className="py-6 text-center text-[13px] text-[#6b7280]">{data ? "No payout requests." : "Loading…"}</div>
          ) : (
            <div className="space-y-2">
              {data!.payouts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 bg-[#1f2937]/30 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-white">{money(p.amount)}</div>
                    <div className="text-[11px] text-[#6b7280]">{fmtDateTime(p.createdAt)}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(p.status)}`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Full fan list with usernames */}
        <Panel title="All Fans — usernames 👥">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <p className="text-[12px] text-[#6b7280]">
              {data ? `${data.fansCount} captured${data.fansCount > data.fans.length ? ` (showing ${data.fans.length})` : ""}` : "Loading…"}
            </p>
            <input
              value={fanQ}
              onChange={(e) => setFanQ(e.target.value)}
              placeholder="Search fans…"
              className="bg-[#1f2937] border border-[#374151] rounded-lg px-3.5 py-2 text-[13px] text-white placeholder:text-[#6b7280] outline-none focus:border-[#6366f1] w-full sm:w-[260px]"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[480px] overflow-y-auto pr-1">
            {fans.length === 0 ? (
              <div className="py-6 text-center text-[13px] text-[#6b7280] md:col-span-2">
                {data ? "No fans match." : "Loading…"}
              </div>
            ) : (
              fans.map((f) => <FanRowItem key={f.peerId} fan={f} />)
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function SettingsView() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (!cancelled) setEmail(user?.email ?? "");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setMsg(null);
    if (pw.length < 8) {
      setMsg({ ok: false, text: "Minimum 8 characters" });
      return;
    }
    if (pw !== pw2) {
      setMsg({ ok: false, text: "Passwords don't match" });
      return;
    }
    setBusy(true);
    try {
      const { error } = await createClient().auth.updateUser({ password: pw });
      if (error) throw error;
      setMsg({ ok: true, text: "Password updated ✓" });
      setPw("");
      setPw2("");
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-[560px] mx-auto space-y-6">
        <div>
          <h1 className="text-[24px] font-bold text-white mb-1">Settings ⚙️</h1>
          <p className="text-[14px] text-[#9ca3af]">Administrator account</p>
        </div>

        <Panel title="Account">
          <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider mb-1">Email</div>
          <div className="text-[14px] text-white">{email || "…"}</div>
        </Panel>

        <Panel title="Change password 🔒">
          <div className="space-y-3">
            <div>
              <label className="block text-[12px] text-[#9ca3af] mb-1.5">New password</label>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full bg-[#1f2937] border border-[#374151] rounded-lg px-3.5 py-2.5 text-[14px] text-white placeholder:text-[#6b7280] outline-none focus:border-[#6366f1]"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[#9ca3af] mb-1.5">Repeat password</label>
              <input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="Again"
                className="w-full bg-[#1f2937] border border-[#374151] rounded-lg px-3.5 py-2.5 text-[14px] text-white placeholder:text-[#6b7280] outline-none focus:border-[#6366f1]"
              />
            </div>
            {msg && <div className={`text-[12px] ${msg.ok ? "text-[#10b981]" : "text-red-400"}`}>{msg.text}</div>}
            <button
              onClick={save}
              disabled={busy || !pw || !pw2}
              className="px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Update password"}
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ─── Shell ──────────────────────────────────────────────────────────────────
type Tab = "overview" | "agencies" | "settings";
const NAV: { id: Tab; label: string; emoji: string }[] = [
  { id: "overview", label: "Overview", emoji: "📊" },
  { id: "agencies", label: "Agencies", emoji: "🏢" },
  { id: "settings", label: "Settings", emoji: "⚙️" },
];

export function AdminClient() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null);

  function openAgency(id: string) {
    setSelectedAgency(id);
    setTab("agencies");
  }
  function switchTab(t: Tab) {
    setTab(t);
    if (t !== "agencies") setSelectedAgency(null);
  }
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0d1117] text-white">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[220px] bg-[#161a22] border-r border-[#2a2d35] flex-col shrink-0">
        <div className="h-[52px] border-b border-[#2a2d35] px-5 flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-[14px]">P</span>
          </div>
          <div className="text-[15px] font-semibold">
            ppvs<span className="text-[#6366f1]">.io</span>
          </div>
          <span className="text-[12px] px-2 py-0.5 bg-[#ef4444]/15 text-[#ef4444] rounded-full font-medium">Admin</span>
        </div>
        <div className="flex-1 py-4 px-3 space-y-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => switchTab(item.id)}
              className={`w-full px-4 py-2.5 rounded-lg flex items-center gap-3 transition-all ${
                tab === item.id
                  ? "bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white shadow-lg shadow-[#6366f1]/20"
                  : "text-[#9ca3af] hover:bg-[#1f2937] hover:text-white"
              }`}
            >
              <span className="text-[16px]">{item.emoji}</span>
              <span className="text-[13px] font-medium">{item.label}</span>
            </button>
          ))}
          <div className="my-4 border-t border-[#2a2d35]" />
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2.5 rounded-lg flex items-center gap-3 text-[#ef4444] hover:bg-[#ef4444]/10 transition-all"
          >
            <span className="text-[16px] leading-none">⎋</span>
            <span className="text-[13px] font-medium">Sign out</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-2 border-b border-[#2a2d35] bg-[#161a22] px-3 py-2 overflow-x-auto">
          <span className="text-[13px] font-semibold shrink-0">
            ppvs<span className="text-[#6366f1]">.io</span>
          </span>
          <span className="text-[10px] px-1.5 py-0.5 bg-[#ef4444]/15 text-[#ef4444] rounded-full font-medium shrink-0">
            Admin
          </span>
          <div className="flex-1" />
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => switchTab(item.id)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium shrink-0 ${
                tab === item.id ? "bg-[#6366f1] text-white" : "text-[#9ca3af] bg-[#1f2937]"
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            onClick={handleSignOut}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium shrink-0 text-[#ef4444] bg-[#ef4444]/10"
          >
            ⎋
          </button>
        </div>

        <main className="flex-1 overflow-y-auto">
          {tab === "overview" && <OverviewView onOpenAgency={openAgency} />}
          {tab === "agencies" &&
            (selectedAgency ? (
              <AgencyDetail key={selectedAgency} agencyId={selectedAgency} onBack={() => setSelectedAgency(null)} />
            ) : (
              <AgenciesView onOpen={(id) => setSelectedAgency(id)} />
            ))}
          {tab === "settings" && <SettingsView />}
        </main>
      </div>
    </div>
  );
}
