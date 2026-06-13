"use client";

import { useState, useEffect } from "react";
import { X, Trash2, ChevronDown } from "lucide-react";
import { AgencyChatter, ChatterModel } from "./types";

type ChatterStatsPayload = {
  netToday: number;
  netWeek: number;
  netMonth: number;
  netAllTime: number;
  payingFans: number;
  avgOrder: number;
  ppvsOpened: number;
  conversion: number;
};

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  if (n >= 10000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
}

type Props = {
  chatter: AgencyChatter;
  models: ChatterModel[];
  onClose: () => void;
  onReassigned: (modelId: string | null) => void;
  onDeleted: () => void;
};

export function ChatterStatsModal({ chatter, models, onClose, onReassigned, onDeleted }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelId, setModelId] = useState<string | null>(chatter.model_id);
  const [stats, setStats] = useState<ChatterStatsPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/chatter/stats?chatterId=${chatter.chatter_id}`);
        if (!r.ok) return;
        const data = (await r.json()) as ChatterStatsPayload;
        if (!cancelled) setStats(data);
      } catch { /* best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [chatter.chatter_id]);

  async function handleReassign(newModelId: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/chatters/${chatter.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: newModelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setModelId(newModelId);
      onReassigned(newModelId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
      setShowModelDropdown(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/chatters/${chatter.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      onDeleted();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    }
  }

  const initials = chatter.chatter_email
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  const selectedModel = models.find((m) => m.id === modelId);

  // 8 stat cards — same data as the chatter's own dashboard. Loaded from
  // /api/chatter/stats?chatterId=… (the route accepts a chatterId param
  // for agencies querying their own chatters).
  const statCards = stats
    ? [
        { label: "Net Today", value: fmtMoney(stats.netToday), emoji: "💵" },
        { label: "Net This Week", value: fmtMoney(stats.netWeek), emoji: "📈" },
        { label: "Net This Month", value: fmtMoney(stats.netMonth), emoji: "💰" },
        { label: "Net All Time", value: fmtMoney(stats.netAllTime), emoji: "🏆" },
        {
          label: "Conversion",
          value: stats.conversion > 0 ? `${(stats.conversion * 100).toFixed(1)}%` : "—",
          emoji: "🎯",
        },
        { label: "PPVs Opened", value: String(stats.ppvsOpened), emoji: "👁️" },
        { label: "Avg Order", value: fmtMoney(stats.avgOrder), emoji: "🛒" },
        { label: "Paying Fans", value: String(stats.payingFans), emoji: "👥" },
      ]
    : Array.from({ length: 8 }, () => ({ label: "Loading", value: "…", emoji: "•" }));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl shadow-2xl w-full max-w-[560px] p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-full flex items-center justify-center text-white font-semibold text-[18px]">
              {initials}
            </div>
            <div>
              <div className="text-[16px] font-semibold text-white">{chatter.chatter_email}</div>
              <div className="text-[12px] text-[#9ca3af]">
                Joined {new Date(chatter.joined_at).toLocaleDateString("en-US")}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Assigned Creator</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowModelDropdown((v) => !v)}
                disabled={loading}
                className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white text-left flex items-center justify-between hover:border-[#4b5563] transition-colors disabled:opacity-60"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {selectedModel?.avatar_url ? (
                    <img src={selectedModel.avatar_url} alt={selectedModel.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#6366f1] to-[#4f46e5] shrink-0" />
                  )}
                  <span className="truncate">{selectedModel?.name ?? "No model assigned"}</span>
                </div>
                <ChevronDown className="w-4 h-4 text-[#6b7280] shrink-0" />
              </button>
              {showModelDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#1f2937] border border-[#374151] rounded-lg shadow-xl overflow-hidden z-10 max-h-[200px] overflow-y-auto">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleReassign(m.id)}
                      className={`w-full px-4 py-2.5 text-left text-[13px] hover:bg-[#374151] transition-colors flex items-center gap-2.5 ${modelId === m.id ? "bg-[#374151] text-[#6366f1]" : "text-white"}`}
                    >
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt={m.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#6366f1] to-[#4f46e5] shrink-0" />
                      )}
                      <span className="truncate">{m.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="text-[12px] text-[#9ca3af] font-medium mb-2">Statistics</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-[260px] overflow-y-auto pr-1">
              {statCards.map((s, i) => (
                <div key={i} className="bg-[#1f2937]/40 border border-[#374151] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-[#9ca3af] uppercase tracking-wider">{s.label}</span>
                    <span className="text-[14px] leading-none">{s.emoji}</span>
                  </div>
                  <div className="text-[18px] font-bold text-white">{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-[12px] text-red-400">{error}</p>}

          <div className="border-t border-[#2a2d35] pt-4">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={loading}
                className="w-full py-2.5 bg-transparent border border-red-500/30 text-red-400 rounded-lg font-medium text-[13px] hover:bg-red-500/10 transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Remove from team
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-[12px] text-[#d1d5db] text-center">Remove this chatter from your team?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    disabled={loading}
                    className="py-2.5 bg-[#1f2937] border border-[#374151] text-white rounded-lg font-medium text-[13px] hover:bg-[#374151] transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={loading}
                    className="py-2.5 bg-red-500 text-white rounded-lg font-medium text-[13px] hover:bg-red-600 transition-all disabled:opacity-60"
                  >
                    {loading ? "Removing…" : "Yes, remove"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
