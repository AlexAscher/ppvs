"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, RefreshCw } from "lucide-react";

type InboxItem = {
  modelId: string;
  modelName: string;
  modelUsername: string | null;
  modelAvatarUrl: string | null;
  peerId: string;
  peerType: "user" | "chat" | "channel";
  peerTitle: string;
  peerUsername: string | null;
  lastMessage: string;
  lastMessageDate: number;
  unreadCount: number;
  accessHash: string | null;
};

type InboxModel = { id: string; name: string; username: string | null; avatar_url: string | null };

function formatTime(unix: number) {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US");
}

function initials(name: string): string {
  return name
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Unified Inbox — every fan conversation across every creator the agency
 * owns, on one screen. Clicking jumps into the chatter UI for that fan
 * (preserved via ?modelId=&peerId= deep link).
 */
export function InboxTab() {
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [models, setModels] = useState<InboxModel[]>([]);
  const [scopeModelId, setScopeModelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/inbox");
      const data = (await res.json()) as { items?: InboxItem[]; models?: InboxModel[]; error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setItems(data.items ?? []);
      setModels(data.models ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load inbox");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (scopeModelId && i.modelId !== scopeModelId) return false;
      if (!q) return true;
      return (
        i.peerTitle.toLowerCase().includes(q) ||
        (i.peerUsername ?? "").toLowerCase().includes(q) ||
        i.modelName.toLowerCase().includes(q) ||
        i.lastMessage.toLowerCase().includes(q)
      );
    });
  }, [items, search, scopeModelId]);

  const totalUnread = (items ?? []).reduce((sum, i) => sum + (i.unreadCount > 0 ? 1 : 0), 0);

  function openChat(item: InboxItem) {
    const qs = new URLSearchParams({ modelId: item.modelId, peerId: item.peerId });
    router.push(`/chatter?${qs.toString()}`);
  }

  return (
    <div className="flex-1 bg-[#0d1117] overflow-y-auto p-4 md:p-6">
      <div className="max-w-[1100px] mx-auto space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[24px] font-bold text-white mb-1">Inbox 📥</h1>
            <p className="text-[14px] text-[#9ca3af]">
              {items === null
                ? "Loading conversations…"
                : `${items.length} conversation${items.length === 1 ? "" : "s"} across ${models.length} creator${models.length === 1 ? "" : "s"}${totalUnread ? ` · ${totalUnread} unread` : ""}`}
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="px-3 py-2 bg-[#161a22] border border-[#2a2d35] rounded-lg text-[12px] font-medium text-white hover:bg-[#1f2937] transition-all flex items-center gap-2 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Creator filter chips + search bar */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setScopeModelId(null)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                !scopeModelId ? "bg-[#6366f1] text-white" : "bg-[#1f2937] text-[#9ca3af] hover:text-white"
              }`}
            >
              All creators
            </button>
            {models.map((m) => (
              <button
                key={m.id}
                onClick={() => setScopeModelId(scopeModelId === m.id ? null : m.id)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                  scopeModelId === m.id ? "bg-[#6366f1] text-white" : "bg-[#1f2937] text-[#9ca3af] hover:text-white"
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7280]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fan name, username, last message…"
              className="w-full pl-10 pr-4 py-2.5 bg-[#161a22] border border-[#2a2d35] rounded-lg text-[13px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1]"
            />
          </div>
        </div>

        {err && (
          <div className="px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-[12px] text-red-400">
            {err}
          </div>
        )}

        {/* List */}
        {items === null ? (
          <div className="text-center py-16 text-[13px] text-[#6b7280]">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-[13px] text-[#6b7280]">
            {items.length === 0
              ? "No conversations yet. Once fans message your creators, they'll appear here."
              : "No matches for your filter."}
          </div>
        ) : (
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg overflow-hidden">
            {filtered.map((it, idx) => (
              <button
                key={`${it.modelId}:${it.peerId}`}
                onClick={() => openChat(it)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#1f2937]/40 transition-colors ${
                  idx > 0 ? "border-t border-[#2a2d35]" : ""
                }`}
              >
                <div className="relative w-11 h-11 rounded-full bg-gradient-to-br from-[#6366f1] to-[#4f46e5] flex items-center justify-center shrink-0 overflow-hidden">
                  <span className="text-white font-semibold text-[14px]">
                    {initials(it.peerTitle) || "?"}
                  </span>
                  {/* Small creator-avatar badge — so the agency knows which
                      creator the fan messaged at a glance. */}
                  <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-[#161a22] bg-[#1f2937] flex items-center justify-center overflow-hidden">
                    {it.modelAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.modelAvatarUrl} alt={it.modelName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[8px] font-bold text-[#9ca3af]">
                        {initials(it.modelName) || "M"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-white truncate">
                      {it.peerUsername ? `@${it.peerUsername}` : it.peerTitle}
                    </span>
                    <span className="text-[10px] text-[#6366f1] bg-[#6366f1]/10 px-1.5 py-0.5 rounded-md font-medium shrink-0">
                      {it.modelName}
                    </span>
                  </div>
                  <div className="text-[12px] text-[#9ca3af] truncate mt-0.5">
                    {it.lastMessage || "—"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-[#6b7280]">{formatTime(it.lastMessageDate)}</div>
                  {it.unreadCount > 0 && (
                    <div className="mt-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-[#6366f1] text-white rounded-full text-[10px] font-bold">
                      {it.unreadCount > 99 ? "99+" : it.unreadCount}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
