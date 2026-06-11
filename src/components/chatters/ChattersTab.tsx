"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Mail, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { InviteChatterModal } from "./InviteChatterModal";
import { ChatterStatsModal } from "./ChatterStatsModal";
import { AgencyChatter, ChatterModel, Invitation } from "./types";

export function ChattersTab() {
  const supabase = createClient();
  const [models, setModels] = useState<ChatterModel[]>([]);
  const [chatters, setChatters] = useState<AgencyChatter[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Invitation[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [selectedChatter, setSelectedChatter] = useState<AgencyChatter | null>(null);
  const [loading, setLoading] = useState(true);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  // Presence: chatter_id -> last_seen ISO. Polled every 30s.
  const [presence, setPresence] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadPresence = () => {
      void fetch("/api/presence")
        .then((r) => (r.ok ? r.json() : { presence: {} }))
        .then((d: { presence?: Record<string, string> }) => setPresence(d.presence ?? {}))
        .catch(() => {});
    };
    loadPresence();
    const iv = setInterval(loadPresence, 30_000);
    return () => clearInterval(iv);
  }, []);

  function presenceLabel(chatterId: string): { online: boolean; text: string } {
    const iso = presence[chatterId];
    if (!iso) return { online: false, text: "offline" };
    const ago = Date.now() - new Date(iso).getTime();
    if (ago < 90_000) return { online: true, text: "online" };
    const mins = Math.floor(ago / 60_000);
    if (mins < 60) return { online: false, text: `last active ${mins}m ago` };
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return { online: false, text: `last active ${hrs}h ago` };
    return { online: false, text: `last active ${Math.floor(hrs / 24)}d ago` };
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: m } = await supabase
      .from("models")
      .select("id, name, username, avatar_url")
      .eq("agency_user_id", user.id);
    const modelList: ChatterModel[] = (m ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username,
      avatar_url: row.avatar_url,
    }));
    setModels(modelList);

    const modelMap = new Map(modelList.map((mm) => [mm.id, mm]));

    const { data: ac } = await supabase
      .from("agency_chatters")
      .select("id, chatter_id, model_id, joined_at, invitation_id, invitations:invitation_id(chatter_email)")
      .eq("agency_id", user.id);

    const list: AgencyChatter[] = ((ac ?? []) as unknown as {
      id: string;
      chatter_id: string;
      model_id: string | null;
      joined_at: string;
      invitations: { chatter_email: string } | null;
    }[]).map((row) => ({
      id: row.id,
      chatter_id: row.chatter_id,
      chatter_email: row.invitations?.chatter_email ?? "(unknown)",
      model_id: row.model_id,
      model: row.model_id ? modelMap.get(row.model_id) ?? null : null,
      joined_at: row.joined_at,
    }));
    setChatters(list);

    const { data: inv } = await supabase
      .from("invitations")
      .select("id, agency_id, agency_name, chatter_email, chatter_id, model_id, status, created_at")
      .eq("agency_id", user.id)
      .eq("status", "pending");
    const pending: Invitation[] = (inv ?? []).map((row) => ({
      ...(row as Invitation),
      model: row.model_id ? modelMap.get(row.model_id) ?? null : null,
    }));
    setPendingInvites(pending);

    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function handleReassign(chatterId: string, newModelId: string) {
    setOpenDropdownId(null);
    const res = await fetch(`/api/chatters/${chatterId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId: newModelId }),
    });
    if (!res.ok) return;
    const modelMap = new Map(models.map((m) => [m.id, m]));
    setChatters((prev) =>
      prev.map((c) =>
        c.id === chatterId
          ? { ...c, model_id: newModelId, model: modelMap.get(newModelId) ?? null }
          : c,
      ),
    );
  }

  async function handleCancelInvite(inviteId: string) {
    const { error } = await supabase.from("invitations").delete().eq("id", inviteId);
    if (!error) setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
  }

  return (
    <div className="flex-1 bg-[#0d1117] overflow-y-auto p-4 md:p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[24px] font-bold text-white mb-1">Chatters 💬</h1>
            <p className="text-[14px] text-[#9ca3af]">Invite and manage your team of chatters</p>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            disabled={models.length === 0}
            className="px-4 py-2.5 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] rounded-lg text-[13px] font-semibold text-white hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />Add Chatter
          </button>
        </div>

        {models.length === 0 && (
          <div className="bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-lg p-4">
            <div className="flex items-center gap-3 text-[13px] text-[#f59e0b]">
              <span className="text-[20px]">⚠️</span>
              Add at least one model before inviting chatters.
            </div>
          </div>
        )}

        {pendingInvites.length > 0 && (
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2a2d35] flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-white">Pending Invitations</h2>
              <span className="text-[11px] text-[#9ca3af]">{pendingInvites.length}</span>
            </div>
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="px-4 py-3 border-b border-[#2a2d35] last:border-b-0 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <Mail className="w-4 h-4 text-[#6b7280] shrink-0" />
                  <span className="text-[13px] text-white truncate">{inv.chatter_email}</span>
                  <span className="text-[11px] text-[#6b7280] shrink-0">→ {inv.model?.name ?? "—"}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="px-2.5 py-1 bg-[#f59e0b]/20 text-[#f59e0b] rounded-full text-[10px] font-semibold uppercase tracking-wider">Pending</span>
                  <button
                    onClick={() => handleCancelInvite(inv.id)}
                    className="text-[11px] text-[#6b7280] hover:text-red-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-12 text-center text-[#9ca3af] text-[13px]">Loading…</div>
        ) : chatters.length === 0 ? (
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-8">
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-4 bg-[#1f2937] rounded-full flex items-center justify-center text-[32px]">💬</div>
              <h3 className="text-[18px] font-semibold text-white mb-2">No chatters yet</h3>
              <p className="text-[14px] text-[#9ca3af] mb-6">Invite chatters to join your agency</p>
              <button
                onClick={() => setShowInvite(true)}
                disabled={models.length === 0}
                className="px-6 py-3 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] rounded-lg text-[14px] font-semibold text-white hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20 flex items-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />Invite your first chatter
              </button>
            </div>
          </div>
        ) : (
          <>
          {/* Desktop table (md+) */}
          <div className="hidden md:block bg-[#161a22] border border-[#2a2d35] rounded-lg overflow-x-auto">
            <div className="min-w-[640px]">
            <div className="grid grid-cols-[1fr_240px_120px] gap-4 px-4 py-3 border-b border-[#2a2d35] bg-[#1f2937]/30 rounded-t-lg">
              <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold">Chatter</div>
              <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold">Creator</div>
              <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold">Status</div>
            </div>
            {chatters.map((c) => {
              const initials = c.chatter_email
                .split(/[\s@.]+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0])
                .join("")
                .toUpperCase();
              return (
                <div
                  key={c.id}
                  className="grid grid-cols-[1fr_240px_120px] gap-4 px-4 py-3 border-b border-[#2a2d35] last:border-b-0 hover:bg-[#1f2937]/20 transition-colors cursor-pointer"
                  onClick={() => setSelectedChatter(c)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-full flex items-center justify-center text-white font-semibold text-[13px]">
                        {initials}
                      </div>
                      <span
                        className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#161a22]"
                        style={{ backgroundColor: presenceLabel(c.chatter_id).online ? "#10b981" : "#6b7280" }}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium text-white truncate">{c.chatter_email}</div>
                      <div className="text-[11px]">
                        {(() => {
                          const p = presenceLabel(c.chatter_id);
                          return (
                            <span className={p.online ? "text-emerald-400" : "text-[#6b7280]"}>{p.text}</span>
                          );
                        })()}
                        <span className="text-[#6b7280]"> · joined {new Date(c.joined_at).toLocaleDateString("en-US")}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                    <div className="relative w-full">
                      <button
                        onClick={() => setOpenDropdownId(openDropdownId === c.id ? null : c.id)}
                        className="w-full px-3 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] text-white hover:border-[#4b5563] transition-colors flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {c.model?.avatar_url ? (
                            <img src={c.model.avatar_url} alt={c.model.name} className="w-5 h-5 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#6366f1] to-[#4f46e5] shrink-0" />
                          )}
                          <span className="truncate">{c.model?.name ?? "—"}</span>
                        </div>
                        <ChevronDown className="w-3.5 h-3.5 text-[#6b7280] shrink-0" />
                      </button>
                      {openDropdownId === c.id && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1f2937] border border-[#374151] rounded-lg shadow-xl overflow-hidden z-20 max-h-[220px] overflow-y-auto">
                          {models.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => handleReassign(c.id, m.id)}
                              className={`w-full px-3 py-2 text-left text-[12px] hover:bg-[#374151] transition-colors flex items-center gap-2 ${c.model_id === m.id ? "bg-[#374151] text-[#6366f1]" : "text-white"}`}
                            >
                              {m.avatar_url ? (
                                <img src={m.avatar_url} alt={m.name} className="w-5 h-5 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#6366f1] to-[#4f46e5] shrink-0" />
                              )}
                              <span className="truncate">{m.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <span className="px-2.5 py-1 bg-[#10b981]/20 text-[#10b981] rounded-full text-[11px] font-semibold">active</span>
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          {/* Mobile cards (phones) — stacked so nothing is cut off */}
          <div className="md:hidden space-y-3">
            {chatters.map((c) => {
              const initials = c.chatter_email
                .split(/[\s@.]+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0])
                .join("")
                .toUpperCase();
              const p = presenceLabel(c.chatter_id);
              return (
                <div key={c.id} className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-4">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => setSelectedChatter(c)}>
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-full flex items-center justify-center text-white font-semibold text-[13px]">
                        {initials}
                      </div>
                      <span
                        className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#161a22]"
                        style={{ backgroundColor: p.online ? "#10b981" : "#6b7280" }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium text-white truncate">{c.chatter_email}</div>
                      <div className="text-[11px]">
                        <span className={p.online ? "text-emerald-400" : "text-[#6b7280]"}>{p.text}</span>
                        <span className="text-[#6b7280]"> · joined {new Date(c.joined_at).toLocaleDateString("en-US")}</span>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-[#10b981]/20 text-[#10b981] rounded-full text-[11px] font-semibold shrink-0">active</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-[#2a2d35]" onClick={(e) => e.stopPropagation()}>
                    <div className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-1.5">Assigned creator</div>
                    <div className="relative">
                      <button
                        onClick={() => setOpenDropdownId(openDropdownId === `m-${c.id}` ? null : `m-${c.id}`)}
                        className="w-full px-3 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] text-white hover:border-[#4b5563] transition-colors flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {c.model?.avatar_url ? (
                            <img src={c.model.avatar_url} alt={c.model.name} className="w-5 h-5 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#6366f1] to-[#4f46e5] shrink-0" />
                          )}
                          <span className="truncate">{c.model?.name ?? "—"}</span>
                        </div>
                        <ChevronDown className="w-3.5 h-3.5 text-[#6b7280] shrink-0" />
                      </button>
                      {openDropdownId === `m-${c.id}` && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1f2937] border border-[#374151] rounded-lg shadow-xl overflow-hidden z-20 max-h-[220px] overflow-y-auto">
                          {models.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => handleReassign(c.id, m.id)}
                              className={`w-full px-3 py-2 text-left text-[12px] hover:bg-[#374151] transition-colors flex items-center gap-2 ${c.model_id === m.id ? "bg-[#374151] text-[#6366f1]" : "text-white"}`}
                            >
                              {m.avatar_url ? (
                                <img src={m.avatar_url} alt={m.name} className="w-5 h-5 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#6366f1] to-[#4f46e5] shrink-0" />
                              )}
                              <span className="truncate">{m.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>

      {showInvite && (
        <InviteChatterModal
          models={models}
          onClose={() => setShowInvite(false)}
          onInvited={load}
        />
      )}

      {selectedChatter && (
        <ChatterStatsModal
          chatter={selectedChatter}
          models={models}
          onClose={() => setSelectedChatter(null)}
          onReassigned={(newModelId) => {
            const modelMap = new Map(models.map((m) => [m.id, m]));
            setChatters((prev) =>
              prev.map((c) =>
                c.id === selectedChatter.id
                  ? { ...c, model_id: newModelId, model: newModelId ? modelMap.get(newModelId) ?? null : null }
                  : c,
              ),
            );
          }}
          onDeleted={() => {
            setChatters((prev) => prev.filter((c) => c.id !== selectedChatter.id));
          }}
        />
      )}
    </div>
  );
}
