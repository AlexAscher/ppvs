"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
          ? "bg-[#00AFF0]/10 border-[#00AFF0]/40"
          : "bg-[#161a22] border-[#2a2d35] hover:border-[#374151]"
      }`}
    >
      <div className="text-[20px] mb-2">{emoji}</div>
      <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-[22px] font-bold ${highlight ? "text-[#00AFF0]" : "text-white"}`}>{value}</div>
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
    <div className="relative w-9 h-9 shrink-0 bg-gradient-to-br from-[#00AFF0] to-[#00AFF0] rounded-full flex items-center justify-center text-white font-semibold text-[12px]">
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
              <stop offset="0%" stopColor="#00AFF0" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#00AFF0" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#adminLineGrad)" />
          <polyline
            points={linePoints}
            fill="none"
            stroke="#00AFF0"
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
            <div className="w-3 h-3 bg-[#00AFF0] rounded-full border-2 border-[#161a22] cursor-pointer hover:scale-150 transition-transform" />
            {hover === i && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 whitespace-nowrap shadow-xl z-10">
                <div className="text-[11px] text-[#9ca3af]">{point.date}</div>
                <div className="text-[14px] font-bold text-[#00AFF0]">{money(point.value)}</div>
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
            value === p ? "bg-[#00AFF0] text-white" : "text-[#9ca3af] hover:text-white"
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

/** Anchor styled as a button that triggers a file download. We use a real
 *  <a download> rather than fetch+blob so the browser handles the save
 *  dialog and the request still carries the admin's auth cookies. */
function DownloadButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className="px-3 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] font-medium text-white hover:bg-[#374151] transition-all"
    >
      {label}
    </a>
  );
}

function FanRowItem({ fan, onReset }: { fan: AdminAgencyFan; onReset?: () => void }) {
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
        <div className="text-[14px] font-bold text-[#00AFF0]">{money(fan.spent)}</div>
        <div className="text-[10px] text-[#6b7280]">{fmtDate(fan.lastSeen)}</div>
      </div>
      {onReset && (
        <button
          onClick={onReset}
          title="Wipe this fan's DB rows so the same Telegram account can be reused for testing"
          className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 shrink-0"
        >
          reset
        </button>
      )}
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
  const [botStars, setBotStars] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/bot-stars")
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (!cancelled && j && typeof j.stars === "number") setBotStars(j.stars); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [reloadKey]);
  const cards: { label: string; value: string; emoji: string; highlight?: boolean }[] = data
    ? [
        { label: "Bot Stars Balance", value: botStars != null ? `${botStars.toLocaleString("en-US")} ⭐` : "…", emoji: "⭐", highlight: true },
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
                  <a
                    key={a.id}
                    href={`/admin?agency=${encodeURIComponent(a.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center gap-3 p-3 bg-[#1f2937]/30 rounded-lg hover:bg-[#1f2937]/60 transition-colors text-left"
                  >
                    <Avatar name={a.name} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-white truncate">{a.name}</div>
                      <div className="text-[11px] text-[#6b7280]">{a.sales} sales · fee {money(a.fee)}</div>
                    </div>
                    <div className="text-[14px] font-bold text-[#00AFF0] shrink-0">{money(a.gmv)}</div>
                  </a>
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
                    <div className="text-[14px] font-bold text-[#00AFF0] shrink-0">{money(m.gmv)}</div>
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
                    <div className="text-[14px] font-bold text-[#00AFF0] shrink-0">{money(f.spent)}</div>
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
            className="bg-[#1f2937] border border-[#374151] rounded-lg px-3.5 py-2 text-[13px] text-white placeholder:text-[#6b7280] outline-none focus:border-[#00AFF0] w-full sm:w-[280px]"
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
                <a
                  key={a.id}
                  href={`/admin?agency=${encodeURIComponent(a.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
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
                  <div className="text-right text-[13px] font-bold text-[#00AFF0]">{money(a.gmv)}</div>
                  <div className="text-right text-[13px] text-[#10b981]">{money(a.fee)}</div>
                </a>
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
  // Multi-select model filter for the All Fans panel. Empty = all models.
  // Names (not ids) because `data.fans[i].modelName` is what we filter on
  // and it's what's shown in the chip UI.
  const [fanModelFilter, setFanModelFilter] = useState<Set<string>>(new Set());

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
    return data.fans.filter((f) => {
      if (fanModelFilter.size > 0 && !fanModelFilter.has(f.modelName)) return false;
      if (!s) return true;
      return (
        (f.username ?? "").toLowerCase().includes(s) ||
        f.name.toLowerCase().includes(s) ||
        f.modelName.toLowerCase().includes(s)
      );
    });
  }, [data, fanQ, fanModelFilter]);

  const feePct = data ? Math.round(data.feePct * 100) : 10;

  async function resetFan(modelName: string, peerId: string) {
    if (!data) return;
    const model = data.models.find((m) => m.name === modelName);
    if (!model) { alert("Model not found"); return; }
    if (!window.confirm(`Wipe DB rows for fan ${peerId} on ${modelName}? The Telegram chat itself stays — only our records are cleared so the same TG account can be reused for testing.`)) return;
    try {
      const r = await fetch("/api/admin/reset-fan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id, peerId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setReloadKey((k) => k + 1);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  async function seedTestSale() {
    const raw = window.prompt("Test sale amount in USD (90 = cleared past 30-day hold; small = pending):", "90");
    if (raw == null) return;
    const amount = Number(raw);
    if (!(amount > 0)) { alert("Amount must be > 0"); return; }
    const daysAgoRaw = window.prompt("How many days ago should it be marked paid? 0 = pending, 31 = available:", "31");
    if (daysAgoRaw == null) return;
    const daysAgo = Math.max(0, Math.floor(Number(daysAgoRaw)));
    try {
      const res = await fetch("/api/admin/seed-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, amount, daysAgo }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setReloadKey((k) => k + 1);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  async function processPayout(id: string, action: "paid" | "rejected") {
    let txHash = "";
    if (action === "paid") {
      txHash = window.prompt("TON tx hash for this payout (optional):") ?? "";
    } else if (!window.confirm("Reject this payout request? The amount returns to the agency's available balance.")) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/payouts/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, txHash }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setReloadKey((k) => k + 1);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

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
          <div className="w-14 h-14 bg-gradient-to-br from-[#00AFF0] to-[#00AFF0] rounded-2xl flex items-center justify-center text-white font-bold text-[20px] shrink-0">
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
                    <div className="text-[14px] font-bold text-[#00AFF0] shrink-0">{money(m.gmv)}</div>
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
                    <div className="text-[14px] font-bold text-[#00AFF0] shrink-0">{money(c.gmv)}</div>
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
                    <div className="text-[14px] font-bold text-[#00AFF0] shrink-0 w-[72px] text-right">{money(s.price)}</div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        {/* Vault moderation queue scoped to this agency */}
        <AgencyVaultPanel agencyId={agencyId} />

        {/* Payouts */}
        <Panel
          title="Payouts 💸"
          right={
            <button
              onClick={seedTestSale}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#1f2937] text-[#9ca3af] border border-[#374151] hover:text-white"
            >
              + Seed test sale
            </button>
          }
        >
          {(data?.payouts ?? []).length === 0 ? (
            <div className="py-6 text-center text-[13px] text-[#6b7280]">{data ? "No payout requests." : "Loading…"}</div>
          ) : (
            <div className="space-y-2">
              {data!.payouts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 bg-[#1f2937]/30 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-white">{money(p.amount)}</div>
                    <div className="text-[11px] text-[#6b7280]">{fmtDateTime(p.createdAt)}</div>
                    {p.address && <div className="text-[11px] text-[#9ca3af] font-mono truncate">→ {p.address}</div>}
                    {p.txHash && <div className="text-[11px] text-emerald-400/80 font-mono truncate">tx: {p.txHash}</div>}
                  </div>
                  {p.status === "pending" ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => processPayout(p.id, "paid")} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25">Mark paid</button>
                      <button onClick={() => processPayout(p.id, "rejected")} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25">Reject</button>
                    </div>
                  ) : (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(p.status)} shrink-0`}>
                      {p.status}
                    </span>
                  )}
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
              className="bg-[#1f2937] border border-[#374151] rounded-lg px-3.5 py-2 text-[13px] text-white placeholder:text-[#6b7280] outline-none focus:border-[#00AFF0] w-full sm:w-[260px]"
            />
          </div>
          {/* Export buttons — download the FULL list (server-side, no UI cap)
              as a .txt file. Three flavours: every username, paying fans
              only, and everyone ranked by spend. */}
          <div className="flex flex-wrap gap-2 mb-3">
            <DownloadButton
              href={`/api/admin/agencies/${agencyId}/fans-export?type=all`}
              label="⬇ All usernames"
            />
            <DownloadButton
              href={`/api/admin/agencies/${agencyId}/fans-export?type=paying`}
              label="⬇ Paying fans"
            />
            <DownloadButton
              href={`/api/admin/agencies/${agencyId}/fans-export?type=ranked`}
              label="⬇ Ranked by spend"
            />
          </div>
          {/* Multi-select model chips. Empty selection = all models. Click
              toggles; "All" clears. We key on modelName since that's what
              `AdminAgencyFan` carries — keeps the filter dead simple. */}
          {data && data.models.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={() => setFanModelFilter(new Set())}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  fanModelFilter.size === 0
                    ? "bg-[#00AFF0] text-white"
                    : "bg-[#1f2937] text-[#9ca3af] border border-[#374151] hover:text-white"
                }`}
              >
                All models
              </button>
              {data.models.map((m) => {
                const active = fanModelFilter.has(m.name);
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setFanModelFilter((prev) => {
                        const n = new Set(prev);
                        if (n.has(m.name)) n.delete(m.name);
                        else n.add(m.name);
                        return n;
                      });
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                      active
                        ? "bg-[#00AFF0] text-white"
                        : "bg-[#1f2937] text-[#9ca3af] border border-[#374151] hover:text-white"
                    }`}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[480px] overflow-y-auto pr-1">
            {fans.length === 0 ? (
              <div className="py-6 text-center text-[13px] text-[#6b7280] md:col-span-2">
                {data ? "No fans match." : "Loading…"}
              </div>
            ) : (
              fans.map((f) => (
                <FanRowItem
                  key={f.peerId}
                  fan={f}
                  onReset={() => resetFan(f.modelName, f.peerId)}
                />
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
type AlertsChannel = {
  id: string;
  botChatId: string | null;
  label: string | null;
  enabled: boolean;
  alertsPpv: boolean;
  alertsSignups: boolean;
  alertsVault: boolean;
  connected: boolean;
  pending: boolean;
};

function AdminSalesAlertsView() {
  const [channels, setChannels] = useState<AlertsChannel[] | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [msg, setMsg] = useState("");
  const [testMsgById, setTestMsgById] = useState<Record<string, string>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingIdRef = useRef<string | null>(null);

  useEffect(() => {
    void refresh();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function refresh(): Promise<AlertsChannel[] | null> {
    const r = await fetch("/api/admin/global-alerts");
    if (!r.ok) return null;
    const j = (await r.json()) as { channels: AlertsChannel[]; botUsername: string | null };
    setChannels(j.channels);
    setBotUsername(j.botUsername);
    return j.channels;
  }

  async function patch(id: string, p: Partial<Omit<AlertsChannel, "id" | "botChatId" | "label" | "connected" | "pending">>): Promise<void> {
    setChannels((prev) => prev?.map((c) => c.id === id ? { ...c, ...p } : c) ?? prev);
    setMsg("");
    const r = await fetch("/api/admin/global-alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...p }),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setMsg(`Error: ${j.error ?? "save failed"}`);
    }
  }

  async function connectNew() {
    setConnecting(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/global-alerts", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { link?: string; id?: string; error?: string };
      if (!r.ok || !j.link || !j.id) {
        setMsg(`Error: ${j.error ?? "could not start"}`);
        setConnecting(false);
        return;
      }
      pendingIdRef.current = j.id;
      window.open(j.link, "_blank");
      let ticks = 0;
      pollRef.current = setInterval(async () => {
        ticks += 1;
        const list = await refresh();
        const target = list?.find((c) => c.id === pendingIdRef.current);
        if ((target && target.connected) || ticks > 40) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          pendingIdRef.current = null;
          setConnecting(false);
        }
      }, 3000);
    } catch {
      setMsg("Error: network");
      setConnecting(false);
    }
  }

  async function removeChannel(id: string) {
    if (!confirm("Remove this connected account? It will stop receiving alerts.")) return;
    const r = await fetch("/api/admin/global-alerts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (r.ok) await refresh();
  }

  async function sendTest(id: string) {
    setTestMsgById((m) => ({ ...m, [id]: "Sending…" }));
    const r = await fetch("/api/admin/global-alerts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setTestMsgById((m) => ({ ...m, [id]: r.ok ? "Sent ✓" : `Error: ${j.error ?? "failed"}` }));
    setTimeout(() => setTestMsgById((m) => ({ ...m, [id]: "" })), 5000);
  }

  if (channels === null) return <div className="p-6 text-[#9ca3af] text-[13px]">Loading…</div>;

  const btn =
    "px-4 py-2 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] text-white rounded-lg font-semibold text-[12px] hover:from-[#0098D4] hover:to-[#0098D4] transition-all disabled:opacity-50 disabled:cursor-not-allowed";

  const connectedChannels = channels.filter((c) => c.connected);

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-[820px] mx-auto">
        <h1 className="text-[24px] font-bold text-white mb-1">Sales Alerts 🔔</h1>
        <p className="text-[13px] text-[#9ca3af] mb-4">
          Get a Telegram DM every time any agency records a PPV sale, a new
          signup lands for review, or an agency uploads new Vault items to
          approve. Connect as many accounts as you want — each gets a copy.
        </p>

        <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl p-5 md:p-6 space-y-4">
          {/* Connected accounts list */}
          {connectedChannels.length === 0 ? (
            <div className="bg-[#0f131a] border border-[#2a2d35] rounded-lg p-4 text-[13px] text-[#9ca3af]">
              No accounts connected yet.
            </div>
          ) : (
            connectedChannels.map((c) => (
              <div key={c.id} className="bg-[#0f131a] border border-[#2a2d35] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-[13px] text-emerald-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    {c.label ?? "Connected"}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={c.enabled}
                      onClick={() => patch(c.id, { enabled: !c.enabled })}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        c.enabled ? "bg-[#00AFF0]" : "bg-[#374151]"
                      }`}
                      title={c.enabled ? "Enabled" : "Disabled"}
                    >
                      <span
                        className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-transform"
                        style={{ transform: c.enabled ? "translateX(20px)" : "translateX(0)" }}
                      />
                    </button>
                    <button
                      onClick={() => sendTest(c.id)}
                      disabled={!c.enabled}
                      className="px-3 py-1.5 bg-[#1f2937] border border-[#374151] text-white rounded-lg text-[11px] hover:bg-[#252b36] transition-all disabled:opacity-50"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => removeChannel(c.id)}
                      className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-[11px] hover:bg-red-500/20 transition-all"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <AdminCheckbox
                    label="PPV sales"
                    checked={c.alertsPpv}
                    onChange={(v) => patch(c.id, { alertsPpv: v })}
                  />
                  <AdminCheckbox
                    label="New signups"
                    checked={c.alertsSignups}
                    onChange={(v) => patch(c.id, { alertsSignups: v })}
                  />
                  <AdminCheckbox
                    label="Vault uploads"
                    checked={c.alertsVault}
                    onChange={(v) => patch(c.id, { alertsVault: v })}
                  />
                </div>
                {testMsgById[c.id] && (
                  <div className={`text-[11px] ${
                    testMsgById[c.id].startsWith("Error") ? "text-red-400" : "text-emerald-400"
                  }`}>
                    {testMsgById[c.id]}
                  </div>
                )}
              </div>
            ))
          )}

          {/* Add-new area */}
          <div className="bg-[#0f131a] border border-dashed border-[#374151] rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[12px] text-[#9ca3af]">
              {connecting
                ? "Waiting — tap Start in the Telegram chat that just opened…"
                : botUsername
                  ? `Connect another account via @${botUsername}.`
                  : "Notifications bot is not configured — set TELEGRAM_BOT_TOKEN."}
            </div>
            <button
              className={btn}
              onClick={connectNew}
              disabled={connecting || !botUsername}
            >
              {connecting ? "Waiting…" : "+ Connect account"}
            </button>
          </div>

          {msg && (
            <p className={`text-[11px] ${msg.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
              {msg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
          checked ? "bg-[#00AFF0] border-[#00AFF0]" : "bg-[#1f2937] border-[#374151]"
        }`}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span className="text-[13px] text-white">{label}</span>
    </label>
  );
}

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
                className="w-full bg-[#1f2937] border border-[#374151] rounded-lg px-3.5 py-2.5 text-[14px] text-white placeholder:text-[#6b7280] outline-none focus:border-[#00AFF0]"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[#9ca3af] mb-1.5">Repeat password</label>
              <input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="Again"
                className="w-full bg-[#1f2937] border border-[#374151] rounded-lg px-3.5 py-2.5 text-[14px] text-white placeholder:text-[#6b7280] outline-none focus:border-[#00AFF0]"
              />
            </div>
            {msg && <div className={`text-[12px] ${msg.ok ? "text-[#10b981]" : "text-red-400"}`}>{msg.text}</div>}
            <button
              onClick={save}
              disabled={busy || !pw || !pw2}
              className="px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Update password"}
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ─── Payouts (cross-agency queue) ───────────────────────────────────────────
type AdminPayoutRow = {
  id: string;
  agencyId: string;
  agencyName: string;
  savedAddress: string | null;
  amount: number;
  address: string | null;
  currency: string | null;
  network: string | null;
  status: string;
  createdAt: string;
  paidAt: string | null;
  txHash: string | null;
};

function PayoutsView({ onOpenAgency }: { onOpenAgency: (id: string) => void }) {
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [rows, setRows] = useState<AdminPayoutRow[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [botStars, setBotStars] = useState<{ stars: number; usd: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/star-balance");
        const j = await res.json();
        if (!cancelled && res.ok) setBotStars({ stars: Number(j.stars ?? 0), usd: Number(j.usd ?? 0) });
      } catch { /* best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/payouts?status=${tab}`);
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setRows(j.payouts as AdminPayoutRow[]);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, reloadKey]);

  async function processPayout(id: string, action: "paid" | "rejected") {
    let txHash = "";
    if (action === "paid") {
      txHash = window.prompt("TON tx hash (optional):") ?? "";
    } else if (!window.confirm("Reject this payout? The amount returns to the agency's available balance.")) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/payouts/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, txHash }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setReloadKey((k) => k + 1);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  const totalPending = (rows ?? []).filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-[24px] font-bold text-white mb-1">Payouts 💸</h1>
            <p className="text-[13px] text-[#9ca3af]">
              Cross-agency queue. Withdraw Stars→TON on Fragment, send USDT-TON to the listed address, then mark paid.
            </p>
          </div>
          <div className="flex items-stretch gap-3 flex-wrap">
            {/* Stars sitting on our bot — what's withdrawable on Fragment. */}
            <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl px-5 py-3">
              <div className="text-[11px] uppercase tracking-wider text-[#9ca3af]">⭐ on bot (withdrawable)</div>
              <div className="text-[22px] font-bold text-white">
                {botStars ? `${botStars.stars.toLocaleString("en-US")} ⭐` : "…"}
                {botStars && <span className="text-[13px] font-normal text-[#9ca3af] ml-2">~{money(botStars.usd)}</span>}
              </div>
              <a
                href="https://fragment.com/stars"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-[#00AFF0] hover:underline"
              >
                Withdraw via Fragment ↗
              </a>
            </div>
            {tab === "pending" && (
              <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl px-5 py-3">
                <div className="text-[11px] uppercase tracking-wider text-[#9ca3af]">Total pending (to agencies)</div>
                <div className="text-[22px] font-bold text-white">{money(totalPending)}</div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(["pending", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium ${
                tab === t ? "bg-[#00AFF0] text-white" : "bg-[#1f2937] text-[#9ca3af] hover:text-white"
              }`}
            >
              {t === "pending" ? "Pending" : "All"}
            </button>
          ))}
        </div>

        <Panel title="">
          {rows == null ? (
            <div className="py-8 text-center text-[13px] text-[#6b7280]">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-[#6b7280]">No payout requests.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[#9ca3af] border-b border-[#2a2d35]">
                    <th className="px-3 py-2 font-medium">Requested</th>
                    <th className="px-3 py-2 font-medium">Agency</th>
                    <th className="px-3 py-2 font-medium">Amount (USDT·TON)</th>
                    <th className="px-3 py-2 font-medium">Destination</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const mismatch = p.address && p.savedAddress && p.address !== p.savedAddress;
                    return (
                      <tr key={p.id} className="border-b border-[#2a2d35]/40 align-top">
                        <td className="px-3 py-3 text-[#9ca3af] whitespace-nowrap">{fmtDateTime(p.createdAt)}</td>
                        <td className="px-3 py-3">
                          <button onClick={() => onOpenAgency(p.agencyId)} className="text-[#00AFF0] hover:underline font-medium">
                            {p.agencyName}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-white font-medium">{money(p.amount)}</td>
                        <td className="px-3 py-3">
                          <div className="font-mono text-[11px] text-[#d1d5db] break-all max-w-[260px]">{p.address ?? "—"}</div>
                          {mismatch && (
                            <div className="text-[10px] text-amber-400 mt-1">⚠ differs from saved {p.savedAddress}</div>
                          )}
                          {p.txHash && <div className="text-[10px] text-emerald-400/80 font-mono mt-1 break-all">tx: {p.txHash}</div>}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(p.status)}`}>{p.status}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {p.status === "pending" ? (
                            <div className="flex items-center gap-1.5 justify-end">
                              <button onClick={() => processPayout(p.id, "paid")} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25">Mark paid</button>
                              <button onClick={() => processPayout(p.id, "rejected")} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25">Reject</button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#6b7280]">{p.paidAt ? fmtDateTime(p.paidAt) : "—"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ─── Signup Requests ────────────────────────────────────────────────────────
type SignupRequest = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  agencyName: string | null;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  emailInUse: boolean;
};

function SignupsView() {
  const [rows, setRows] = useState<SignupRequest[] | null>(null);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    fetch("/api/admin/signup-requests")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setRows(j.requests as SignupRequest[]);
      })
      .catch(() => setRows([]));
    return () => { cancelled = true; };
  }, [reload]);
  const pending = (rows ?? []).filter((r) => r.status === "pending").length;

  async function review(id: string, action: "approve" | "reject") {
    if (action === "approve" && !window.confirm("Approve this signup? An account will be created and they can log in immediately.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/signup-requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (j.tempPassword) {
        window.alert(
          `Account created. This request had no stored password, so a temporary one was generated:\n\n${j.tempPassword}\n\nShare it with the user — they can change it after logging in.`,
        );
      }
      setReload((k) => k + 1);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-[24px] font-bold text-white mb-1">Signups 📨</h1>
            <p className="text-[13px] text-[#9ca3af]">
              Manual approval queue. Rows highlighted in red already have an account with the same email.
            </p>
          </div>
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl px-5 py-3">
            <div className="text-[11px] uppercase tracking-wider text-[#9ca3af]">Pending</div>
            <div className="text-[22px] font-bold text-white">{pending}</div>
          </div>
        </div>

        <Panel title="">
          {rows == null ? (
            <div className="py-8 text-center text-[13px] text-[#6b7280]">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-[#6b7280]">No signup requests yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[#9ca3af] border-b border-[#2a2d35]">
                    <th className="px-3 py-2 font-medium">Submitted</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Agency</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-[#2a2d35]/40 align-top"
                      style={r.emailInUse ? { background: "rgba(248,113,113,0.08)" } : undefined}
                    >
                      <td className="px-3 py-3 text-[#9ca3af] whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                      <td className="px-3 py-3 font-mono text-[12px] text-white">
                        {r.email}
                        {r.emailInUse && <div className="text-[10px] text-red-400 mt-1">⚠ email already registered</div>}
                      </td>
                      <td className="px-3 py-3 text-white">{r.displayName || "—"}</td>
                      <td className="px-3 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#1f2937] text-[#9ca3af]">{r.role}</span>
                      </td>
                      <td className="px-3 py-3 text-white">{r.agencyName || "—"}</td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(r.status)}`}>{r.status}</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right">
                        {r.status === "pending" ? (
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              disabled={busyId === r.id}
                              onClick={() => review(r.id, "approve")}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
                            >
                              {busyId === r.id ? "…" : "Approve"}
                            </button>
                            <button
                              disabled={busyId === r.id}
                              onClick={() => review(r.id, "reject")}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#6b7280]">{r.reviewedAt ? fmtDateTime(r.reviewedAt) : "—"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <button
          onClick={() => setReload((k) => k + 1)}
          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#1f2937] text-[#9ca3af] hover:text-white"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

// ─── Shell ──────────────────────────────────────────────────────────────────
// Wallet tab will be rebuilt for TON in batch 56 (after Stars pay-in lands).
type Tab = "overview" | "agencies" | "vault" | "payouts" | "signups" | "alerts" | "settings";
const NAV: { id: Tab; label: string; emoji: string }[] = [
  { id: "overview", label: "Overview", emoji: "📊" },
  { id: "agencies", label: "Agencies", emoji: "🏢" },
  { id: "vault", label: "Vault", emoji: "🔒" },
  { id: "payouts", label: "Payouts", emoji: "💸" },
  { id: "signups", label: "Signups", emoji: "📨" },
  { id: "alerts", label: "Sales Alerts", emoji: "🔔" },
  { id: "settings", label: "Settings", emoji: "⚙️" },
];

export function AdminClient() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null);

  // Deep link: /admin?agency=ID opens the agency drilldown directly in this
  // tab. Used by the "open in new browser tab" links from the agency table
  // and the Top Agencies leaderboard. UUID-shape guard keeps a random query
  // string from being treated as an id.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("agency");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      setSelectedAgency(id);
      setTab("agencies");
    }
  }, []);

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
          <div className="w-8 h-8 bg-gradient-to-br from-[#00AFF0] to-[#00AFF0] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-[14px]">P</span>
          </div>
          <div className="text-[15px] font-semibold">
            ppvs<span className="text-[#00AFF0]">.io</span>
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
                  ? "bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] text-white shadow-lg shadow-[#00AFF0]/20"
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
            ppvs<span className="text-[#00AFF0]">.io</span>
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
                tab === item.id ? "bg-[#00AFF0] text-white" : "text-[#9ca3af] bg-[#1f2937]"
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
          {tab === "vault" && (
            <div className="p-4 md:p-6">
              <div className="max-w-[1400px] mx-auto space-y-6">
                <div>
                  <h1 className="text-[24px] font-bold text-white mb-1">Vault moderation 🔒</h1>
                  <p className="text-[13px] text-[#9ca3af]">
                    Cross-agency review queue. Click an item to preview + approve / reject; the agency name links to its drilldown in a new tab.
                  </p>
                </div>
                <AgencyVaultPanel />
              </div>
            </div>
          )}
          {tab === "payouts" && <PayoutsView onOpenAgency={openAgency} />}
          {tab === "signups" && <SignupsView />}
          {tab === "alerts" && <AdminSalesAlertsView />}
          {tab === "settings" && <SettingsView />}
        </main>
      </div>
    </div>
  );
}

// ─── Vault moderation panel (inside the agency drill-down) ──────────────────

type AdminPpv = {
  id: string;
  name: string;
  description: string | null;
  media_url: string | null;
  preview_url: string | null;
  created_at: string;
  review_status: "pending" | "approved" | "rejected";
  review_notes: string | null;
  reviewed_at: string | null;
  agency: { id: string; name: string | null; email: string | null };
  model: { id: string; name: string };
  group: { id: string; name: string } | null;
};

type ReviewStatusFilter = "all" | "pending" | "approved" | "rejected";

function AgencyVaultPanel({ agencyId }: { agencyId?: string | null }) {
  // agencyId === null/undefined → cross-agency review queue (the top-level
  // Vault tab). When set, scope to that agency's drilldown.
  const crossAgency = !agencyId;
  const [items, setItems] = useState<AdminPpv[] | null>(null);
  const [filter, setFilter] = useState<ReviewStatusFilter>("pending");
  const [openPpv, setOpenPpv] = useState<AdminPpv | null>(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Which models to show (empty = all). Chips below the header let the admin
  // narrow a busy vault to specific creators.
  const [modelFilter, setModelFilter] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = new URLSearchParams();
        if (agencyId) qs.set("agencyId", agencyId);
        if (filter !== "all") qs.set("status", filter);
        const res = await fetch(`/api/admin/ppvs?${qs.toString()}`);
        const j = (await res.json()) as { items?: AdminPpv[]; error?: string };
        if (cancelled) return;
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setItems(j.items ?? []);
        setErr("");
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agencyId, filter, reloadKey]);

  async function flipStatus(id: string, status: "approved" | "rejected" | "pending", notes?: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/ppvs/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      // Reload the panel + close the lightbox so the new status shows.
      setReloadKey((k) => k + 1);
      setOpenPpv(null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  const counts = (items ?? []).reduce(
    (acc, p) => {
      acc[p.review_status] = (acc[p.review_status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Unique models present in the loaded items — drives the model filter
  // chips. In the cross-agency view we prefix the agency so two creators
  // with the same name stay distinguishable.
  const availableModels = (() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const p of items ?? []) {
      if (map.has(p.model.id)) continue;
      const label = crossAgency
        ? `${p.agency.name || p.agency.email || "Agency"} · ${p.model.name}`
        : p.model.name;
      map.set(p.model.id, { id: p.model.id, label });
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  })();

  const visibleItems = (items ?? []).filter(
    (p) => modelFilter.size === 0 || modelFilter.has(p.model.id),
  );

  function toggleModel(id: string) {
    setModelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Panel
      title={`Vault 🔒 — ${visibleItems.length} item${visibleItems.length === 1 ? "" : "s"}`}
      right={
        <div className="flex bg-[#0d1117] border border-[#2a2d35] rounded-lg p-0.5 text-[12px]">
          {(["pending", "approved", "rejected", "all"] as ReviewStatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md transition-colors capitalize ${
                filter === f ? "bg-[#00AFF0] text-white" : "text-[#9ca3af] hover:text-white"
              }`}
            >
              {f}
              {f !== "all" && counts[f] != null ? ` (${counts[f]})` : ""}
            </button>
          ))}
        </div>
      }
    >
      {err && <ErrorBanner msg={err} />}

      {/* Model filter chips — pick which creators to show. */}
      {availableModels.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => setModelFilter(new Set())}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
              modelFilter.size === 0
                ? "bg-[#00AFF0] text-white border-[#00AFF0]"
                : "bg-transparent text-[#9ca3af] border-[#2a2d35] hover:text-white hover:border-[#4b5563]"
            }`}
          >
            All creators
          </button>
          {availableModels.map((m) => {
            const on = modelFilter.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleModel(m.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                  on
                    ? "bg-[#00AFF0] text-white border-[#00AFF0]"
                    : "bg-transparent text-[#9ca3af] border-[#2a2d35] hover:text-white hover:border-[#4b5563]"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      {items === null ? (
        <div className="py-6 text-center text-[13px] text-[#6b7280]">Loading…</div>
      ) : visibleItems.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-[#6b7280]">
          {modelFilter.size > 0
            ? "No PPVs for the selected creators in this filter."
            : crossAgency
              ? "No PPVs match this filter across any agency."
              : "No PPVs match this filter for this agency."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {visibleItems.map((p) => {
            return (
              <button
                key={p.id}
                onClick={() => setOpenPpv(p)}
                className="relative aspect-square rounded-lg overflow-hidden border border-[#2a2d35] hover:border-[#00AFF0]/60 transition-colors bg-[#1f2937] text-left"
              >
                {p.media_url ? (
                  // Batch 99: admin Vault grid — swap to thumb endpoint so
                  // moderators scrolling 100s of pending items don't drag
                  // the full-res original per tile. Full media only in
                  // the lightbox (below), where the moderator needs it.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/ppv/thumb/${p.id}`}
                    alt={p.name}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[#374151] text-[24px]">📦</div>
                )}
                <div
                  className={`absolute top-1.5 right-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    p.review_status === "pending"
                      ? "bg-[#f59e0b] text-black"
                      : p.review_status === "rejected"
                        ? "bg-[#ef4444] text-white"
                        : "bg-[#10b981] text-white"
                  }`}
                >
                  {p.review_status === "pending" ? "⏳" : p.review_status === "rejected" ? "✕" : "✓"}
                </div>
                <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/85 to-transparent">
                  <div className="text-[11px] font-semibold text-white truncate">{p.name}</div>
                  <div className="text-[9px] text-[#9ca3af] truncate">
                    {crossAgency
                      ? `${p.agency.name || p.agency.email || "Agency"} · ${p.model.name}`
                      : p.model.name}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {openPpv && (
        <AdminPpvLightbox
          ppv={openPpv}
          busy={busyId === openPpv.id}
          onClose={() => setOpenPpv(null)}
          onFlip={(s, notes) => flipStatus(openPpv.id, s, notes)}
        />
      )}
    </Panel>
  );
}

function AdminPpvLightbox({
  ppv,
  busy,
  onClose,
  onFlip,
}: {
  ppv: AdminPpv;
  busy: boolean;
  onClose: () => void;
  onFlip: (status: "approved" | "rejected" | "pending", notes?: string) => void;
}) {
  const [notes, setNotes] = useState<string>(ppv.review_notes ?? "");
  const isVideo = !!ppv.media_url && /\.(mp4|mov|webm|m4v|mkv)(\?|$)/i.test(ppv.media_url);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#161a22] border border-[#2a2d35] rounded-xl shadow-2xl w-full max-w-[820px] max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[#2a2d35]">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-white truncate">{ppv.name}</div>
            <div className="text-[11px] text-[#9ca3af] truncate">
              <a
                href={`/admin?agency=${encodeURIComponent(ppv.agency.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#5BC8F5] hover:underline"
              >
                {ppv.agency.name || ppv.agency.email || "Agency"}
              </a>{" "}
              · {ppv.model.name}
              {ppv.group ? ` · ${ppv.group.name}` : ""} · uploaded {fmtDate(ppv.created_at)}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#9ca3af] hover:text-white shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="relative w-full bg-black rounded-lg overflow-hidden" style={{ aspectRatio: "16/10" }}>
            {ppv.media_url ? (
              isVideo ? (
                <video src={`/api/ppv/file/${ppv.id}`} controls autoPlay muted className="w-full h-full object-contain" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/ppv/file/${ppv.id}`} alt={ppv.name} className="w-full h-full object-contain" />
              )
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[#374151] text-[40px]">📦</div>
            )}
          </div>

          {ppv.description && (
            <div className="text-[12px] text-[#d1d5db] whitespace-pre-wrap">{ppv.description}</div>
          )}

          <div>
            <label className="block text-[12px] text-[#9ca3af] mb-1.5">Notes (visible to admin only)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Optional reason / context …"
              className="w-full px-3 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] text-white placeholder:text-[#6b7280] resize-none focus:outline-none focus:border-[#00AFF0]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[#6b7280] mr-2">
              Current status:{" "}
              <span
                className={
                  ppv.review_status === "pending"
                    ? "text-[#f59e0b]"
                    : ppv.review_status === "rejected"
                      ? "text-[#ef4444]"
                      : "text-[#10b981]"
                }
              >
                {ppv.review_status}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onFlip("approved", notes)}
              disabled={busy || ppv.review_status === "approved"}
              className="px-4 py-2 rounded-lg text-[12px] font-semibold bg-[#10b981] text-white hover:bg-[#0d8d68] disabled:opacity-50"
            >
              {busy ? "…" : "✓ Approve"}
            </button>
            <button
              type="button"
              onClick={() => onFlip("rejected", notes)}
              disabled={busy || ppv.review_status === "rejected"}
              className="px-4 py-2 rounded-lg text-[12px] font-semibold bg-[#ef4444] text-white hover:bg-[#c53030] disabled:opacity-50"
            >
              {busy ? "…" : "✕ Reject"}
            </button>
            {ppv.review_status !== "pending" && (
              <button
                type="button"
                onClick={() => onFlip("pending", notes)}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold bg-[#1f2937] border border-[#374151] text-white hover:bg-[#374151] disabled:opacity-50"
              >
                Reset to pending
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

