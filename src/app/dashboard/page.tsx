"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PPVsTab } from "@/components/ppv/PPVsTab";
import { ChattersTab } from "@/components/chatters/ChattersTab";
import { ChatterDashboardLayout } from "@/components/chatters/ChatterDashboardLayout";
import { createClient } from "@/lib/supabase";
import {
  MessageSquare,
  TrendingUp, DollarSign,
  ChevronDown,
  Plus, Link as LinkIcon, ArrowUpRight, LogOut,
} from "lucide-react";

// ─────────────────────────────────────────────
// AGENCY DASHBOARD
// ─────────────────────────────────────────────

type AgencyTab = "dashboard" | "ppvs" | "models" | "chatters" | "wallet";

const menuItems = [
  { id: "dashboard" as AgencyTab, label: "Dashboard", emoji: "📊" },
  { id: "ppvs" as AgencyTab, label: "PPVs", emoji: "🔒" },
  { id: "models" as AgencyTab, label: "Models", emoji: "👤" },
  { id: "chatters" as AgencyTab, label: "Chatters", emoji: "💬" },
  { id: "wallet" as AgencyTab, label: "Wallet", emoji: "💰" },
];

function AgencySidebar({ activeTab, onTabChange }: { activeTab: AgencyTab; onTabChange: (t: AgencyTab) => void }) {
  const router = useRouter();
  const supabase = createClient();
  const [showLogout, setShowLogout] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userInitials, setUserInitials] = useState("AO");
  const popupRef = useRef<HTMLDivElement>(null);

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
    <div className="w-[240px] bg-[#161a22] border-r border-[#2a2d35] flex flex-col shrink-0">
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
  );
}

const dashStats = [
  { label: "Net Total Today", value: "$1,243", emoji: "💵" },
  { label: "Net Total This Week", value: "$8,920", emoji: "📈" },
  { label: "Net Total This Month", value: "$34,567", emoji: "💰" },
  { label: "Net Total All Time", value: "$124,890", emoji: "🏆" },
  { label: "Available Balance", value: "$12,340", emoji: "💳" },
  { label: "PPVs Opened", value: "1,847", emoji: "👁️" },
  { label: "Avg Order Value", value: "$42.50", emoji: "🛒" },
  { label: "Paying Fans", value: "432", emoji: "👥" },
];

const dashModels = [
  { id: "all", name: "All Models" },
  { id: "sofia", name: "Sofia C" },
  { id: "mia", name: "Mia R" },
  { id: "anna", name: "Anna K" },
  { id: "jade", name: "Jade V" },
];

const chartData = [
  { date: "Jan 1", value: 2400, label: "$2,400" },
  { date: "Jan 2", value: 3200, label: "$3,200" },
  { date: "Jan 3", value: 2800, label: "$2,800" },
  { date: "Jan 4", value: 3800, label: "$3,800" },
  { date: "Jan 5", value: 3200, label: "$3,200" },
  { date: "Jan 6", value: 4200, label: "$4,200" },
  { date: "Jan 7", value: 4800, label: "$4,800" },
  { date: "Jan 8", value: 3600, label: "$3,600" },
  { date: "Jan 9", value: 4400, label: "$4,400" },
  { date: "Jan 10", value: 4600, label: "$4,600" },
  { date: "Jan 11", value: 3900, label: "$3,900" },
  { date: "Jan 12", value: 4300, label: "$4,300" },
];

const recentActivities = [
  { id: "1", type: "PPV", fan: "@mark_johnson", amount: "$45", chatter: "Sarah J", time: "2 min ago" },
  { id: "2", type: "Tip", fan: "@david_lee", amount: "$20", chatter: "Emma K", time: "5 min ago" },
  { id: "3", type: "Bundle", fan: "@alex_smith", amount: "$120", chatter: "Sarah J", time: "12 min ago" },
  { id: "4", type: "PPV", fan: "@ryan_taylor", amount: "$35", chatter: "Mia L", time: "18 min ago" },
  { id: "5", type: "Tip", fan: "@chris_wilson", amount: "$50", chatter: "Sarah J", time: "23 min ago" },
];

const topFans = [
  { username: "@mike_brown", spent: "$2,890", avatar: "MB", rank: 1 },
  { username: "@james_davis", spent: "$2,450", avatar: "JD", rank: 2 },
  { username: "@alex_smith", spent: "$1,980", avatar: "AS", rank: 3 },
];

function DashboardTab() {
  const [timeframe, setTimeframe] = useState("7d");
  const [selectedModel, setSelectedModel] = useState("all");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const maxValue = Math.max(...chartData.map((d) => d.value));

  return (
    <div className="flex-1 bg-[#0d1117] overflow-y-auto p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[24px] font-bold text-white mb-1">Dashboard 📊</h1>
            <p className="text-[14px] text-[#9ca3af]">Overview of your agency performance</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className="px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] font-medium text-white hover:bg-[#374151] transition-all flex items-center gap-2 min-w-[180px] justify-between"
            >
              <span>{dashModels.find((m) => m.id === selectedModel)?.name}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
            {showModelDropdown && (
              <div className="absolute top-full right-0 mt-2 w-full bg-[#1f2937] border border-[#374151] rounded-lg shadow-xl overflow-hidden z-10">
                {dashModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => { setSelectedModel(model.id); setShowModelDropdown(false); }}
                    className={`w-full px-4 py-2.5 text-[13px] text-left hover:bg-[#374151] transition-colors ${selectedModel === model.id ? "bg-[#374151] text-[#6366f1]" : "text-white"}`}
                  >
                    {model.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {dashStats.map((stat, i) => (
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

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 bg-[#161a22] border border-[#2a2d35] rounded-lg p-5">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[16px] font-semibold text-white">Total Net Sales 📈</h2>
              <div className="flex gap-2">
                {["1d", "7d", "30d", "all"].map((period) => (
                  <button
                    key={period}
                    onClick={() => setTimeframe(period)}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${timeframe === period ? "bg-[#6366f1] text-white" : "bg-[#1f2937] text-[#9ca3af] hover:text-white"}`}
                  >
                    {period === "all" ? "All Time" : period.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-[10px] text-[#6b7280] pr-2">
                <span>$5k</span><span>$4k</span><span>$3k</span><span>$2k</span><span>$1k</span><span>$0</span>
              </div>
              <div className="ml-10 mr-2">
                <div className="relative h-[180px]">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="absolute w-full border-t border-[#2a2d35]" style={{ top: `${i * 20}%` }} />
                  ))}
                  <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d={`M 0,${180 - (chartData[0].value / maxValue) * 180} ${chartData.map((d, i) => `L ${(i / (chartData.length - 1)) * 100}%,${180 - (d.value / maxValue) * 180}`).join(" ")} L 100%,180 L 0,180 Z`}
                      fill="url(#lineGradient)"
                    />
                    <polyline
                      points={chartData.map((d, i) => `${(i / (chartData.length - 1)) * 100}%,${180 - (d.value / maxValue) * 180}`).join(" ")}
                      fill="none" stroke="#6366f1" strokeWidth="2"
                    />
                  </svg>
                  {chartData.map((point, i) => (
                    <div
                      key={i}
                      className="absolute"
                      style={{ left: `${(i / (chartData.length - 1)) * 100}%`, top: `${180 - (point.value / maxValue) * 180}px`, transform: "translate(-50%, -50%)" }}
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
                <div className="flex justify-between mt-2 text-[10px] text-[#6b7280]">
                  {chartData.map((point, i) => (
                    <span key={i} className={i % 2 === 0 ? "" : "opacity-0"}>{point.date}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-5">
            <h2 className="text-[16px] font-semibold text-white mb-4">Top Chatter 👑</h2>
            <div className="text-center space-y-3">
              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-full flex items-center justify-center text-white font-bold text-[24px]">SJ</div>
              <div>
                <div className="text-[18px] font-bold text-white">Sarah J</div>
                <div className="text-[13px] text-[#9ca3af]">@sarah_chatter</div>
              </div>
              <div className="pt-3 border-t border-[#2a2d35]">
                <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider mb-1">Total Net Sales</div>
                <div className="text-[28px] font-bold text-[#6366f1]">$48,920</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 bg-[#161a22] border border-[#2a2d35] rounded-lg p-5 flex flex-col">
            <h2 className="text-[16px] font-semibold text-white mb-4">Recent Activities 🔔</h2>
            <div className="flex-1 overflow-y-auto max-h-[300px] space-y-2 pr-2 custom-scrollbar">
              {[...recentActivities, ...recentActivities].map((activity, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-[#1f2937]/30 rounded-lg hover:bg-[#1f2937]/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${activity.type === "PPV" ? "bg-[#6366f1]/20 text-[#6366f1]" : activity.type === "Tip" ? "bg-[#10b981]/20 text-[#10b981]" : "bg-[#f59e0b]/20 text-[#f59e0b]"}`}>
                      {activity.type}
                    </div>
                    <div>
                      <div className="text-[13px] text-white font-medium">{activity.fan}</div>
                      <div className="text-[11px] text-[#6b7280]">by {activity.chatter}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[14px] font-bold text-[#6366f1]">{activity.amount}</div>
                    <div className="text-[10px] text-[#6b7280]">{activity.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-5 flex flex-col">
            <h2 className="text-[16px] font-semibold text-white mb-4">Top Fans 🏆</h2>
            <div className="flex-1 overflow-y-auto max-h-[300px] space-y-3 pr-2 custom-scrollbar">
              {[...topFans, ...topFans].map((fan, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-[#1f2937]/30 rounded-lg hover:bg-[#1f2937]/50 transition-colors">
                  <div className="w-10 h-10 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-full flex items-center justify-center text-white font-semibold text-[13px] relative">
                    {fan.avatar}
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#f59e0b] rounded-full flex items-center justify-center text-[10px] font-bold">{fan.rank}</div>
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-white">{fan.username}</div>
                    <div className="text-[11px] text-[#6b7280]">Total spent</div>
                  </div>
                  <div className="text-[15px] font-bold text-[#6366f1]">{fan.spent}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type Model = { id: string; name: string; username: string | null; earnings: number; avatar_url: string | null };

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

  useEffect(() => {
    supabase
      .from("models")
      .select("id, name, username, earnings, avatar_url")
      .then(({ data }) => { if (data) setModels(data); });
  }, []);

  function openModal() {
    setStep(1);
    setApiId(""); setApiHash(""); setPhone(""); setCode(""); setTwoFaPassword(""); setError("");
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
        body: JSON.stringify({ apiId, apiHash, phone, code, phoneCodeHash, tempSession }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to verify");
      if (data.twoFaNeeded) {
        setTempSession(data.tempSession);
        setStep(3);
        return;
      }
      setModels((prev) => [...prev, data.model]);
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
        body: JSON.stringify({ apiId, apiHash, password: twoFaPassword, tempSession }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to check password");
      setModels((prev) => [...prev, data.model]);
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
    <div className="flex-1 bg-[#0d1117] overflow-y-auto p-6">

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
          <button onClick={openModal} className="px-4 py-2.5 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] rounded-lg text-[13px] font-semibold text-white hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20 flex items-center gap-2">
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
              <button onClick={openModal} className="px-6 py-3 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] rounded-lg text-[14px] font-semibold text-white hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20 flex items-center gap-2 mx-auto">
                <Plus className="w-4 h-4" />Connect your first model
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg overflow-hidden">
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
                  <span className="px-2.5 py-1 bg-[#10b981]/20 text-[#10b981] rounded-full text-[11px] font-semibold shrink-0">connected</span>
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

function WalletTab() {
  const [selectedCrypto, setSelectedCrypto] = useState("usdt");
  const [selectedNetwork, setSelectedNetwork] = useState("TRC20");
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");

  return (
    <div className="flex-1 bg-[#0d1117] overflow-y-auto p-6">
      <div className="max-w-[1000px] mx-auto space-y-6">
        <div>
          <h1 className="text-[24px] font-bold text-white mb-1">Wallet 💰</h1>
          <p className="text-[14px] text-[#9ca3af]">Manage your earnings and withdrawals</p>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-lg p-6 shadow-lg shadow-[#6366f1]/20">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-white/80" />
              <span className="text-[13px] text-white/80 uppercase tracking-wider font-medium">Total Net Sales</span>
            </div>
            <div className="text-[36px] font-bold text-white">$124,890</div>
            <div className="flex items-center gap-2 mt-2 text-[13px] text-white/80">
              <TrendingUp className="w-4 h-4" /><span>+12.5% from last month</span>
            </div>
          </div>
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-[#9ca3af]" />
              <span className="text-[13px] text-[#9ca3af] uppercase tracking-wider font-medium">Available Balance</span>
            </div>
            <div className="text-[36px] font-bold text-white">$12,340</div>
            <div className="text-[13px] text-[#6b7280] mt-2">Ready for withdrawal</div>
          </div>
        </div>
        <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-6">
          <h2 className="text-[18px] font-semibold text-white mb-6 flex items-center gap-2">
            Withdraw Funds <ArrowUpRight className="w-5 h-5 text-[#6366f1]" />
          </h2>
          <div className="space-y-5">
            <div>
              <label className="text-[13px] text-[#9ca3af] font-medium mb-2 block">Select Cryptocurrency</label>
              <div className="grid grid-cols-4 gap-3">
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
              <div className="flex gap-3">
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
              <div className="text-[11px] text-[#6b7280] mt-1">Available: $12,340</div>
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
            <button className="w-full py-3.5 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[14px] hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20">
              Verify &amp; Withdraw
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgencyDashboard() {
  const [activeTab, setActiveTab] = useState<AgencyTab>("dashboard");
  return (
    <div className="h-screen w-screen flex bg-[#0d1117] text-white overflow-hidden" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}>
      <AgencySidebar activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "dashboard" && <DashboardTab />}
      {activeTab === "ppvs" && <PPVsTab />}
      {activeTab === "models" && <ModelsTab />}
      {activeTab === "chatters" && <ChattersTab />}
      {activeTab === "wallet" && <WalletTab />}
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

  if (role === null) return null;

  if (role === "agency") return <AgencyDashboard />;

  return <ChatterDashboardLayout />;
}
