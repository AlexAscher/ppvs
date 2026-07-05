"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PPVsTab } from "@/components/ppv/PPVsTab";
import { ChattersTab } from "@/components/chatters/ChattersTab";
import { ChatterDashboardLayout } from "@/components/chatters/ChatterDashboardLayout";
import { SettingsTab } from "@/components/settings/SettingsTab";
import { createClient } from "@/lib/supabase";
import { chatterWorkspaceUrl } from "@/lib/host-routes";
import {
  MessageSquare,
  TrendingUp, DollarSign,
  Plus, Link as LinkIcon, ArrowUpRight, LogOut, Menu,
} from "lucide-react";
import type { DashboardStats } from "@/app/api/dashboard/stats/route";
import { agencyNet } from "@/lib/platform";

// ─────────────────────────────────────────────
// AGENCY DASHBOARD
// ─────────────────────────────────────────────

type AgencyTab = "dashboard" | "ppvs" | "models" | "chatters" | "wallet" | "settings";

const menuItems = [
  // Labels + emojis mirror the main-site feature names. Settings has no
  // main-page equivalent, so it keeps its existing label/emoji.
  { id: "dashboard" as AgencyTab, label: "Agency Dashboard", emoji: "📊" },
  { id: "ppvs" as AgencyTab, label: "Vault", emoji: "🔒" },
  { id: "models" as AgencyTab, label: "Creators", emoji: "🎭" },
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
  // Display name shown above the email in the sidebar account block.
  // Prefer the agency_name they typed at signup; fall back to their
  // display name; final fallback "Agency Owner".
  const [accountDisplay, setAccountDisplay] = useState("Agency Owner");
  const [isAdmin, setIsAdmin] = useState(false);
  // Computed client-side after hydration so the link points at chatter.ppvs.io
  // when we're on the apex (otherwise SSR returns the relative /chatter path).
  const [chatterHref, setChatterHref] = useState("/chatter");
  useEffect(() => { setChatterHref(chatterWorkspaceUrl()); }, []);
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
      const agencyName = (user.user_metadata?.agency_name as string | undefined)?.trim();
      const fullName = (user.user_metadata?.full_name as string | undefined)?.trim();
      // Prefer agency name (typed at signup), fall back to display name.
      if (agencyName) setAccountDisplay(agencyName);
      else if (fullName) setAccountDisplay(fullName);
      // Initials reflect whichever name we ended up showing.
      const source = agencyName || fullName || user.email || "";
      const parts = source.split(/[\s@.]+/).filter(Boolean);
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
    // v3: log out / exit always lands on the home page.
    router.replace("/");
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
        {/* Brand mark — the PPVS.IO P-key logo. Explicit width/height (attr +
            inline style) so it can never blow up to 100% if Tailwind sizing
            fails to load on the dashboard route. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/logo.png"
          alt="ppvs.io"
          width={32}
          height={32}
          className="w-8 h-8 shrink-0"
          style={{ width: 32, height: 32, flex: "0 0 32px", objectFit: "contain", borderRadius: "6px" }}
        />
        <span className="text-[12px] px-2 py-0.5 bg-[#00AFF0]/10 text-[#00AFF0] rounded-full font-medium">Agency</span>
      </div>

      <div className="flex-1 py-4 px-3">
        <div className="space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full px-4 py-2.5 rounded-lg flex items-center gap-3 transition-all ${
                activeTab === item.id
                  ? "bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] text-white shadow-lg shadow-[#00AFF0]/20"
                  : "text-[#9ca3af] hover:bg-[#1f2937] hover:text-white"
              }`}
            >
              <span className="text-[16px]">{item.emoji}</span>
              <span className="text-[13px] font-medium">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="my-4 border-t border-[#2a2d35]" />

        <a
          href={chatterHref}
          target="_blank"
          rel="noopener"
          className="w-full px-4 py-2.5 rounded-lg flex items-center gap-3 text-[#9ca3af] hover:bg-[#1f2937] hover:text-white transition-all"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="text-[13px] font-medium">Go to Chatter</span>
        </a>

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
          <div className="w-9 h-9 bg-gradient-to-br from-[#00AFF0] to-[#00AFF0] rounded-full flex items-center justify-center text-white font-semibold text-[13px] shrink-0">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-white truncate">{accountDisplay}</div>
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
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
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
  return new Date(ts).toLocaleDateString("en-US");
}

type ChartPeriod = "1d" | "7d" | "30d" | "90d" | "ytd";

/**
 * Nice-tick Y-axis: 5 evenly-spaced ticks (top → 0) chosen so labels are
 * always whole/round numbers.
 *   maxValue ≤ 4  → step 1 (0/1/2/3/4)
 *   maxValue ≤ 8  → step 2
 *   maxValue ≤ 20 → step 5
 *   otherwise     → smallest step from {1,2,2.5,5}×10^n s.t. 4·step ≥ max
 * Returns { top, ticks } where `top` = ticks[0] (use for chart scaling too).
 */
function computeNiceTicks(maxValue: number): { top: number; ticks: number[] } {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return { top: 4, ticks: [4, 3, 2, 1, 0] };
  }
  let step: number;
  if (maxValue <= 4) step = 1;
  else if (maxValue <= 8) step = 2;
  else if (maxValue <= 20) step = 5;
  else {
    let found = 0;
    outer: for (let mag = 1; mag < 15; mag++) {
      const scale = Math.pow(10, mag);
      for (const c of [1, 2, 2.5, 5]) {
        const s = c * scale;
        if (s * 4 >= maxValue) { found = s; break outer; }
      }
    }
    step = found || Math.ceil(maxValue / 4);
  }
  const top = step * 4;
  return { top, ticks: [top, step * 3, step * 2, step, 0] };
}

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
  // Track viewport width so x-axis label density updates on resize.
  const [vw, setVw] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
  const { top: niceTop, ticks: yTickValues } = computeNiceTicks(maxValue);
  const y = (v: number) => VB_H - (v / niceTop) * VB_H;

  const linePoints = chartData.map((d, i) => `${x(i).toFixed(2)},${y(d.value).toFixed(2)}`).join(" ");
  const areaPath =
    `M ${x(0).toFixed(2)},${y(chartData[0].value).toFixed(2)} ` +
    chartData.slice(1).map((d, i) => `L ${x(i + 1).toFixed(2)},${y(d.value).toFixed(2)}`).join(" ") +
    ` L ${x(n - 1).toFixed(2)},${VB_H} L ${x(0).toFixed(2)},${VB_H} Z`;

  // How many labels to show along the bottom — pick a target count and
  // stride through buckets so labels stay readable. Density adapts to
  // viewport: small phones get 4, tablets get 5, desktops keep the
  // original 7/8 (period-aware).
  // Tighter caps so "all time" doesn't crash a dozen weekly labels into
  // each other. Roughly 55px per label on desktop, 70px on mobile.
  const chartPxWidth = Math.max(280, vw - 480);
  const maxLabels = Math.max(3, Math.floor(chartPxWidth / (vw < 480 ? 70 : 60)));
  const targetLabels = Math.min(maxLabels, vw < 480 ? 4 : vw < 900 ? 5 : period === "7d" ? 7 : 8);
  const stride = Math.max(1, Math.ceil(n / targetLabels));

  // Y-axis $ labels — see computeNiceTicks above (5 rungs, always round $).
  const yTicks = yTickValues;
  const fmtTick = (v: number): string => {
    if (v === 0) return "$0";
    if (v >= 10_000) return `$${(v / 1000).toFixed(0)}k`;
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
    if (v < 10 && v % 1 !== 0) return `$${v.toFixed(1)}`;
    return `$${Math.round(v)}`;
  };

  return (
    <div className="relative">
      <div className="ml-12 mr-2">
        {/* Y-axis $ labels — absolute-positioned so they don't push the chart. */}
        <div className="absolute left-0 top-0 h-[180px] w-11 flex flex-col justify-between py-0 text-right text-[10px] text-[#6b7280] pointer-events-none">
          {yTicks.map((v, i) => (
            <div key={i} className="leading-none pr-2 -translate-y-1">{fmtTick(v)}</div>
          ))}
        </div>
        <div className="relative h-[180px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="absolute w-full border-t border-[#2a2d35]"
              style={{ top: `${i * 25}%` }}
            />
          ))}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#00AFF0" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#00AFF0" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#lineGradient)" />
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
              <div className="w-3 h-3 bg-[#00AFF0] rounded-full border-2 border-[#161a22] cursor-pointer hover:scale-150 transition-transform" />
              {hoveredPoint === i && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 whitespace-nowrap shadow-xl z-10">
                  <div className="text-[11px] text-[#9ca3af]">{point.date}</div>
                  <div className="text-[14px] font-bold text-[#00AFF0]">{point.label}</div>
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

function ConversationsStartedCard({
  chartData,
  loading,
}: {
  chartData: { date: string; value: number }[];
  loading: boolean;
}) {
  // v3: fixed 7-day window; source is server-side
  // /api/dashboard/stats.conversations7d (new fan rows per day). No toggle
  // — brief now shows a static "Last 7 days" label instead.
  const bars = chartData.slice(-7);
  const maxV = Math.max(0, ...bars.map((b) => b.value));
  // Same nice-tick logic as Net Sales, but the values are integer counts of
  // conversations rather than dollars — reuse the algorithm, then format as
  // plain integers.
  const { top: niceTop, ticks: yTicks } = computeNiceTicks(maxV);
  const fmtCount = (v: number) => String(Math.round(v));
  // Hover/click state — desktop hover + mobile tap both surface a tooltip
  // showing the exact date + count. Auto-clears after ~2.5s on tap so the
  // tooltip doesn't stick when the user moves on.
  const [activeBar, setActiveBar] = useState<number | null>(null);
  useEffect(() => {
    if (activeBar === null) return;
    const t = setTimeout(() => setActiveBar(null), 2500);
    return () => clearTimeout(t);
  }, [activeBar]);
  return (
    <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-[16px] font-semibold text-white">Conversations Started 📊</h2>
        <span className="text-[11px] text-[#9ca3af]">Last 7 days</span>
      </div>
      {bars.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-[#6b7280] flex-1 flex items-center justify-center">
          {loading ? "Loading…" : "No activity yet."}
        </div>
      ) : (
        // Left Y-axis labels + gridlines, matching the Net Sales card. The
        // bar row is offset by ml-8 so the labels never overlap the chart.
        // The whole box adapts down to narrow screens via clamp() height.
        <div className="relative flex-1 pt-4 pb-2" style={{ height: "clamp(180px, 42vw, 240px)" }}>
          <div className="absolute left-0 top-4 bottom-8 w-8 flex flex-col justify-between text-right text-[10px] text-[#6b7280] pointer-events-none">
            {yTicks.map((v, i) => (
              <div key={i} className="leading-none pr-1.5 -translate-y-1">{fmtCount(v)}</div>
            ))}
          </div>
          <div className="absolute left-8 right-0 top-4 bottom-8">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="absolute w-full border-t border-[#2a2d35]"
                style={{ top: `${i * 25}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-1">
              {bars.map((b, i) => {
                const pct = niceTop > 0 ? (b.value / niceTop) * 100 : 0;
                const d = new Date(b.date);
                const isActive = activeBar === i;
                const dateLabel = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                return (
                  <div
                    key={i}
                    className="relative flex-1 flex flex-col items-center gap-1 min-w-0 h-full justify-end cursor-pointer group"
                    onMouseEnter={() => setActiveBar(i)}
                    onMouseLeave={() => setActiveBar(null)}
                    onClick={() => setActiveBar(i)}
                  >
                    {isActive && (
                      <div
                        className="absolute z-10 px-2 py-1 rounded-md bg-[#0d1117] border border-[#2a2d35] shadow-lg text-white pointer-events-none whitespace-nowrap"
                        style={{ top: -4, left: "50%", transform: "translate(-50%, -100%)", fontSize: 11 }}
                      >
                        <div className="font-semibold text-[#00AFF0]">{b.value} {b.value === 1 ? "conversation" : "conversations"}</div>
                        <div className="text-[10px] text-[#9ca3af]">{dateLabel}</div>
                      </div>
                    )}
                    <div
                      className="w-full rounded-t-md transition-opacity"
                      style={{
                        height: `${pct}%`,
                        minHeight: b.value > 0 ? 6 : 0,
                        background: isActive
                          ? "linear-gradient(180deg, rgba(70,196,255,1) 0%, rgba(0,175,240,0.55) 100%)"
                          : "linear-gradient(180deg, rgba(0,175,240,0.9) 0%, rgba(0,175,240,0.35) 100%)",
                        boxShadow: "0 -6px 20px -8px rgba(0,175,240,0.4)",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="absolute left-8 right-0 bottom-0 h-6 flex items-end gap-1">
            {bars.map((b, i) => {
              const d = new Date(b.date);
              const label = d.toLocaleDateString("en-US", { weekday: "short" });
              return (
                <div key={i} className="flex-1 text-center text-[9px] text-[#6b7280] min-w-0">
                  {label}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardTab() {
  // Agency name for the "Hello X 👋" header — same source as the sidebar.
  const [agencyDisplayName, setAgencyDisplayName] = useState<string>("there");
  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const agencyName = (user.user_metadata?.agency_name as string | undefined)?.trim();
      const fullName = (user.user_metadata?.full_name as string | undefined)?.trim();
      const name = agencyName || fullName || (user.email ?? "").split("@")[0];
      if (name) setAgencyDisplayName(name);
    });
  }, []);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  // Chart window — independent of the stat cards above. The cards always
  // show their canonical windows (Today / Week / Month / All Time).
  const [period, setPeriod] = useState<ChartPeriod>("7d");

  // Model scope: null = All creators. Selector lives top-left in the header.
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
    ? models.find((m) => m.id === scopeModelId)?.name ?? "Creator"
    : "All creators";

  // v3: Stars removed from agency dashboard. Sales/Unlocks + Conversion Rate
  // moved to the right side of the grid (slots 7 & 8).
  type Card =
    | { label: string; emoji: string; kind: "money"; usd: number }
    | { label: string; emoji: string; kind: "raw"; value: string; sub?: string };
  const cards: Card[] = stats
    ? [
        { label: "Net Today", emoji: "💵", kind: "money", usd: stats.netToday },
        { label: "Net This Week", emoji: "💰", kind: "money", usd: stats.netWeek },
        { label: "Net This Month", emoji: "🏆", kind: "money", usd: stats.netMonth },
        { label: "Net All Time", emoji: "🤑", kind: "money", usd: stats.netAllTime },
        { label: "Available Balance", emoji: "💳", kind: "money", usd: stats.availableBalance },
        { label: "Avg Order Value", emoji: "🛒", kind: "money", usd: stats.avgOrder },
        { label: "Sales / Unlocks", emoji: "🔓", kind: "raw", value: String(stats.sales) },
        {
          label: "Conversion Rate",
          emoji: "🎯",
          kind: "raw",
          value: stats.totalFans > 0 ? `${Math.round((stats.payingFans / stats.totalFans) * 100)}%` : "—",
          sub: `${stats.payingFans} / ${stats.totalFans} paying`,
        },
      ]
    : (Array.from({ length: 8 }, (_, i) => ({
        label: ["Net Today","Net This Week","Net This Month","Net All Time","Available Balance","Avg Order Value","Sales / Unlocks","Conversion Rate"][i],
        emoji: "•",
        kind: "raw" as const,
        value: "…",
      })));

  const chartData = (stats?.chart ?? []).map((c) => ({ ...c, label: fmtMoney(c.value) }));
  const maxValue = Math.max(1, ...chartData.map((d) => d.value));

  return (
    <div
      className="flex-1 overflow-y-auto p-4 md:p-6"
      style={{
        // v3: single site-wide blue gradient backdrop instead of per-card
        // glows. Positioned as a large soft radial blob top-left with the
        // brand colour, fading into the neutral bg over the rest of the page.
        background:
          "radial-gradient(1200px 700px at 8% -10%, rgba(0,175,240,0.22) 0%, rgba(0,175,240,0.06) 32%, rgba(0,175,240,0) 60%), #0d1117",
      }}
    >
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[24px] font-bold text-white mb-1">
              Hello {agencyDisplayName}! 👋
            </h1>
            <p className="text-[14px] text-[#9ca3af]">
              {stats
                ? `${fmtMoney(stats.availableBalance)} ready to withdraw · ${fmtMoney(stats.netWeek)} net in the last 7 days`
                : "Overview of your agency performance"}
            </p>
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
                    !scopeModelId ? "bg-[#374151] text-[#00AFF0]" : "text-white"
                  }`}
                >
                  All creators
                </button>
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setScopeModelId(m.id); setShowModelMenu(false); }}
                    className={`w-full px-3 py-2 text-[13px] text-left hover:bg-[#374151] transition-colors ${
                      scopeModelId === m.id ? "bg-[#374151] text-[#00AFF0]" : "text-white"
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
              Refresh
            </button>
          </div>
        )}
        {stats?.partial && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-lg text-[12px] text-[#f59e0b]">
            <span>⚠ Some data didn&apos;t finish loading (slow connection to the database) — figures may be understated.</span>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="px-3 py-1 rounded-md bg-[#f59e0b]/20 hover:bg-[#f59e0b]/30 font-medium shrink-0"
            >
              Refresh
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((stat, i) => (
            <div
              key={i}
              className="rounded-xl p-4 transition-colors"
              style={{ background: "#161a22", border: "1px solid #2a2d35" }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[20px]">{stat.emoji}</span>
              </div>
              <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider mb-1">{stat.label}</div>
              {stat.kind === "money" ? (
                <div className="text-[24px] font-bold text-white whitespace-nowrap leading-tight">
                  {fmtMoney(stat.usd)}
                </div>
              ) : (
                <>
                  <div className="text-[24px] font-bold text-white">{stat.value}</div>
                  {stat.sub ? (
                    <div className="text-[11px] text-[#6b7280] mt-0.5">{stat.sub}</div>
                  ) : null}
                </>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-[#161a22] border border-[#2a2d35] rounded-lg p-5">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <h2 className="text-[16px] font-semibold text-white">Net Sales 📈</h2>
              <div className="flex bg-[#0d1117] border border-[#2a2d35] rounded-lg p-0.5 text-[12px]">
                {(["1d", "7d", "30d", "90d", "ytd"] as ChartPeriod[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1 rounded-md transition-colors ${
                      period === p
                        ? "bg-[#00AFF0] text-white"
                        : "text-[#9ca3af] hover:text-white"
                    }`}
                  >
                    {p === "1d" ? "1 Day" : p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : p === "90d" ? "90 Days" : "YTD"}
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

          <ConversationsStartedCard chartData={stats?.conversations7d ?? []} loading={!stats} />
        </div>

        {/* Bottom row: LEFT (2 cols) Recent Sales spans the full stack;
            RIGHT (1 col) three narrow boxes stacked — Creators Breakdown,
            Top Chatters, Top Fans. Recent Sales' bottom aligns with Top
            Fans' bottom because the left cell row-spans all three. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left: Recent Sales, sales amounts in the same blue as Top Fans. */}
          <div className="md:col-span-2 md:row-span-3 bg-[#161a22] border border-[#2a2d35] rounded-lg p-5 flex flex-col min-h-[560px]">
            <h2 className="text-[16px] font-semibold text-white mb-4">Recent Sales 💸</h2>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
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
                      <div className="w-7 h-7 bg-gradient-to-br from-[#00AFF0]/20 to-[#00AFF0]/10 border border-[#00AFF0]/30 rounded-full flex items-center justify-center text-[12px]">
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
                    <div className="text-[14px] font-bold text-[#00AFF0] shrink-0">
                      {/* Show what the agency actually receives (85%). */}
                      {fmtMoney(s.amount * 0.85)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right column: 3 compact boxes stacked. */}
          {/* Creators Breakdown — 1 row visible, scrolls if more. */}
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-5 flex flex-col">
            <h2 className="text-[15px] font-semibold text-white mb-3">Creators Breakdown 👥</h2>
            <div className="overflow-y-auto space-y-2 pr-2 custom-scrollbar" style={{ maxHeight: 68 }}>
              {(stats?.models ?? []).length === 0 ? (
                <div className="py-3 text-center text-[12px] text-[#6b7280]">
                  {stats ? "No sales yet." : "Loading…"}
                </div>
              ) : (
                stats!.models.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-2.5 bg-[#1f2937]/30 rounded-lg hover:bg-[#1f2937]/50 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 bg-gradient-to-br from-[#00AFF0] to-[#00AFF0] rounded-full flex items-center justify-center text-white font-semibold text-[11px] shrink-0">
                        {initials(m.name) || "M"}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[12px] text-white font-medium truncate">{m.name}</div>
                        <div className="text-[10px] text-[#6b7280]">{m.sales} sales</div>
                      </div>
                    </div>
                    <div className="text-[13px] font-bold text-[#00AFF0] shrink-0">{fmtMoney(m.net)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top Chatters — 1 row visible, scrolls if more. */}
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-5 flex flex-col">
            <h2 className="text-[15px] font-semibold text-white mb-3">Top Chatters ✍️</h2>
            <div className="overflow-y-auto space-y-2 pr-2 custom-scrollbar" style={{ maxHeight: 68 }}>
              {(stats?.chatters ?? []).length === 0 ? (
                <div className="py-3 text-center text-[12px] text-[#6b7280]">
                  {stats ? "No chatter sales yet." : "Loading…"}
                </div>
              ) : (
                stats!.chatters.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-2.5 bg-[#1f2937]/30 rounded-lg hover:bg-[#1f2937]/50 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 bg-gradient-to-br from-[#00AFF0] to-[#00AFF0] rounded-full flex items-center justify-center text-white font-semibold text-[11px] shrink-0">
                        {initials(c.name) || "C"}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[12px] text-white font-medium truncate">{c.name}</div>
                        <div className="text-[10px] text-[#6b7280]">{c.sales} sales</div>
                      </div>
                    </div>
                    <div className="text-[13px] font-bold text-[#00AFF0] shrink-0">{fmtMoney(c.net)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top Fans — 5–6 highest paying. Username vert-centered with the
              avatar (no secondary "Net to agency" line under it anymore). */}
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-5 flex flex-col">
            <h2 className="text-[15px] font-semibold text-white mb-3">Top Fans 💸</h2>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar" style={{ maxHeight: 380 }}>
              {(stats?.topFans ?? []).length === 0 ? (
                <div className="py-3 text-center text-[12px] text-[#6b7280]">
                  {stats ? "No paying fans yet." : "Loading…"}
                </div>
              ) : (
                stats!.topFans.slice(0, 6).map((fan, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2.5 bg-[#1f2937]/30 rounded-lg hover:bg-[#1f2937]/50 transition-colors">
                    <div className="w-9 h-9 bg-gradient-to-br from-[#00AFF0] to-[#00AFF0] rounded-full flex items-center justify-center text-white font-semibold text-[12px] relative shrink-0">
                      {initials(fan.name) || "F"}
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#f59e0b] rounded-full flex items-center justify-center text-[9px] font-bold">{idx + 1}</div>
                    </div>
                    <div className="flex-1 min-w-0 text-[12px] font-medium text-white truncate">{fan.name}</div>
                    <div className="text-[13px] font-bold text-[#00AFF0] shrink-0">{fmtMoney(fan.spent * 0.85)}</div>
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
  // Per-model "@ppvstarbot connected via Chat Automation?" status. Fetched on
  // mount after models load. Drives the badge + the "Connect bot" modal.
  const [connStatus, setConnStatus] = useState<Record<string, { connected: boolean }>>({});
  const [showBotInstructions, setShowBotInstructions] = useState(false);
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
      // Net of the platform's 10% commission so the figure matches the
      // Dashboard / Wallet numbers the agency sees everywhere else.
      setModels(rows.map((r) => ({ ...r, earnings: agencyNet(earningsByModel.get(r.id) ?? 0) })));

      // Kick off the bot-connection probe. Lazy: the API resolves each model's
      // TG user id via gramJS getMe on first call and caches it on the row.
      if (rows.length > 0) {
        try {
          const r = await fetch(`/api/creators/connection-status?modelIds=${rows.map((x) => x.id).join(",")}`);
          if (r.ok) {
            const j = (await r.json()) as { statuses?: Record<string, { connected: boolean }> };
            if (j.statuses) setConnStatus(j.statuses);
          }
        } catch { /* best-effort */ }
      }
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

      {showBotInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-2xl w-full max-w-[480px] p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-[18px] font-bold text-white">Connect @ppvstarbot 🤖</div>
                <div className="text-[12px] text-[#9ca3af]">Required to send PPV with the native Telegram blur + ⭐ unlock overlay.</div>
              </div>
              <button onClick={() => setShowBotInstructions(false)} className="text-[#6b7280] hover:text-white text-[22px] leading-none mt-0.5 transition-colors">×</button>
            </div>
            <p className="text-[13px] text-[#d1d5db] mb-4">
              To send PPVs the bot must be able to send messages on the creator&apos;s behalf. Each creator does this once on her own Telegram account:
            </p>
            <ol className="text-[13px] text-[#d1d5db] space-y-3 mb-5 list-decimal pl-5">
              <li>
                Open <span className="text-white font-semibold">Settings → My Profile → Edit → Chat Automation</span> (mobile) or <span className="text-white font-semibold">Settings → My Account → Chat Automation</span> (desktop).
              </li>
              <li>
                Enter <span className="font-mono text-[#00AFF0]">@ppvstarbot</span> as the bot username.
              </li>
              <li>
                Enable <span className="text-white font-semibold">Reply to Messages</span>.
              </li>
              <li>Tap Add / Save and head back here — the badge will turn green within a few seconds.</li>
            </ol>
            <div className="bg-[#1f2937]/60 border border-[#2a2d35] rounded-lg px-3 py-2 mb-3 text-[12px] text-[#9ca3af]">
              That&apos;s it — no Premium needed, no other permissions required.
            </div>
            <div className="bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-lg px-3 py-2 mb-4 text-[12px] text-[#fbbf24]">
              ⚠ Important: Telegram only lets the bot push native PPVs into chats where the fan has sent the model a message <span className="font-semibold">after</span> the bot was connected. New fans must reply at least once before the first PPV goes through natively. Older sends keep using the blur + Stars link fallback.
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={async () => {
                  try {
                    const ids = models.map((m) => m.id).join(",");
                    const r = await fetch(`/api/creators/connection-status?modelIds=${ids}`);
                    if (r.ok) {
                      const j = (await r.json()) as { statuses?: Record<string, { connected: boolean }> };
                      if (j.statuses) setConnStatus(j.statuses);
                    }
                  } catch { /* best-effort */ }
                }}
                className="px-4 py-2 bg-[#1f2937] hover:bg-[#2a2d35] text-white rounded-lg text-[13px] font-semibold"
              >
                I&apos;ve connected — refresh
              </button>
              <button
                onClick={() => setShowBotInstructions(false)}
                className="px-4 py-2 bg-[#00AFF0] hover:bg-[#0098D4] text-white rounded-lg text-[13px] font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl shadow-2xl w-full max-w-[440px] p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-[18px] font-semibold text-white">Connect Telegram Account</h2>
                <div className="flex items-center gap-1.5 mt-3">
                  {([1, 2, 3] as const).map((s) => (
                    <div key={s} className="flex items-center gap-1.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${step === s ? "bg-[#00AFF0] text-white" : step > s ? "bg-[#10b981] text-white" : "bg-[#2a2d35] text-[#6b7280]"}`}>{s}</div>
                      {s < 3 && <div className={`w-10 h-0.5 transition-colors ${step > s ? "bg-[#10b981]" : "bg-[#2a2d35]"}`} />}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="text-[#6b7280] hover:text-white text-[22px] leading-none mt-0.5 transition-colors">×</button>
            </div>

            {step === 1 && (
              <div className="space-y-4">
                <p className="text-[13px] text-[#9ca3af]">Enter Telegram API credentials and the creator&apos;s phone number</p>
                <div>
                  <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">API ID</label>
                  <input value={apiId} onChange={(e) => setApiId(e.target.value)} placeholder="12345678"
                    className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#4b5563] focus:border-[#00AFF0] transition-colors" />
                </div>
                <div>
                  <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">API Hash</label>
                  <input value={apiHash} onChange={(e) => setApiHash(e.target.value)} placeholder="a1b2c3d4e5f6a1b2c3d4e5f6"
                    className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#4b5563] focus:border-[#00AFF0] transition-colors" />
                </div>
                <div>
                  <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Phone Number</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1234567890"
                    className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#4b5563] focus:border-[#00AFF0] transition-colors" />
                </div>
                {error && <p className="text-[12px] text-red-400">{error}</p>}
                <button onClick={handleSendCode} disabled={loading || !apiId || !apiHash || !phone}
                  className="w-full py-3 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] text-white rounded-lg font-semibold text-[14px] disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#0098D4] hover:to-[#0098D4] transition-all">
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
                    className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[20px] text-white placeholder:text-[#4b5563] focus:border-[#00AFF0] transition-colors text-center tracking-[0.4em]" />
                </div>
                {error && <p className="text-[12px] text-red-400">{error}</p>}
                <button onClick={handleVerify} disabled={loading || !code}
                  className="w-full py-3 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] text-white rounded-lg font-semibold text-[14px] disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#0098D4] hover:to-[#0098D4] transition-all">
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
                    className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#4b5563] focus:border-[#00AFF0] transition-colors" />
                </div>
                {error && <p className="text-[12px] text-red-400">{error}</p>}
                <button onClick={handleCheckPassword} disabled={loading || !twoFaPassword}
                  className="w-full py-3 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] text-white rounded-lg font-semibold text-[14px] disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#0098D4] hover:to-[#0098D4] transition-all">
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
            <h1 className="text-[24px] font-bold text-white mb-1">Creators 👤</h1>
            <p className="text-[14px] text-[#9ca3af]">Connect and manage your creators&apos; Telegram accounts</p>
          </div>
          <button onClick={() => openModal()} className="px-4 py-2.5 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] rounded-lg text-[13px] font-semibold text-white hover:from-[#0098D4] hover:to-[#0098D4] transition-all shadow-lg shadow-[#00AFF0]/20 flex items-center gap-2">
            <Plus className="w-4 h-4" />Add Creator
          </button>
        </div>

        <div className="bg-gradient-to-br from-[#00AFF0]/10 to-[#00AFF0]/10 border border-[#00AFF0]/30 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-[#00AFF0] to-[#00AFF0] rounded-lg flex items-center justify-center shrink-0">
              <LinkIcon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-[16px] font-semibold text-white mb-2">How to Connect Telegram via API ✈️</h3>
              <div className="text-[13px] text-[#d1d5db] space-y-2.5">
                <p><strong>Step 1.</strong> On a phone or computer, open <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="text-[#00AFF0] hover:underline">my.telegram.org</a> and log in with the <span className="text-white">creator&apos;s</span> phone number. Telegram sends the login code into the Telegram app itself (not by SMS).</p>
                <p><strong>Step 2.</strong> Open <span className="text-white font-medium">&quot;API development tools&quot;</span>.</p>
                <div>
                  <p><strong>Step 3.</strong> If no application exists yet, fill the <span className="text-white font-medium">&quot;Create new application&quot;</span> form:</p>
                  <ul className="mt-1.5 ml-1 space-y-1 text-[#9ca3af]">
                    <li>• <span className="text-white">App title</span> — any name (e.g. the creator&apos;s name).</li>
                    <li>• <span className="text-white">Short name</span> — 5–32 letters/digits (e.g. <code className="text-[#00AFF0]">ppvsapp</code>).</li>
                    <li>• <span className="text-white">URL</span> — optional, leave blank (or put <code className="text-[#00AFF0]">https://t.me</code>).</li>
                    <li>• <span className="text-white">Platform</span> — choose <span className="text-[#00AFF0] font-semibold">Desktop</span>.</li>
                    <li>• <span className="text-white">Description</span> — optional, leave blank.</li>
                  </ul>
                  <p className="mt-1.5">Then click <span className="text-white font-medium">&quot;Create application&quot;</span>.</p>
                </div>
                <p><strong>Step 4.</strong> Copy the <span className="text-[#00AFF0] font-medium">api_id</span> (a number) and <span className="text-[#00AFF0] font-medium">api_hash</span> (a long letters+digits string). Keep them private — they control the account.</p>
                <p><strong>Step 5.</strong> Back here, click <span className="text-white font-medium">&quot;Add Creator&quot;</span> and paste the api_id, api_hash and the creator&apos;s phone number.</p>
                <p><strong>Step 6.</strong> Enter the login code Telegram sends (plus the 2-step password if the account has one) — and you&apos;re connected ✅</p>
              </div>
            </div>
          </div>
        </div>

        {models.length === 0 ? (
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-8">
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-4 bg-[#1f2937] rounded-full flex items-center justify-center text-[32px]">👤</div>
              <h3 className="text-[18px] font-semibold text-white mb-2">No creators connected yet</h3>
              <p className="text-[14px] text-[#9ca3af] mb-6">Add your first creator to start managing their Telegram account</p>
              <button onClick={() => openModal()} className="px-6 py-3 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] rounded-lg text-[14px] font-semibold text-white hover:from-[#0098D4] hover:to-[#0098D4] transition-all shadow-lg shadow-[#00AFF0]/20 flex items-center gap-2 mx-auto">
                <Plus className="w-4 h-4" />Connect your first creator
              </button>
            </div>
          </div>
        ) : (
          <>
          {/* Desktop table (md+) */}
          <div className="hidden md:block bg-[#161a22] border border-[#2a2d35] rounded-lg overflow-x-auto">
            <div className="min-w-[560px]">
            <div className="grid grid-cols-4 gap-4 p-4 border-b border-[#2a2d35] bg-[#1f2937]/30">
              <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold">Creator</div>
              <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold">Username</div>
              <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold">Status</div>
              <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold">Total Earnings</div>
            </div>
            {models.map((model) => (
              <div key={model.id} className="grid grid-cols-4 gap-4 p-4 border-b border-[#2a2d35] last:border-b-0 hover:bg-[#1f2937]/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10 rounded-full shrink-0 overflow-hidden bg-gradient-to-br from-[#00AFF0] to-[#00AFF0]">
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
                        className="px-2.5 py-1 bg-[#00AFF0] hover:bg-[#0098D4] text-white rounded-full text-[11px] font-semibold shrink-0"
                      >
                        Reconnect
                      </button>
                    </>
                  ) : (
                    <span className="px-2.5 py-1 bg-[#10b981]/20 text-[#10b981] rounded-full text-[11px] font-semibold shrink-0">connected</span>
                  )}
                  {connStatus[model.id]?.connected ? (
                    <span title="Bot connected via Telegram Chat Automation" className="px-2.5 py-1 bg-[#10b981]/20 text-[#10b981] rounded-full text-[11px] font-semibold shrink-0">🤖 bot</span>
                  ) : (
                    <button
                      onClick={() => setShowBotInstructions(true)}
                      className="px-2.5 py-1 bg-[#f59e0b]/15 text-[#f59e0b] hover:bg-[#f59e0b]/25 rounded-full text-[11px] font-semibold shrink-0"
                    >
                      🤖 connect bot
                    </button>
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
                <div className="flex items-center text-[15px] font-bold text-[#00AFF0]">
                  ${model.earnings.toFixed(2)}
                </div>
              </div>
            ))}
            </div>
          </div>

          {/* Mobile cards (phones) — stacked so nothing is cut off */}
          <div className="md:hidden space-y-3">
            {models.map((model) => (
              <div key={model.id} className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="relative w-11 h-11 rounded-full shrink-0 overflow-hidden bg-gradient-to-br from-[#00AFF0] to-[#00AFF0]">
                    <span className="absolute inset-0 flex items-center justify-center text-white font-semibold text-[14px]">
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
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-white truncate">{model.name}</div>
                    <div className="text-[12px] text-[#9ca3af] truncate">{model.username ? `@${model.username}` : "—"}</div>
                  </div>
                  <button
                    onClick={() => handleRefresh(model.id)}
                    disabled={refreshingId === model.id}
                    title="Refresh name & avatar from Telegram"
                    className="p-1.5 text-[#6b7280] hover:text-white hover:bg-[#2a2d35] rounded-lg transition-colors disabled:opacity-50 shrink-0"
                  >
                    <span className={`inline-block ${refreshingId === model.id ? "animate-spin" : ""}`}>↻</span>
                  </button>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#2a2d35] gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {model.session_status === "expired" ? (
                      <>
                        <span className="px-2.5 py-1 bg-[#ef4444]/15 text-[#ef4444] rounded-full text-[11px] font-semibold">session expired</span>
                        <button
                          onClick={() => openModal(model.id)}
                          className="px-2.5 py-1 bg-[#00AFF0] hover:bg-[#0098D4] text-white rounded-full text-[11px] font-semibold"
                        >
                          Reconnect
                        </button>
                      </>
                    ) : (
                      <span className="px-2.5 py-1 bg-[#10b981]/20 text-[#10b981] rounded-full text-[11px] font-semibold">connected</span>
                    )}
                    {connStatus[model.id]?.connected ? (
                      <span className="px-2.5 py-1 bg-[#10b981]/20 text-[#10b981] rounded-full text-[11px] font-semibold">🤖 bot</span>
                    ) : (
                      <button
                        onClick={() => setShowBotInstructions(true)}
                        className="px-2.5 py-1 bg-[#f59e0b]/15 text-[#f59e0b] rounded-full text-[11px] font-semibold"
                      >
                        🤖 connect bot
                      </button>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-[#6b7280] uppercase tracking-wider">Earnings</div>
                    <div className="text-[15px] font-bold text-[#00AFF0]">${model.earnings.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>
    </div>
  );
}



type Payout = {
  id: string;
  amount: number;
  address: string | null;
  currency?: string | null;
  network?: string | null;
  status: string;
  created_at: string;
  paid_at: string | null;
};

const MIN_WITHDRAWAL_USD = 30;

function WalletTab() {
  const supabase = createClient();
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");

  const [netAllTime, setNetAllTime] = useState<number | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [nextRelease, setNextRelease] = useState<{ at: string; amount: number } | null>(null);
  const [platformFeeTotal, setPlatformFeeTotal] = useState<number | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [confirmCorrect, setConfirmCorrect] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  // Persistent payout wallet (USDC · Polygon) — card2crypto sends the agency's
  // 90% here. Shares the `address` state with the withdraw form.
  const [savingWallet, setSavingWallet] = useState(false);
  const [walletMsg, setWalletMsg] = useState("");


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
        const [statsRes, payoutsRes] = await Promise.all([
          fetch("/api/dashboard/stats"),
          fetch("/api/payouts"),
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
          if (typeof p.pendingBalance === "number") setPending(p.pendingBalance);
          if (p.nextReleaseAt) setNextRelease({ at: p.nextReleaseAt, amount: Number(p.nextReleaseAmount ?? 0) });
          if (typeof p.netSalesTotal === "number") setNetAllTime(p.netSalesTotal);
          if (typeof p.platformFeeTotal === "number") setPlatformFeeTotal(p.platformFeeTotal);
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
    const amt = Math.floor(Number(amount));
    setMsg("");
    if (!Number.isFinite(amt) || amt < MIN_WITHDRAWAL_USD) {
      setMsg(`Minimum withdrawal is $${MIN_WITHDRAWAL_USD}.`);
      return;
    }
    if (!address.trim()) { setMsg("Enter your withdrawal address."); return; }
    if (!confirmCorrect) { setMsg("Please confirm the withdrawal information."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          address: address.trim(),
          currency: "GRAM",
          network: "TON",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPayouts((prev) => [data.payout as Payout, ...prev]);
      if (typeof data.availableBalance === "number") setAvailable(data.availableBalance);
      setAmount("");
      setConfirmCorrect(false);
      setMsg("✓ Payout requested — reviewed and paid in GRAM on TON.");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveWallet() {
    setWalletMsg("");
    const addr = address.trim();
    if (!/^[EU]Q[A-Za-z0-9_-]{46}$/.test(addr)) {
      setWalletMsg("Enter a valid TON address — starts with EQ or UQ (48 chars).");
      return;
    }
    setSavingWallet(true);
    try {
      const res = await fetch("/api/settings/payout-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setWalletMsg("✓ Wallet saved.");
    } catch (e: unknown) {
      setWalletMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingWallet(false);
    }
  }

  const money = (n: number | null) =>
    n == null ? "…" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const statusCls = (s: string) =>
    s === "paid"
      ? "bg-emerald-500/15 text-emerald-400"
      : s === "rejected"
        ? "bg-red-500/15 text-red-400"
        : "bg-[#f59e0b]/15 text-[#f59e0b]";

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

  return (
    <div className="flex-1 bg-[#0d1117] overflow-y-auto p-4 md:p-6">
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-6">
          <h1 className="text-[24px] font-bold text-white mb-1">Wallet 💰</h1>
          <p className="text-[14px] text-[#9ca3af]">Manage your earnings and withdraw your funds.</p>
        </div>

        {/* Persistent payout wallet — payouts are sent in GRAM on TON. */}
        <div
          className="rounded-2xl p-5 md:p-6 mb-6"
          style={{
            background:
              "linear-gradient(135deg, rgba(0,175,240,0.10) 0%, rgba(0,175,240,0.02) 60%, rgba(255,255,255,0) 100%), #161a22",
            border: "1px solid rgba(0,175,240,0.20)",
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[16px]">💎</span>
            <h2 className="text-[15px] font-semibold text-white">Payout wallet · GRAM on TON</h2>
          </div>
          <p className="text-[12px] text-[#9ca3af] mb-3">
            Where your earnings are sent. Paste your TON wallet address — the @wallet bot inside Telegram works (Settings → Address). Starts with EQ or UQ.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
              className="flex-1 bg-[#0d1117] border border-[#2a2d35] rounded-lg px-3 py-2.5 text-[13px] text-white placeholder-[#6b7280] outline-none focus:border-[#00AFF0] font-mono"
            />
            <button
              onClick={handleSaveWallet}
              disabled={savingWallet}
              className="px-5 py-2.5 bg-[#00AFF0] hover:bg-[#0098D4] disabled:opacity-60 rounded-lg text-[13px] font-semibold text-white shrink-0"
            >
              {savingWallet ? "Saving…" : "Save"}
            </button>
          </div>
          {walletMsg && <div className="text-[12px] mt-2 text-[#9ca3af]">{walletMsg}</div>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ── Left column ── */}
          <div className="space-y-5">
            {/* Available Balance — feature card with brand-colour glow. */}
            <div
              className="rounded-2xl p-6 relative overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, rgba(0,175,240,0.18) 0%, rgba(0,175,240,0.04) 55%, rgba(255,255,255,0) 100%), #161a22",
                border: "1px solid rgba(0,175,240,0.25)",
                boxShadow: "0 18px 50px -20px rgba(0,175,240,0.35)",
              }}
            >
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#9ca3af]">Available Balance</div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-[44px] font-bold text-white leading-none">
                  {available != null ? `$${available.toFixed(2)}` : "…"}
                </span>
                <span className="text-[12px] text-[#9ca3af]">in GRAM on TON</span>
              </div>
              <div className="text-[11px] text-[#6b7280] mt-2">
                Cleared the 25-day hold — ready to withdraw.
              </div>
            </div>

            {/* Pending (in the 25-day clearing hold) */}
            <div className="bg-[#161a22] border border-[#2a2d35] rounded-2xl p-5">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[#9ca3af]">Pending · clearing</div>
              <div className="text-[26px] font-bold text-[#f59e0b] mt-1 leading-none">{pending != null ? money(pending) : "…"}</div>
              <div className="text-[11px] text-[#6b7280] mt-2">
                {nextRelease
                  ? `Next ${money(nextRelease.amount)} releases ${fmtDate(nextRelease.at)}.`
                  : "Telegram holds Stars 21 days; we release each sale 25 days after purchase (a small fraud-review buffer)."}
              </div>
            </div>

            {/* Net Sales Total + Gross Sales Total */}
            <div className="grid grid-cols-2 gap-5">
              <div className="bg-[#161a22] border border-[#2a2d35] rounded-2xl p-5">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#9ca3af]">Net Sales Total</div>
                <div className="text-[26px] font-bold text-white mt-1">{money(netAllTime)}</div>
                <div className="text-[10px] text-[#6b7280] mt-1">After 15% platform fee</div>
              </div>
              <div className="bg-[#161a22] border border-[#2a2d35] rounded-2xl p-5">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#9ca3af]">Gross Sales Total</div>
                <div className="text-[26px] font-bold text-white mt-1">
                  {netAllTime != null && platformFeeTotal != null
                    ? money(netAllTime + platformFeeTotal)
                    : "…"}
                </div>
                <div className="text-[10px] text-[#6b7280] mt-1">Before 15% platform fee</div>
              </div>
            </div>

            {/* Recent Withdrawals */}
            <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl overflow-hidden">
              <div className="px-5 pt-5 pb-3">
                <h2 className="text-[16px] font-semibold text-white">Recent Withdrawals</h2>
              </div>
              {payouts.length === 0 ? (
                <div className="text-[13px] text-[#6b7280] py-6 text-center">No withdrawals yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-left text-[#9ca3af] border-y border-[#2a2d35]">
                        <th className="px-5 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Amount</th>
                        <th className="px-3 py-2 font-medium">Currency</th>
                        <th className="px-3 py-2 font-medium">Network</th>
                        <th className="px-5 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map((p) => (
                        <tr key={p.id} className="border-b border-[#2a2d35] last:border-b-0 text-white">
                          <td className="px-5 py-3 text-[#9ca3af]">
                            {new Date(p.created_at).toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="px-3 py-3 font-medium">{Math.floor(Number(p.amount))}</td>
                          <td className="px-3 py-3">{p.currency ?? "—"}</td>
                          <td className="px-3 py-3">{p.network ?? "—"}</td>
                          <td className="px-5 py-3">
                            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusCls(p.status)}`}>
                              {p.status === "paid" ? "Completed" : p.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ── Right column: Withdraw Funds ── */}
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl p-6">
            <h2 className="text-[18px] font-semibold text-white mb-5">Withdraw Funds</h2>

            <div className="space-y-5">
              {/* Amount */}
              <div>
                <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Amount to Withdraw</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="w-full pl-4 pr-14 py-3 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#00AFF0]"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6b7280] text-[13px] font-medium">USD</span>
                </div>
                <div className="text-[11px] text-[#6b7280] mt-1">
                  ${MIN_WITHDRAWAL_USD} minimum to withdraw. Only whole numbers accepted. Paid in GRAM on TON.
                </div>
              </div>

              {/* Payout is always GRAM on TON — no chooser. */}
              <div>
                <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">You receive</label>
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-[#374151] bg-[#1f2937]">
                  <span className="text-[20px]">💎</span>
                  <span className="text-[14px] font-medium text-white">GRAM on TON</span>
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Withdrawal Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter withdrawal address"
                  className="w-full px-4 py-3 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#00AFF0]"
                />
              </div>

              {/* Confirm checkbox */}
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmCorrect}
                  onChange={(e) => setConfirmCorrect(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#00AFF0]"
                />
                <span className="text-[12px] text-white leading-relaxed">
                  I confirm that the withdrawal information provided is correct.
                  <br />
                  <span className="text-[#9ca3af]">Incorrect information may result in permanent loss of funds.</span>
                </span>
              </label>

              {msg && (
                <div className={`text-[12px] ${msg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>
                  {msg}
                </div>
              )}

              <button
                onClick={handleWithdraw}
                disabled={submitting}
                className="w-full py-3.5 bg-[#00AFF0] hover:bg-[#0098D4] text-white rounded-lg font-semibold text-[14px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Requesting…" : "Withdraw Funds"}
              </button>

              <p className="text-[11px] text-[#6b7280] text-center">
                Requests are reviewed and paid within 7 days, in GRAM on TON.
              </p>
            </div>
          </div>
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
    <div className="fixed inset-0 flex bg-[#0d1117] text-white overflow-hidden" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}>
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
          <img
            src="/landing/logo.png"
            alt="ppvs.io"
            width={28}
            height={28}
            style={{ width: 28, height: 28, objectFit: "contain", borderRadius: "6px" }}
          />
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

  // v3: chatters no longer have a personal dashboard. Redirect to the
  // chatting page directly — if they aren't linked to any agency the
  // /chatter route itself renders the "ask your agency to invite you"
  // placeholder.
  return <ChatterRedirect />;
}

function ChatterRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/chatter"); }, [router]);
  return null;
}
