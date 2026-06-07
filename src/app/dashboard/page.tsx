"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PPVsTab } from "@/components/ppv/PPVsTab";
import { ChattersTab } from "@/components/chatters/ChattersTab";
import { ChatterDashboardLayout } from "@/components/chatters/ChatterDashboardLayout";
import { SettingsTab } from "@/components/settings/SettingsTab";
import { createClient } from "@/lib/supabase";
import {
  MessageSquare,
  TrendingUp, DollarSign,
  Plus, Link as LinkIcon, ArrowUpRight, LogOut, Menu,
} from "lucide-react";
import type { DashboardStats } from "@/app/api/dashboard/stats/route";

// ─────────────────────────────────────────────
// AGENCY DASHBOARD
// ─────────────────────────────────────────────

type AgencyTab = "dashboard" | "ppvs" | "models" | "chatters" | "wallet" | "settings";

const menuItems = [
  { id: "dashboard" as AgencyTab, label: "Dashboard", emoji: "📊" },
  { id: "ppvs" as AgencyTab, label: "PPVs", emoji: "🔒" },
  { id: "models" as AgencyTab, label: "Models", emoji: "👤" },
  { id: "chatters" as AgencyTab, label: "Chatters", emoji: "💬" },
  { id: "wallet" as AgencyTab, label: "Wallet", emoji: "💰" },
  { id: "settings" as AgencyTab, label: "Settings", emoji: "⚙️" },
];

function AgencySidebar({
  activeTab,
  onTabChange,
  mobileOpen = false,
  onClose,
}: {
  activeTab: AgencyTab;
  onTabChange: (t: AgencyTab) => void;
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [showLogout, setShowLogout] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userInitials, setUserInitials] = useState("AO");
  const [isAdmin, setIsAdmin] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Show the Admin link only for platform owners (ADMIN_EMAILS). The check is
  // server-side; we just probe the gated endpoint.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/whoami")
      .then((r) => {
        if (!cancelled && r.ok) setIsAdmin(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserEmail(user.email ?? "");
      const name = (user.user_metadata?.full_name as string) || user.email || "";
      const parts = name.split(/[\s@.]+/).filter(Boolean);
      if (parts.length >= 2) {
        setUserInitials((parts[0][0] + parts[1][0]).toUpperCase());
      } else if (parts.length === 1) {
        setUserInitials(parts[0].slice(0, 2).toUpperCase());
      }
    });
  }, []);

  useEffect(() => {
    if (!showLogout) return;
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setShowLogout(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showLogout]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <div
        className={`w-[240px] bg-[#161a22] border-r border-[#2a2d35] flex flex-col shrink-0 z-40 fixed inset-y-0 left-0 transition-transform duration-200 md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
      <div className="h-[52px] border-b border-[#2a2d35] px-5 flex items-center gap-2">
        <div className="w-8 h-8 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-[14px]">P</span>
        </div>
        <div className="text-[15px] font-semibold">
          ppvs<span className="text-[#6366f1]">.io</span>
        </div>
        <span className="text-[12px] px-2 py-0.5 bg-[#6366f1]/10 text-[#6366f1] rounded-full font-medium">Agency</span>
      </div>

      <div className="flex-1 py-4 px-3">
        <div className="space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full px-4 py-2.5 rounded-lg flex items-center gap-3 transition-all ${
                activeTab === item.id
                  ? "bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white shadow-lg shadow-[#6366f1]/20"
                  : "text-[#9ca3af] hover:bg-[#1f2937] hover:text-white"
              }`}
            >
              <span className="text-[16px]">{item.emoji}</span>
              <span className="text-[13px] font-medium">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="my-4 border-t border-[#2a2d35]" />

        <button
          onClick={() => router.push("/chatter")}
          className="w-full px-4 py-2.5 rounded-lg flex items-center gap-3 text-[#9ca3af] hover:bg-[#1f2937] hover:text-white transition-all"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="text-[13px] font-medium">Go to Chatter</span>
        </button>

        <button
          onClick={() => router.push("/mass-dm")}
          className="w-full px-4 py-2.5 rounded-lg flex items-center gap-3 text-[#9ca3af] hover:bg-[#1f2937] hover:text-white transition-all"
        >
          <span className="text-[16px] leading-none">💌</span>
          <span className="text-[13px] font-medium">Mass DMs</span>
        </button>

        {isAdmin && (
          <button
            onClick={() => router.push("/admin")}
            className="w-full px-4 py-2.5 rounded-lg flex items-center gap-3 text-[#ef4444] hover:bg-[#ef4444]/10 transition-all"
          >
            <span className="text-[16px] leading-none">🛡️</span>
            <span className="text-[13px] font-medium">Admin Panel</span>
          </button>
        )}
      </div>

      {/* Account area + logout popup */}
      <div className="p-4 border-t border-[#2a2d35] relative" ref={popupRef}>
        {showLogout && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-[#1f2937] border border-[#374151] rounded-xl shadow-2xl overflow-hidden">
            <button
              onClick={handleLogout}
              className="w-full px-4 py-3 flex items-center gap-3 text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors text-[13px] font-semibold"
            >
              <LogOut className="w-4 h-4" />
              Exit
            </button>
          </div>
        )}
        <button
          onClick={() => setShowLogout((v) => !v)}
          className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${showLogout ? "bg-[#1f2937]" : "hover:bg-[#1f2937]"}`}
        >
          <div className="w-9 h-9 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-full flex items-center justify-center text-white font-semibold text-[13px] shrink-0">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-white truncate">Agency Owner</div>
            <div className="text-[11px] text-[#6b7280] truncate">{userEmail || "admin@ppvs.io"}</div>
          </div>
        </button>
      </div>
      </div>
    </>
  );
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  if (n >= 10000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
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

/** "5m ago", "2h ago", "3d ago", or the date for anything older than 30 days. */
function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

type ChartPeriod = "1d" | "7d" | "30d" | "all";

/**
 * Net Sales chart. SVG with a fixed `viewBox="0 0 100 50"` so the
 * `<polyline>` / `<path>` work in unit coordinates (the previous version
 * mixed `%` into SVG attribute values, which browsers silently dropped —
 * the line never appeared). `preserveAspectRatio="none"` lets the chart
 * stretch to whatever pixel size the parent has.
 *
 * X-axis labels thin out for dense windows (24 hours, 30 days, all-time
 * weeks) so they don't collide; for 7-day they all fit.
 */
function ChartCanvas({
  chartData,
  maxValue,
  hoveredPoint,
  setHoveredPoint,
  empty,
  period,
}: {
  chartData: { date: string; value: number; label: string }[];
  maxValue: number;
  hoveredPoint: number | null;
  setHoveredPoint: (n: number | null) => void;
  empty: string;
  period: ChartPeriod;
}) {
  if (chartData.length === 0) {
    return (
      <div className="h-[180px] flex items-center justify-center text-[13px] text-[#6b7280]">
        {empty}
      </div>
    );
  }
  // Coordinate space: 0..100 horizontal, 0..50 vertical (top-down).
  const VB_W = 100;
  const VB_H = 50;
  const n = chartData.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * VB_W);
  const y = (v: number) => VB_H - (v / maxValue) * VB_H;

  const linePoints = chartData.map((d, i) => `${x(i).toFixed(2)},${y(d.value).toFixed(2)}`).join(" ");
  const areaPath =
    `M ${x(0).toFixed(2)},${y(chartData[0].value).toFixed(2)} ` +
    chartData.slice(1).map((d, i) => `L ${x(i + 1).toFixed(2)},${y(d.value).toFixed(2)}`).join(" ") +
    ` L ${x(n - 1).toFixed(2)},${VB_H} L ${x(0).toFixed(2)},${VB_H} Z`;

  // How many labels to show along the bottom — pick a target count of ~8
  // and stride through the buckets so labels stay readable.
  const targetLabels = period === "7d" ? 7 : 8;
  const stride = Math.max(1, Math.ceil(n / targetLabels));

  return (
    <div className="relative">
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
              <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#lineGradient)" />
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
          {chartData.map((point, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${x(i)}%`,
                top: `${(y(point.value) / VB_H) * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
              onMouseEnter={() => setHoveredPoint(i)}
              onMouseLeave={() => setHoveredPoint(null)}
            >
              <div className="w-3 h-3 bg-[#6366f1] rounded-full border-2 border-[#161a22] cursor-pointer hover:scale-150 transition-transform" />
              {hoveredPoint === i && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 whitespace-nowrap shadow-xl z-10">
                  <div className="text-[11px] text-[#9ca3af]">{point.date}</div>
                  <div className="text-[14px] font-bold text-[#6366f1]">{point.label}</div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="relative h-4 mt-2 text-[10px] text-[#6b7280] whitespace-nowrap">
          {chartData.map((point, i) =>
            i % stride === 0 || i === n - 1 ? (
              <span
                key={i}
                className="absolute"
                // First label anchors at the left edge, last at the right.
                // Otherwise the centered label at x=100% gets clipped (and
                // wraps to two lines, e.g. "Jun ↵ 5"). Middle labels stay
                // centered so they line up with their dots.
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
    </div>
  );
}

function DashboardTab() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  // Chart window — independent of the stat cards above. The cards always
  // show their canonical windows (Today / Week / Month / All Time).
  const [period, setPeriod] = useState<ChartPeriod>("7d");

  // Model scope: null = All models. Selector lives top-left in the header.
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [scopeModelId, setScopeModelId] = useState<string | null>(null);
  const [showModelMenu, setShowModelMenu] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("models")
        .select("id, name")
        .eq("agency_user_id", user.id);
      setModels((data ?? []) as { id: string; name: string }[]);
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = `?period=${period}${scopeModelId ? `&modelId=${scopeModelId}` : ""}`;
        const res = await fetch(`/api/dashboard/stats${qs}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setLoadErr("");
        setStats(data as DashboardStats);
      } catch (e: unknown) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, period, scopeModelId]);

  const scopeModelName = scopeModelId
    ? models.find((m) => m.id === scopeModelId)?.name ?? "Model"
    : "All models";

  const cards = stats
    ? [
        { label: "Net Today", value: fmtMoney(stats.netToday), emoji: "💵" },
        { label: "Net This Week", value: fmtMoney(stats.netWeek), emoji: "📈" },
        { label: "Net This Month", value: fmtMoney(stats.netMonth), emoji: "💰" },
        { label: "Net All Time", value: fmtMoney(stats.netAllTime), emoji: "🏆" },
        { label: "Available Balance", value: fmtMoney(stats.availableBalance), emoji: "💳" },
        { label: "Sales / Unlocks", value: String(stats.sales), emoji: "👁️" },
        { label: "Avg Order Value", value: fmtMoney(stats.avgOrder), emoji: "🛒" },
        { label: "Paying Fans", value: String(stats.payingFans), emoji: "👥" },
      ]
    : Array.from({ length: 8 }, (_, i) => ({ label: ["Net Today","Net This Week","Net This Month","Net All Time","Available Balance","Sales / Unlocks","Avg Order Value","Paying Fans"][i], value: "…", emoji: "•" }));

  const chartData = (stats?.chart ?? []).map((c) => ({ ...c, label: fmtMoney(c.value) }));
  const maxValue = Math.max(1, ...chartData.map((d) => d.value));
  const topChatter = stats?.chatters?.[0] ?? null;

  return (
    <div className="flex-1 bg-[#0d1117] overflow-y-auto p-4 md:p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[24px] font-bold text-white mb-1">Dashboard 📊</h1>
            <p className="text-[14px] text-[#9ca3af]">Overview of your agency performance</p>
          </div>
          {/* Model scope selector */}
          <div className="relative">
            <button
              onClick={() => setShowModelMenu((v) => !v)}
              className="px-4 py-2 bg-[#161a22] border border-[#2a2d35] rounded-lg text-[13px] font-medium text-white hover:bg-[#1f2937] transition-all flex items-center gap-2 min-w-[180px] justify-between"
            >
              <span className="truncate">{scopeModelName}</span>
              <span className="text-[#9ca3af] text-[10px]">▼</span>
            </button>
            {showModelMenu && (
              <div className="absolute top-full right-0 mt-1 w-full bg-[#1f2937] border border-[#374151] rounded-lg shadow-2xl overflow-hidden z-20 max-h-[280px] overflow-y-auto">
                <button
                  onClick={() => { setScopeModelId(null); setShowModelMenu(false); }}
                  className={`w-full px-3 py-2 text-[13px] text-left hover:bg-[#374151] transition-colors ${
                    !scopeModelId ? "bg-[#374151] text-[#6366f1]" : "text-white"
                  }`}
                >
                  All models
                </button>
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setScopeModelId(m.id); setShowModelMenu(false); }}
                    className={`w-full px-3 py-2 text-[13px] text-left hover:bg-[#374151] transition-colors ${
                      scopeModelId === m.id ? "bg-[#374151] text-[#6366f1]" : "text-white"
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {loadErr && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-[12px] text-red-400">
            <span>{loadErr}</span>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="px-3 py-1 rounded-md bg-red-500/20 hover:bg-red-500/30 font-medium shrink-0"
            >
              Обновить
            </button>
          </div>
        )}
        {stats?.partial && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-lg text-[12px] text-[#f59e0b]">
            <span>⚠ Часть данных не догрузилась (медленная сеть до Supabase) — цифры могут быть занижены.</span>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="px-3 py-1 rounded-md bg-[#f59e0b]/20 hover:bg-[#f59e0b]/30 font-medium shrink-0"
            >
              Обновить
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((stat, i) => (
            <div key={i} className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-4 hover:border-[#374151] transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[20px]">{stat.emoji}</span>
                <DollarSign className="w-4 h-4 text-[#6b7280]" />
              </div>
              <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider mb-1">{stat.label}</div>
              <div className="text-[24px] font-bold text-white">{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-[#161a22] border border-[#2a2d35] rounded-lg p-5">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <h2 className="text-[16px] font-semibold text-white">Net Sales 📈</h2>
              <div className="flex bg-[#0d1117] border border-[#2a2d35] rounded-lg p-0.5 text-[12px]">
                {(["1d", "7d", "30d", "all"] as ChartPeriod[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1 rounded-md transition-colors ${
                      period === p
                        ? "bg-[#6366f1] text-white"
                        : "text-[#9ca3af] hover:text-white"
                    }`}
                  >
                    {p === "1d" ? "1 Day" : p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "All Time"}
                  </button>
                ))}
              </div>
            </div>
            <ChartCanvas
              chartData={chartData}
              maxValue={maxValue}
              hoveredPoint={hoveredPoint}
              setHoveredPoint={setHoveredPoint}
              empty={stats ? "No sales in this window." : "Loading…"}
              period={period}
            />
          </div>

          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-5">
            <h2 className="text-[16px] font-semibold text-white mb-4">Top Chatter 👑</h2>
            {topChatter ? (
              <div className="text-center space-y-3">
                <div className="w-20 h-20 mx-auto bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-full flex items-center justify-center text-white font-bold text-[24px]">
                  {initials(topChatter.name) || "—"}
                </div>
                <div>
                  <div className="text-[18px] font-bold text-white">{topChatter.name}</div>
                  <div className="text-[13px] text-[#9ca3af]">{topChatter.sales} sales</div>
                </div>
                <div className="pt-3 border-t border-[#2a2d35]">
                  <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider mb-1">Net Sales</div>
                  <div className="text-[28px] font-bold text-[#6366f1]">{fmtMoney(topChatter.net)}</div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-[13px] text-[#6b7280]">
                {stats ? "No chatter sales yet." : "Loading…"}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left column: Models breakdown stacked over Recent Sales */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-5 flex flex-col">
              <h2 className="text-[16px] font-semibold text-white mb-4">Models breakdown 👥</h2>
              <div className="flex-1 overflow-y-auto max-h-[300px] space-y-2 pr-2 custom-scrollbar">
                {(stats?.models ?? []).length === 0 ? (
                  <div className="py-6 text-center text-[13px] text-[#6b7280]">
                    {stats ? "No sales yet." : "Loading…"}
                  </div>
                ) : (
                  stats!.models.map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-3 bg-[#1f2937]/30 rounded-lg hover:bg-[#1f2937]/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-full flex items-center justify-center text-white font-semibold text-[12px]">
                          {initials(m.name) || "M"}
                        </div>
                        <div>
                          <div className="text-[13px] text-white font-medium">{m.name}</div>
                          <div className="text-[11px] text-[#6b7280]">{m.sales} sales</div>
                        </div>
                      </div>
                      <div className="text-[15px] font-bold text-[#6366f1]">{fmtMoney(m.net)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Sales — last 10 paid/delivered. Lives in the left
                column so the right column (Top Fans) stays full-height. */}
            <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-5 flex flex-col">
              <h2 className="text-[16px] font-semibold text-white mb-4">Recent sales 💸</h2>
              <div className="flex-1 overflow-y-auto max-h-[360px] space-y-1.5 pr-2 custom-scrollbar">
                {(stats?.recentSales ?? []).length === 0 ? (
                  <div className="py-6 text-center text-[13px] text-[#6b7280]">
                    {stats ? "No sales yet." : "Loading…"}
                  </div>
                ) : (
                  stats!.recentSales.map((s, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 p-2.5 bg-[#1f2937]/30 rounded-lg hover:bg-[#1f2937]/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 rounded-full flex items-center justify-center text-[12px]">
                          💸
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] text-white font-medium truncate">
                            {s.fanName}
                          </div>
                          <div className="text-[11px] text-[#6b7280] truncate">
                            {s.modelName} · {formatRelative(s.ts)}
                          </div>
                        </div>
                      </div>
                      <div className="text-[14px] font-bold text-emerald-400 shrink-0">
                        {fmtMoney(s.amount)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Top fans */}
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-5 flex flex-col">
            <h2 className="text-[16px] font-semibold text-white mb-4">Top Fans 🏆</h2>
            <div className="flex-1 overflow-y-auto max-h-[300px] space-y-3 pr-2 custom-scrollbar">
              {(stats?.topFans ?? []).length === 0 ? (
                <div className="py-6 text-center text-[13px] text-[#6b7280]">
                  {stats ? "No paying fans yet." : "Loading…"}
                </div>
              ) : (
                stats!.topFans.map((fan, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-[#1f2937]/30 rounded-lg hover:bg-[#1f2937]/50 transition-colors">
                    <div className="w-10 h-10 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-full flex items-center justify-center text-white font-semibold text-[13px] relative">
                      {initials(fan.name) || "F"}
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#f59e0b] rounded-full flex items-center justify-center text-[10px] font-bold">{idx + 1}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-white truncate">{fan.name}</div>
                      <div className="text-[11px] text-[#6b7280]">Total spent</div>
                    </div>
                    <div className="text-[15px] font-bold text-[#6366f1]">{fmtMoney(fan.spent)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Legacy mock kept out — DashboardTab is now fully live.

type Model = { id: string; name: string; username: string | null; earnings: number; avatar_url: string | null; session_status?: string | null };

function ModelsTab() {
  const supabase = createClient();
  const [models, setModels] = useState<Model[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneCodeHash, setPhoneCodeHash] = useState("");
  const [tempSession, setTempSession] = useState("");
  const [twoFaPassword, setTwoFaPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // When set, the connect modal is in "reconnect" mode — verify-code will
  // UPDATE this model's session rather than insert a new row.
  const [reconnectId, setReconnectId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // session_status may not exist yet (migration not run) — fall back.
      const withStatus = await supabase
        .from("models")
        .select("id, name, username, earnings, avatar_url, session_status");
      let rows = (withStatus.data ?? null) as Model[] | null;
      if (withStatus.error) {
        const base = await supabase
          .from("models")
          .select("id, name, username, earnings, avatar_url");
        rows = (base.data ?? null) as Model[] | null;
      }
      if (!rows) return;

      // models.earnings is a stale column — compute the real total live
      // from paid/delivered ppv_sends + paid tips per model. This way
      // every refresh shows current revenue without a backend trigger.
      const modelIds = rows.map((r) => r.id);
      const [sendsRes, tipsRes] = await Promise.all([
        supabase
          .from("ppv_sends")
          .select("model_id, total_price, status")
          .in("model_id", modelIds)
          .in("status", ["paid", "delivered"]),
        supabase
          .from("tips")
          .select("model_id, amount, status")
          .in("model_id", modelIds)
          .eq("status", "paid"),
      ]);
      const earningsByModel = new Map<string, number>();
      for (const s of (sendsRes.data ?? []) as { model_id: string; total_price: number | string }[]) {
        earningsByModel.set(
          s.model_id,
          (earningsByModel.get(s.model_id) ?? 0) + Number(s.total_price ?? 0),
        );
      }
      for (const t of (tipsRes.data ?? []) as { model_id: string; amount: number | string }[]) {
        earningsByModel.set(
          t.model_id,
          (earningsByModel.get(t.model_id) ?? 0) + Number(t.amount ?? 0),
        );
      }
      setModels(rows.map((r) => ({ ...r, earnings: earningsByModel.get(r.id) ?? 0 })));
    })();
  }, []);

  function openModal(reconnectModelId?: string) {
    setStep(1);
    setApiId(""); setApiHash(""); setPhone(""); setCode(""); setTwoFaPassword(""); setError("");
    setReconnectId(reconnectModelId ?? null);
    setShowModal(true);
  }

  async function handleSendCode() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/telegram/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiId, apiHash, phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code");
      setPhoneCodeHash(data.phoneCodeHash);
      setTempSession(data.tempSession);
      setStep(2);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/telegram/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiId, apiHash, phone, code, phoneCodeHash, tempSession, modelId: reconnectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to verify");
      if (data.twoFaNeeded) {
        setTempSession(data.tempSession);
        setStep(3);
        return;
      }
      setModels((prev) =>
        reconnectId
          ? prev.map((m) => (m.id === reconnectId ? data.model : m))
          : [...prev, data.model],
      );
      setShowModal(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckPassword() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/telegram/check-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiId, apiHash, password: twoFaPassword, tempSession, modelId: reconnectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to check password");
      setModels((prev) =>
        reconnectId
          ? prev.map((m) => (m.id === reconnectId ? data.model : m))
          : [...prev, data.model],
      );
      setShowModal(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh(modelId: string) {
    setRefreshingId(modelId);
    try {
      const res = await fetch(`/api/telegram/refresh/${modelId}`, { method: "POST" });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.model) return;
      const freshModel = data.model.avatar_url
        ? { ...data.model, avatar_url: `${data.model.avatar_url.split("?")[0]}?t=${Date.now()}` }
        : data.model;
      setModels((prev) => prev.map((m) => m.id === modelId ? freshModel : m));
    } catch {
      // silent — пользователь просто увидит, что стрелка перестала крутиться
    } finally {
      setRefreshingId(null);
    }
  }

  return (
    <div className="flex-1 bg-[#0d1117] overflow-y-auto p-4 md:p-6">

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl shadow-2xl w-full max-w-[440px] p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-[18px] font-semibold text-white">Connect Telegram Account</h2>
                <div className="flex items-center gap-1.5 mt-3">
                  {([1, 2, 3] as const).map((s) => (
                    <div key={s} className="flex items-center gap-1.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${step === s ? "bg-[#6366f1] text-white" : step > s ? "bg-[#10b981] text-white" : "bg-[#2a2d35] text-[#6b7280]"}`}>{s}</div>
                      {s < 3 && <div className={`w-10 h-0.5 transition-colors ${step > s ? "bg-[#10b981]" : "bg-[#2a2d35]"}`} />}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="text-[#6b7280] hover:text-white text-[22px] leading-none mt-0.5 transition-colors">×</button>
            </div>

            {step === 1 && (
              <div className="space-y-4">
                <p className="text-[13px] text-[#9ca3af]">Enter Telegram API credentials and the model&apos;s phone number</p>
                <div>
                  <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">API ID</label>
                  <input value={apiId} onChange={(e) => setApiId(e.target.value)} placeholder="12345678"
                    className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#4b5563] focus:border-[#6366f1] transition-colors" />
                </div>
                <div>
                  <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">API Hash</label>
                  <input value={apiHash} onChange={(e) => setApiHash(e.target.value)} placeholder="a1b2c3d4e5f6a1b2c3d4e5f6"
                    className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#4b5563] focus:border-[#6366f1] transition-colors" />
                </div>
                <div>
                  <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Phone Number</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1234567890"
                    className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#4b5563] focus:border-[#6366f1] transition-colors" />
                </div>
                {error && <p className="text-[12px] text-red-400">{error}</p>}
                <button onClick={handleSendCode} disabled={loading || !apiId || !apiHash || !phone}
                  className="w-full py-3 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[14px] disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#5558e3] hover:to-[#4338ca] transition-all">
                  {loading ? "Sending code…" : "Continue →"}
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <p className="text-[13px] text-[#9ca3af]">Enter the code Telegram sent to <span className="text-white font-medium">{phone}</span></p>
                <div>
                  <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Verification Code</label>
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="12345" maxLength={6}
                    className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[20px] text-white placeholder:text-[#4b5563] focus:border-[#6366f1] transition-colors text-center tracking-[0.4em]" />
                </div>
                {error && <p className="text-[12px] text-red-400">{error}</p>}
                <button onClick={handleVerify} disabled={loading || !code}
                  className="w-full py-3 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[14px] disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#5558e3] hover:to-[#4338ca] transition-all">
                  {loading ? "Verifying…" : "Verify & Connect"}
                </button>
                <button onClick={() => { setStep(1); setError(""); }} className="w-full py-2 text-[13px] text-[#6b7280] hover:text-white transition-colors">
                  ← Back
                </button>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-[13px] text-[#9ca3af]">This account has two-step verification enabled. Enter your cloud password.</p>
                <div>
                  <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Cloud Password</label>
                  <input type="password" value={twoFaPassword} onChange={(e) => setTwoFaPassword(e.target.value)} placeholder="••••••••"
                    className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#4b5563] focus:border-[#6366f1] transition-colors" />
                </div>
                {error && <p className="text-[12px] text-red-400">{error}</p>}
                <button onClick={handleCheckPassword} disabled={loading || !twoFaPassword}
                  className="w-full py-3 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[14px] disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#5558e3] hover:to-[#4338ca] transition-all">
                  {loading ? "Verifying…" : "Confirm & Connect"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[24px] font-bold text-white mb-1">Models 👤</h1>
            <p className="text-[14px] text-[#9ca3af]">Connect and manage your models&apos; Telegram accounts</p>
          </div>
          <button onClick={() => openModal()} className="px-4 py-2.5 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] rounded-lg text-[13px] font-semibold text-white hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20 flex items-center gap-2">
            <Plus className="w-4 h-4" />Add Model
          </button>
        </div>

        <div className="bg-gradient-to-br from-[#6366f1]/10 to-[#4f46e5]/10 border border-[#6366f1]/30 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-lg flex items-center justify-center shrink-0">
              <LinkIcon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-[16px] font-semibold text-white mb-2">How to Connect Telegram via API ✈️</h3>
              <div className="text-[13px] text-[#d1d5db] space-y-2">
                <p><strong>Step 1:</strong> Go to <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="text-[#6366f1] hover:underline">my.telegram.org</a> and log in with your phone number</p>
                <p><strong>Step 2:</strong> Navigate to &quot;API Development Tools&quot; and create a new application</p>
                <p><strong>Step 3:</strong> Copy your <span className="text-[#6366f1] font-medium">API ID</span> and <span className="text-[#6366f1] font-medium">API Hash</span></p>
                <p><strong>Step 4:</strong> Click &quot;Add Model&quot;, enter the credentials and the model&apos;s phone number</p>
                <p><strong>Step 5:</strong> Enter the code Telegram sends — and you&apos;re connected</p>
              </div>
            </div>
          </div>
        </div>

        {models.length === 0 ? (
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-8">
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-4 bg-[#1f2937] rounded-full flex items-center justify-center text-[32px]">👤</div>
              <h3 className="text-[18px] font-semibold text-white mb-2">No models connected yet</h3>
              <p className="text-[14px] text-[#9ca3af] mb-6">Add your first model to start managing their Telegram account</p>
              <button onClick={() => openModal()} className="px-6 py-3 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] rounded-lg text-[14px] font-semibold text-white hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20 flex items-center gap-2 mx-auto">
                <Plus className="w-4 h-4" />Connect your first model
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg overflow-x-auto">
            <div className="min-w-[560px]">
            <div className="grid grid-cols-4 gap-4 p-4 border-b border-[#2a2d35] bg-[#1f2937]/30">
              <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold">Model</div>
              <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold">Username</div>
              <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold">Status</div>
              <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold">Total Earnings</div>
            </div>
            {models.map((model) => (
              <div key={model.id} className="grid grid-cols-4 gap-4 p-4 border-b border-[#2a2d35] last:border-b-0 hover:bg-[#1f2937]/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10 rounded-full shrink-0 overflow-hidden bg-gradient-to-br from-[#6366f1] to-[#4f46e5]">
                    <span className="absolute inset-0 flex items-center justify-center text-white font-semibold text-[13px]">
                      {model.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </span>
                    {model.avatar_url && (
                      <img
                        src={model.avatar_url}
                        alt={model.name}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                  </div>
                  <span className="text-[14px] font-medium text-white truncate">{model.name}</span>
                </div>
                <div className="flex items-center text-[13px] text-[#9ca3af]">
                  {model.username ? `@${model.username}` : "—"}
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  {model.session_status === "expired" ? (
                    <>
                      <span className="px-2.5 py-1 bg-[#ef4444]/15 text-[#ef4444] rounded-full text-[11px] font-semibold shrink-0">
                        session expired
                      </span>
                      <button
                        onClick={() => openModal(model.id)}
                        className="px-2.5 py-1 bg-[#6366f1] hover:bg-[#5558e3] text-white rounded-full text-[11px] font-semibold shrink-0"
                      >
                        Reconnect
                      </button>
                    </>
                  ) : (
                    <span className="px-2.5 py-1 bg-[#10b981]/20 text-[#10b981] rounded-full text-[11px] font-semibold shrink-0">connected</span>
                  )}
                  <button
                    onClick={() => handleRefresh(model.id)}
                    disabled={refreshingId === model.id}
                    title="Refresh name & avatar from Telegram"
                    className="p-1.5 text-[#6b7280] hover:text-white hover:bg-[#2a2d35] rounded-lg transition-colors disabled:opacity-50 shrink-0"
                  >
                    <span className={`inline-block ${refreshingId === model.id ? "animate-spin" : ""}`}>↻</span>
                  </button>
                </div>
                <div className="flex items-center text-[15px] font-bold text-[#6366f1]">
                  ${model.earnings.toLocaleString()}
                </div>
              </div>
            ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


const cryptoOptions = [
  { id: "usdt", name: "USDT", icon: "₮" },
  { id: "usdc", name: "USDC", icon: "$" },
  { id: "btc", name: "Bitcoin", icon: "₿" },
  { id: "eth", name: "Ethereum", icon: "Ξ" },
];
const networkOptions: Record<string, string[]> = {
  usdt: ["TRC20", "ERC20", "BEP20"],
  usdc: ["ERC20", "Polygon"],
  btc: ["Bitcoin"],
  eth: ["Ethereum"],
};

type Payout = {
  id: string;
  amount: number;
  address: string | null;
  status: string;
  created_at: string;
  paid_at: string | null;
};

function WalletTab() {
  const supabase = createClient();
  const [selectedCrypto, setSelectedCrypto] = useState("usdt");
  const [selectedNetwork, setSelectedNetwork] = useState("TRC20");
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");

  const [netAllTime, setNetAllTime] = useState<number | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  // Agency split breakdown (all-time) — both gross turnover and the
  // agency's own cut, plus what's owed to models / chatters per splits.
  type SplitTotals = { gross: number; modelCut: number; chatterCut: number; agencyCut: number };
  type SplitPair = {
    modelName: string;
    chatterName: string;
    gross: number;
    modelCut: number;
    chatterCut: number;
    agencyCut: number;
  };
  const [splitTotals, setSplitTotals] = useState<SplitTotals | null>(null);
  const [splitPairs, setSplitPairs] = useState<SplitPair[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Pre-fill the saved payout address from Settings.
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (cancelled) return;
        const saved = user?.user_metadata?.payout_address as string | undefined;
        if (saved) setAddress((a) => a || saved);
      });
      try {
        const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
        const [statsRes, payoutsRes, splitRes] = await Promise.all([
          fetch("/api/dashboard/stats"),
          fetch("/api/payouts"),
          fetch(`/api/payout/report?from=2000-01-01&to=${tomorrow}`),
        ]);
        if (cancelled) return;
        if (statsRes.ok) {
          const s = await statsRes.json();
          setNetAllTime(Number(s.netAllTime ?? 0));
          setAvailable(Number(s.availableBalance ?? 0));
        }
        if (payoutsRes.ok) {
          const p = await payoutsRes.json();
          setPayouts((p.payouts ?? []) as Payout[]);
          if (typeof p.availableBalance === "number") setAvailable(p.availableBalance);
        }
        if (splitRes.ok) {
          const r = await splitRes.json();
          if (r.totals) setSplitTotals(r.totals as SplitTotals);
          if (r.byPair) setSplitPairs(r.byPair as SplitPair[]);
        }
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleWithdraw() {
    const amt = Number(amount);
    setMsg("");
    if (!Number.isFinite(amt) || amt < 20) {
      setMsg("Minimum withdrawal is $20.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPayouts((prev) => [data.payout as Payout, ...prev]);
      if (typeof data.availableBalance === "number") setAvailable(data.availableBalance);
      setAmount("");
      setMsg("✓ Withdrawal requested — pending review.");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  const money = (n: number | null) =>
    n == null ? "…" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const statusCls = (s: string) =>
    s === "paid"
      ? "bg-emerald-500/15 text-emerald-400"
      : s === "rejected"
        ? "bg-red-500/15 text-red-400"
        : "bg-[#f59e0b]/15 text-[#f59e0b]";

  return (
    <div className="flex-1 bg-[#0d1117] overflow-y-auto p-4 md:p-6">
      <div className="max-w-[1000px] mx-auto space-y-6">
        <div>
          <h1 className="text-[24px] font-bold text-white mb-1">Wallet 💰</h1>
          <p className="text-[14px] text-[#9ca3af]">Manage your earnings and withdrawals</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-lg p-6 shadow-lg shadow-[#6366f1]/20">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-white/80" />
              <span className="text-[13px] text-white/80 uppercase tracking-wider font-medium">Total Net Sales</span>
            </div>
            <div className="text-[36px] font-bold text-white">{money(netAllTime)}</div>
            <div className="flex items-center gap-2 mt-2 text-[13px] text-white/80">
              <TrendingUp className="w-4 h-4" /><span>All-time delivered revenue</span>
            </div>
          </div>
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-[#9ca3af]" />
              <span className="text-[13px] text-[#9ca3af] uppercase tracking-wider font-medium">Available Balance</span>
            </div>
            <div className="text-[36px] font-bold text-white">{money(available)}</div>
            <div className="text-[13px] text-[#6b7280] mt-2">Net minus requested payouts</div>
          </div>
        </div>

        {/* Agency split breakdown — both gross and the agency's own cut,
            plus what's owed out to models / chatters (per Payout splits). */}
        {splitTotals && (
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-6">
            <h2 className="text-[18px] font-semibold text-white mb-1 flex items-center gap-2">
              Agency split 🧮
            </h2>
            <p className="text-[13px] text-[#9ca3af] mb-4">
              All-time, aggregated across every model. Configure the split in Settings → Payout.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <div className="bg-[#0f131a] border border-[#2a2d35] rounded-lg p-4">
                <div className="text-[10px] uppercase tracking-wider text-[#9ca3af]">Gross turnover</div>
                <div className="text-[22px] font-bold text-white mt-1">{money(splitTotals.gross)}</div>
              </div>
              <div className="bg-gradient-to-br from-[#6366f1]/20 to-[#4f46e5]/10 border border-[#6366f1]/40 rounded-lg p-4">
                <div className="text-[10px] uppercase tracking-wider text-[#a5a8ff]">Agency cut</div>
                <div className="text-[22px] font-bold text-white mt-1">{money(splitTotals.agencyCut)}</div>
              </div>
              <div className="bg-[#0f131a] border border-[#2a2d35] rounded-lg p-4">
                <div className="text-[10px] uppercase tracking-wider text-[#9ca3af]">Owed to models</div>
                <div className="text-[22px] font-bold text-white mt-1">{money(splitTotals.modelCut)}</div>
              </div>
              <div className="bg-[#0f131a] border border-[#2a2d35] rounded-lg p-4">
                <div className="text-[10px] uppercase tracking-wider text-[#9ca3af]">Owed to chatters</div>
                <div className="text-[22px] font-bold text-white mt-1">{money(splitTotals.chatterCut)}</div>
              </div>
            </div>
            {splitPairs.length > 0 && (
              <div className="bg-[#0f131a] border border-[#2a2d35] rounded-lg overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-[#161a22]">
                    <tr className="text-left text-[#9ca3af]">
                      <th className="px-3 py-2">Model</th>
                      <th className="px-3 py-2">Chatter</th>
                      <th className="px-3 py-2 text-right">Gross</th>
                      <th className="px-3 py-2 text-right">Model</th>
                      <th className="px-3 py-2 text-right">Chatter</th>
                      <th className="px-3 py-2 text-right">Agency</th>
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    {splitPairs.map((p, i) => (
                      <tr key={i} className="border-t border-[#2a2d35]">
                        <td className="px-3 py-2">{p.modelName}</td>
                        <td className="px-3 py-2">{p.chatterName}</td>
                        <td className="px-3 py-2 text-right">{money(p.gross)}</td>
                        <td className="px-3 py-2 text-right">{money(p.modelCut)}</td>
                        <td className="px-3 py-2 text-right">{money(p.chatterCut)}</td>
                        <td className="px-3 py-2 text-right">{money(p.agencyCut)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-6">
          <h2 className="text-[18px] font-semibold text-white mb-6 flex items-center gap-2">
            Withdraw Funds <ArrowUpRight className="w-5 h-5 text-[#6366f1]" />
          </h2>
          <div className="space-y-5">
            <div>
              <label className="text-[13px] text-[#9ca3af] font-medium mb-2 block">Select Cryptocurrency</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {cryptoOptions.map((crypto) => (
                  <button
                    key={crypto.id}
                    onClick={() => { setSelectedCrypto(crypto.id); setSelectedNetwork(networkOptions[crypto.id][0]); }}
                    className={`p-4 rounded-lg border-2 transition-all ${selectedCrypto === crypto.id ? "border-[#6366f1] bg-[#6366f1]/10" : "border-[#374151] bg-[#1f2937] hover:border-[#4b5563]"}`}
                  >
                    <div className="text-[24px] mb-1">{crypto.icon}</div>
                    <div className="text-[13px] font-semibold text-white">{crypto.name}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[13px] text-[#9ca3af] font-medium mb-2 block">Select Network</label>
              <div className="flex gap-3 flex-wrap">
                {networkOptions[selectedCrypto].map((network) => (
                  <button
                    key={network}
                    onClick={() => setSelectedNetwork(network)}
                    className={`px-4 py-2.5 rounded-lg text-[13px] font-medium transition-all ${selectedNetwork === network ? "bg-[#6366f1] text-white" : "bg-[#1f2937] text-[#9ca3af] border border-[#374151] hover:border-[#4b5563]"}`}
                  >
                    {network}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[13px] text-[#9ca3af] font-medium mb-2 block">Amount (Minimum $20)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6b7280] text-[14px]">$</span>
                <input
                  type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                  className="w-full pl-8 pr-4 py-3 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1]"
                />
              </div>
              <div className="text-[11px] text-[#6b7280] mt-1">Available: {money(available)}</div>
            </div>
            <div>
              <label className="text-[13px] text-[#9ca3af] font-medium mb-2 block">Withdrawal Address</label>
              <input
                type="text" value={address} onChange={(e) => setAddress(e.target.value)}
                placeholder={`Enter your ${cryptoOptions.find((c) => c.id === selectedCrypto)?.name} address`}
                className="w-full px-4 py-3 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1]"
              />
            </div>
            <div className="bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-[20px]">⚠️</span>
                <div className="text-[12px] text-[#f59e0b]">
                  <p className="font-semibold mb-1">Important</p>
                  <p>Double-check your withdrawal address. Transactions cannot be reversed once confirmed.</p>
                </div>
              </div>
            </div>
            {msg && (
              <div className={`text-[12px] ${msg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>
                {msg}
              </div>
            )}
            <button
              onClick={handleWithdraw}
              disabled={submitting}
              className="w-full py-3.5 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[14px] hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Requesting…" : "Request Withdrawal"}
            </button>
          </div>
        </div>

        {/* Payout history */}
        <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-6">
          <h2 className="text-[16px] font-semibold text-white mb-4">Payout history</h2>
          {payouts.length === 0 ? (
            <div className="text-[13px] text-[#6b7280] py-4 text-center">No withdrawals yet.</div>
          ) : (
            <div className="space-y-2">
              {payouts.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-[#1f2937]/30 rounded-lg">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-white">
                      ${Number(p.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[11px] text-[#6b7280] truncate">
                      {p.address || "—"} · {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusCls(p.status)}`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgencyDashboard() {
  const [activeTab, setActiveTab] = useState<AgencyTab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function selectTab(t: AgencyTab) {
    setActiveTab(t);
    setSidebarOpen(false); // close drawer after picking on mobile
  }

  return (
    <div className="h-screen w-screen flex bg-[#0d1117] text-white overflow-hidden" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}>
      <AgencySidebar
        activeTab={activeTab}
        onTabChange={selectTab}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Mobile top bar with hamburger — hidden on md+ */}
        <div className="md:hidden h-[52px] shrink-0 bg-[#161a22] border-b border-[#2a2d35] flex items-center gap-3 px-4">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#1f2937] text-white"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-[15px] font-semibold">
            ppvs<span className="text-[#6366f1]">.io</span>
          </span>
        </div>
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {activeTab === "dashboard" && <DashboardTab />}
          {activeTab === "ppvs" && <PPVsTab />}
          {activeTab === "models" && <ModelsTab />}
          {activeTab === "chatters" && <ChattersTab />}
          {activeTab === "wallet" && <WalletTab />}
          {activeTab === "settings" && <SettingsTab role="agency" />}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────

export default function DashboardPage() {
  const supabase = createClient();
  const router = useRouter();
  const [role, setRole] = useState<"agency" | "chatter" | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      const r = (user.user_metadata?.role as "agency" | "chatter") ?? "chatter";
      setRole(r);
    });
  }, [supabase]);

  // Platform admins (ADMIN_EMAILS) go straight to /admin instead of a blank
  // dashboard — unless they also run an agency (role "agency"), in which case
  // they keep their own dashboard and reach /admin via the sidebar link.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/whoami")
      .then((r) => {
        if (!cancelled && r.ok) setIsAdmin(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isAdmin && role !== null && role !== "agency") router.replace("/admin");
  }, [isAdmin, role, router]);

  if (role === null) return null;
  if (isAdmin && role !== "agency") return null; // redirecting to /admin

  if (role === "agency") return <AgencyDashboard />;

  return <ChatterDashboardLayout />;
}
