"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, LogOut, DollarSign, Mail, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Invitation, ChatterModel } from "./types";
import { SettingsTab } from "@/components/settings/SettingsTab";
import { FeedPanel } from "@/components/feed/FeedPanel";

type ChatterTab = "dashboard" | "feed" | "settings";

const menuItems = [
  { id: "dashboard" as ChatterTab, label: "Dashboard", emoji: "📊" },
  { id: "feed" as ChatterTab, label: "Agency Feed", emoji: "📰" },
  { id: "settings" as ChatterTab, label: "Settings", emoji: "⚙️" },
];

function ChatterSidebar({
  activeTab,
  onTabChange,
}: {
  activeTab: ChatterTab;
  onTabChange: (t: ChatterTab) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [showLogout, setShowLogout] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userInitials, setUserInitials] = useState("CH");
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
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setShowLogout(false);
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
        <span className="text-[12px] px-2 py-0.5 bg-[#10b981]/10 text-[#10b981] rounded-full font-medium">Chatter</span>
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
          <span className="text-[13px] font-medium">Go to Chatting</span>
        </button>
      </div>

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
          className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${
            showLogout ? "bg-[#1f2937]" : "hover:bg-[#1f2937]"
          }`}
        >
          <div className="w-9 h-9 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-full flex items-center justify-center text-white font-semibold text-[13px] shrink-0">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-white truncate">Chatter</div>
            <div className="text-[11px] text-[#6b7280] truncate">{userEmail || "—"}</div>
          </div>
        </button>
      </div>
    </div>
  );
}

type AgencyInfo = { name: string; model: ChatterModel | null };

function InvitationCard({
  invitation,
  onAction,
}: {
  invitation: Invitation;
  onAction: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function act(action: "accept" | "decline") {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/chatters/invitations/${invitation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      onAction();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    }
  }

  return (
    <div className="bg-gradient-to-br from-[#6366f1]/10 to-[#4f46e5]/10 border border-[#6366f1]/30 rounded-lg p-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-lg flex items-center justify-center shrink-0">
          <Mail className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[16px] font-semibold text-white mb-1">New invitation 📩</h3>
          <p className="text-[13px] text-[#d1d5db] mb-4">
            <span className="font-semibold text-white">{invitation.agency_name}</span> invites you to join as a chatter
            {invitation.model && (
              <>
                {" "}for model <span className="text-[#6366f1] font-semibold">{invitation.model.name}</span>
              </>
            )}.
          </p>
          {error && <p className="text-[12px] text-red-400 mb-2">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => act("accept")}
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] rounded-lg text-[13px] font-semibold text-white hover:from-[#059669] hover:to-[#047857] transition-all flex items-center gap-2 disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              Accept
            </button>
            <button
              onClick={() => act("decline")}
              disabled={loading}
              className="px-4 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] font-semibold text-white hover:bg-[#374151] transition-all flex items-center gap-2 disabled:opacity-60"
            >
              <X className="w-4 h-4" />
              Decline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatterDashboardTab() {
  const supabase = createClient();
  const [agency, setAgency] = useState<AgencyInfo | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: ac } = await supabase
      .from("agency_chatters")
      .select("id, model_id, invitations:invitation_id(agency_name)")
      .eq("chatter_id", user.id)
      .maybeSingle();

    if (ac) {
      const row = ac as unknown as { model_id: string | null; invitations: { agency_name: string } | null };
      let model: ChatterModel | null = null;
      if (row.model_id) {
        const { data: m } = await supabase
          .from("models")
          .select("id, name, username, avatar_url")
          .eq("id", row.model_id)
          .maybeSingle();
        if (m) model = m as ChatterModel;
      }
      setAgency({ name: row.invitations?.agency_name ?? "Agency", model });
    } else {
      setAgency(null);
    }

    if (user.email) {
      const { data: inv } = await supabase
        .from("invitations")
        .select("id, agency_id, agency_name, chatter_email, chatter_id, model_id, status, created_at")
        .eq("status", "pending")
        .ilike("chatter_email", user.email);
      const list: Invitation[] = (inv ?? []).map((row) => ({
        ...(row as Omit<Invitation, "model">),
        model: null,
      }));
      const modelIds = list.map((i) => i.model_id).filter((x): x is string => Boolean(x));
      if (modelIds.length > 0) {
        const { data: ms } = await supabase
          .from("models")
          .select("id, name, username, avatar_url")
          .in("id", modelIds);
        const map = new Map<string, ChatterModel>((ms ?? []).map((m) => [m.id, m as ChatterModel]));
        list.forEach((i) => { i.model = i.model_id ? map.get(i.model_id) ?? null : null; });
      }
      setInvitations(list);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const stats = [
    { label: "Net Total Today", value: "$0", emoji: "💵" },
    { label: "Net Total This Week", value: "$0", emoji: "📈" },
    { label: "Net Total This Month", value: "$0", emoji: "💰" },
    { label: "Net Total All Time", value: "$0", emoji: "🏆" },
    { label: "Conversion Rate", value: "—", emoji: "🎯" },
    { label: "PPVs Opened", value: "0", emoji: "👁️" },
    { label: "Avg Order Value", value: "$0", emoji: "🛒" },
    { label: "Paying Fans", value: "0", emoji: "👥" },
  ];

  return (
    <div className="flex-1 bg-[#0d1117] overflow-y-auto p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div>
          <h1 className="text-[24px] font-bold text-white mb-1">Dashboard 📊</h1>
          <p className="text-[14px] text-[#9ca3af]">Your activity overview</p>
        </div>

        {invitations.length > 0 && (
          <div className="space-y-3">
            {invitations.map((inv) => (
              <InvitationCard key={inv.id} invitation={inv} onAction={load} />
            ))}
          </div>
        )}

        {agency ? (
          <div className="bg-gradient-to-br from-[#10b981]/10 to-[#059669]/10 border border-[#10b981]/30 rounded-lg p-4">
            <div className="flex items-center gap-4">
              <div className="text-[28px]">🏢</div>
              <div className="flex-1">
                <div className="text-[13px] text-[#9ca3af]">Working for</div>
                <div className="text-[16px] font-semibold text-white">
                  {agency.name}
                  {agency.model && (
                    <>
                      <span className="text-[#6b7280] mx-2">·</span>
                      <span className="text-[#6366f1]">{agency.model.name}</span>
                    </>
                  )}
                </div>
              </div>
              <span className="px-2.5 py-1 bg-[#10b981]/20 text-[#10b981] rounded-full text-[11px] font-semibold">Active</span>
            </div>
          </div>
        ) : invitations.length === 0 ? (
          <div className="bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-lg p-4">
            <div className="flex items-center gap-3 text-[13px] text-[#f59e0b]">
              <span className="text-[20px]">⚠️</span>
              You&apos;re not connected to an agency. Share your email with an agency owner to receive an invitation.
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-4 gap-4">
          {stats.map((stat, i) => (
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
          <div className="col-span-2 bg-[#161a22] border border-[#2a2d35] rounded-lg p-5 flex flex-col">
            <h2 className="text-[16px] font-semibold text-white mb-4">Recent Activities 🔔</h2>
            <div className="flex-1 flex items-center justify-center py-10 text-[#6b7280] text-[13px]">
              No recent activity yet
            </div>
          </div>
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-5 flex flex-col">
            <h2 className="text-[16px] font-semibold text-white mb-4">Top Fans 🏆</h2>
            <div className="flex-1 flex items-center justify-center py-10 text-[#6b7280] text-[13px]">
              No fans yet
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatterFeedTab() {
  return (
    <div className="flex-1 bg-[#0d1117] overflow-y-auto p-6">
      <div className="max-w-[820px] mx-auto space-y-5">
        <div>
          <h1 className="text-[24px] font-bold text-white mb-1">Agency Feed 📰</h1>
          <p className="text-[14px] text-[#9ca3af]">Latest announcements from your agency.</p>
        </div>
        <FeedPanel />
      </div>
    </div>
  );
}

export function ChatterDashboardLayout() {
  const [activeTab, setActiveTab] = useState<ChatterTab>("dashboard");
  return (
    <div className="h-screen w-screen flex bg-[#0d1117] text-white overflow-hidden" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}>
      <ChatterSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "dashboard" && <ChatterDashboardTab />}
      {activeTab === "feed" && <ChatterFeedTab />}
      {activeTab === "settings" && <SettingsTab role="chatter" />}
    </div>
  );
}
