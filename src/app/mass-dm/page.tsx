"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Topbar } from "@/components/chatter-page-classic/Topbar";
import { NumberField } from "@/components/ui/NumberField";

/**
 * /mass-dm — agency Mass DMs page.
 *
 * Compose → filters (same emoji tags as the chat + Fan Groups + min spent
 * + last seen) → live full recipient list (with per-fan exclude) →
 * message template → throttle preset + daily cap → Send. Then a live
 * progress panel + history.
 */

type ModelLite = { id: string; name: string };
type GroupLite = { id: string; name: string; color: string; emoji: string | null };

type Filters = {
  tags?: string[];
  groupIds?: string[];
  minSpent?: number;
  lastSeenDays?: number;
};

type Recipient = { peerId: string; name: string; spent: number };

type Campaign = {
  id: string;
  model_id: string;
  message: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
};

type RecentSent = { peer_username: string | null; first_name: string | null; sent_at: string };
type RecentFailed = { peer_username: string | null; first_name: string | null; error: string };

// Same emoji tag set the chat uses (FanProfileDrawer FAN_TAGS) so filters
// are consistent across the app.
const CHAT_TAGS = ["🔴", "💵", "💰", "⭐", "👑"] as const;

// Throttle presets (ms). Default Normal — safe for warm fans who already
// messaged the model.
const PRESETS = {
  safe: { label: "Safe", min: 30000, max: 60000, hint: "30–60s · ~80/hr" },
  normal: { label: "Normal", min: 15000, max: 30000, hint: "15–30s · ~160/hr" },
  fast: { label: "Fast", min: 5000, max: 10000, hint: "5–10s · risky, may flood-wait" },
} as const;
type PresetKey = keyof typeof PRESETS;

export default function MassDmPage() {
  const supabase = createClient();
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [models, setModels] = useState<ModelLite[]>([]);
  const [modelId, setModelId] = useState<string>("");
  const [groups, setGroups] = useState<GroupLite[]>([]);

  const [filters, setFilters] = useState<Filters>({});
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [previewLoading, setPreviewLoading] = useState(false);

  const [message, setMessage] = useState(
    "Hey {first_name} 💋 you been quiet — anything I can send you?",
  );
  const [preset, setPreset] = useState<PresetKey>("normal");
  const [dailyLimit, setDailyLimit] = useState<number | undefined>(200);
  const [isAb, setIsAb] = useState(false);
  const [messageB, setMessageB] = useState("Hey {first_name} 🔥 got something special just for you today…");

  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [recentSent, setRecentSent] = useState<RecentSent[]>([]);
  const [recentFailed, setRecentFailed] = useState<RecentFailed[]>([]);
  const [abStats, setAbStats] = useState<{ a: { sent: number; replied: number }; b: { sent: number; replied: number } } | null>(null);
  const [history, setHistory] = useState<Campaign[]>([]);
  const [err, setErr] = useState<string>("");
  // Locks the Send button from the moment it's clicked until create+start
  // resolves — prevents double-firing a campaign on rapid clicks.
  const [starting, setStarting] = useState(false);

  // ── Boot: load user, models, groups, history. ───────────────────────
  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setDisplayName(
        (user.user_metadata?.full_name as string) ||
          user.email?.split("@")[0] ||
          "Agency",
      );
      const { data: m } = await supabase
        .from("models")
        .select("id, name")
        .eq("agency_user_id", user.id);
      const list = (m ?? []) as ModelLite[];
      setModels(list);
      if (list.length) setModelId(list[0].id);

      const r = await fetch("/api/groups");
      if (r.ok) {
        const j = (await r.json()) as { groups: GroupLite[] };
        setGroups(j.groups ?? []);
      }
      void loadHistory();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Live preview (full recipient list). ──────────────────────────────
  const previewKey = useMemo(
    () => `${modelId}|${JSON.stringify(filters)}`,
    [modelId, filters],
  );
  useEffect(() => {
    if (!modelId) return;
    const tid = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const r = await fetch("/api/mass-dm/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId, filters }),
        });
        const j = (await r.json()) as {
          count?: number;
          recipients?: Recipient[];
          error?: string;
        };
        if (j.recipients) {
          setTotalCount(j.count ?? j.recipients.length);
          setRecipients(j.recipients);
          // Drop excludes that are no longer in the list.
          setExcluded((prev) => {
            const live = new Set(j.recipients!.map((x) => x.peerId));
            const next = new Set<string>();
            for (const id of prev) if (live.has(id)) next.add(id);
            return next;
          });
        } else if (j.error) {
          setErr(j.error);
        }
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(tid);
  }, [previewKey, modelId, filters]);

  // ── Poll the active campaign. ────────────────────────────────────────
  useEffect(() => {
    if (!activeCampaign) return;
    const iv = setInterval(async () => {
      const r = await fetch(`/api/mass-dm/${activeCampaign.id}`);
      if (!r.ok) return;
      const j = (await r.json()) as {
        campaign: Campaign;
        recentSent: RecentSent[];
        recentFailed: RecentFailed[];
        ab?: typeof abStats;
      };
      setActiveCampaign(j.campaign);
      setRecentSent(j.recentSent ?? []);
      setRecentFailed(j.recentFailed ?? []);
      setAbStats(j.ab ?? null);
      if (["completed", "cancelled", "failed", "paused"].includes(j.campaign.status)) {
        clearInterval(iv);
        void loadHistory();
      }
    }, 1500);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCampaign?.id]);

  async function loadHistory() {
    const r = await fetch("/api/mass-dm");
    if (!r.ok) return;
    const j = (await r.json()) as { campaigns: Campaign[] };
    setHistory(j.campaigns ?? []);
  }

  const finalCount = recipients.filter((r) => !excluded.has(r.peerId)).length;

  async function startCampaign() {
    if (starting) return;
    setErr("");
    if (!modelId) return;
    if (!message.trim()) {
      setErr("Message required");
      return;
    }
    if (finalCount === 0) {
      setErr("No recipients selected");
      return;
    }
    setStarting(true);
    try {
      const p = PRESETS[preset];
      const r = await fetch("/api/mass-dm/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          message,
          messageB: isAb ? messageB : undefined,
          isAb,
          filters,
          jitterMinMs: p.min,
          jitterMaxMs: p.max,
          dailyLimit: dailyLimit ?? null,
          excludePeerIds: [...excluded],
        }),
      });
      const j = (await r.json()) as { campaignId?: string; total?: number; error?: string };
      if (!r.ok || !j.campaignId) {
        setErr(j.error ?? "Failed to create");
        return;
      }
      await fetch(`/api/mass-dm/${j.campaignId}/start`, { method: "POST" });
      const sR = await fetch(`/api/mass-dm/${j.campaignId}`);
      if (sR.ok) {
        const sJ = (await sR.json()) as {
          campaign: Campaign;
          recentSent: RecentSent[];
          recentFailed: RecentFailed[];
        };
        setActiveCampaign(sJ.campaign);
        setRecentSent(sJ.recentSent ?? []);
        setRecentFailed(sJ.recentFailed ?? []);
      }
    } finally {
      setStarting(false);
    }
  }

  async function stopCampaign() {
    if (!activeCampaign) return;
    await fetch(`/api/mass-dm/${activeCampaign.id}/stop`, { method: "POST" });
  }

  function toggleTag(tag: string) {
    setFilters((f) => {
      const cur = new Set(f.tags ?? []);
      if (cur.has(tag)) cur.delete(tag);
      else cur.add(tag);
      return { ...f, tags: [...cur] };
    });
  }
  function toggleGroup(id: string) {
    setFilters((f) => {
      const cur = new Set(f.groupIds ?? []);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      return { ...f, groupIds: [...cur] };
    });
  }

  const card = "bg-[#161a22] border border-[#2a2d35] rounded-xl p-5";
  const input =
    "w-full px-3 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1]";
  const btnPrimary =
    "px-5 py-2.5 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[12px] hover:from-[#5558e3] hover:to-[#4338ca] transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const btnDanger =
    "px-5 py-2.5 bg-red-600 text-white rounded-lg font-semibold text-[12px] hover:bg-red-700 transition-all disabled:opacity-50";

  const isComposeDisabled = !!activeCampaign && activeCampaign.status === "running";

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const progressPct =
    activeCampaign && activeCampaign.total_recipients > 0
      ? Math.round(
          ((activeCampaign.sent_count + activeCampaign.failed_count) /
            activeCampaign.total_recipients) *
            100,
        )
      : 0;

  return (
    <div className="chatter-root min-h-screen bg-[#0d1117] text-white">
      <Topbar displayName={displayName} onLogout={logout} />
      <div className="max-w-[1100px] mx-auto p-5 md:p-6 space-y-5">
        <div>
          <h1 className="text-[22px] md:text-[24px] font-bold text-white mb-1">
            Mass DMs 💌
          </h1>
          <p className="text-[13px] text-[#9ca3af]">
            Send a personalized message to a filtered fan list. Throttled to mimic
            human typing so Telegram doesn&apos;t flag the account.
          </p>
        </div>

        {/* COMPOSE */}
        <div className={card}>
          <h2 className="text-[14px] font-semibold uppercase tracking-wider text-[#9ca3af] mb-3">
            Compose
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-[#9ca3af] block mb-1">Creator</label>
              <select
                className={input}
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                disabled={isComposeDisabled}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-[#9ca3af] block mb-1">
                Send speed
              </label>
              <div className="flex items-center gap-2">
                {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={isComposeDisabled}
                    onClick={() => setPreset(k)}
                    className={`px-3 py-2 rounded-lg text-[12px] font-medium border transition-all ${
                      preset === k
                        ? "bg-[#6366f1] border-[#6366f1] text-white"
                        : "bg-[#1f2937] border-[#374151] text-[#9ca3af] hover:text-white"
                    }`}
                  >
                    {PRESETS[k].label}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-[#6b7280] mt-1">
                {PRESETS[preset].hint}
                {preset === "fast" && (
                  <span className="text-amber-400"> · higher ban risk</span>
                )}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-4">
            <label className="text-[11px] text-[#9ca3af] block mb-2">Filters</label>

            {/* Emoji tags (same as chat) */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-wider text-[#6b7280] mr-1">Tags</span>
              {CHAT_TAGS.map((t) => {
                const on = (filters.tags ?? []).includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    disabled={isComposeDisabled}
                    className={`w-9 h-9 rounded-lg text-[16px] leading-none border flex items-center justify-center transition-all ${
                      on
                        ? "bg-[#6366f1]/20 border-[#6366f1] ring-1 ring-[#6366f1]"
                        : "bg-[#1f2937] border-[#374151] opacity-70 hover:opacity-100"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>

            {/* Fan Groups */}
            {groups.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[10px] uppercase tracking-wider text-[#6b7280] mr-1">Groups</span>
                {groups.map((g) => {
                  const on = (filters.groupIds ?? []).includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      disabled={isComposeDisabled}
                      className="px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all"
                      style={{
                        background: on ? `${g.color}30` : "#1f2937",
                        borderColor: on ? g.color : "#374151",
                        color: on ? g.color : "#9ca3af",
                      }}
                    >
                      {g.emoji ? `${g.emoji} ` : ""}{g.name}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#9ca3af] block mb-1">Min total spent ($)</label>
                <NumberField
                  value={filters.minSpent}
                  onChange={(v) => setFilters({ ...filters, minSpent: v })}
                  min={0}
                  placeholder="0"
                  disabled={isComposeDisabled}
                />
              </div>
              <div>
                <label className="text-[11px] text-[#9ca3af] block mb-1">Active in last N days</label>
                <NumberField
                  value={filters.lastSeenDays}
                  onChange={(v) => setFilters({ ...filters, lastSeenDays: v })}
                  min={0}
                  placeholder="all time"
                  disabled={isComposeDisabled}
                />
              </div>
            </div>
          </div>

          {/* Recipient list (full, scrollable, with exclude) */}
          <div className="mt-4 bg-[#0f131a] border border-[#2a2d35] rounded-lg">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2d35]">
              <div className="text-[12px] font-semibold text-white">
                {previewLoading
                  ? "Counting…"
                  : `${finalCount} will receive${
                      excluded.size ? ` · ${excluded.size} excluded` : ""
                    }${
                      totalCount !== null && totalCount > recipients.length
                        ? ` · showing ${recipients.length} of ${totalCount}`
                        : ""
                    }`}
              </div>
              {excluded.size > 0 && (
                <button
                  className="text-[11px] text-[#6366f1] hover:underline"
                  onClick={() => setExcluded(new Set())}
                >
                  Reset excludes
                </button>
              )}
            </div>
            <div className="max-h-[240px] overflow-y-auto p-1.5">
              {recipients.length === 0 && !previewLoading && (
                <div className="text-[12px] text-[#6b7280] px-2 py-3">
                  No fans match these filters.
                </div>
              )}
              {recipients.map((r) => {
                const ex = excluded.has(r.peerId);
                return (
                  <div
                    key={r.peerId}
                    className={`flex items-center justify-between px-2 py-1.5 rounded text-[12px] ${
                      ex ? "opacity-40" : ""
                    }`}
                  >
                    <span className="text-[#d1d5db] truncate">
                      {r.name}
                      {r.spent > 0 && (
                        <span className="text-[#6366f1] ml-2">${r.spent.toFixed(0)}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      disabled={isComposeDisabled}
                      onClick={() =>
                        setExcluded((prev) => {
                          const n = new Set(prev);
                          if (n.has(r.peerId)) n.delete(r.peerId);
                          else n.add(r.peerId);
                          return n;
                        })
                      }
                      className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
                        ex
                          ? "text-emerald-400 hover:bg-[#1f2937]"
                          : "text-[#9ca3af] hover:text-red-400 hover:bg-[#1f2937]"
                      }`}
                    >
                      {ex ? "Include" : "Exclude"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Message */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-[#9ca3af]">
                Message {isAb && <span className="text-[#6366f1]">(Variant A)</span>} — supports{" "}
                <code className="text-[#6366f1]">{"{first_name}"}</code>
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-[#9ca3af] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAb}
                  onChange={(e) => setIsAb(e.target.checked)}
                  disabled={isComposeDisabled}
                  className="accent-[#6366f1]"
                />
                A/B test
              </label>
            </div>
            <textarea
              className={input + " font-mono"}
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={4096}
              disabled={isComposeDisabled}
            />
            <div className="text-[10px] text-[#6b7280] mt-1 text-right">
              {message.length}/4096
            </div>

            {isAb && (
              <div className="mt-3">
                <label className="text-[11px] text-[#9ca3af] block mb-1">
                  <span className="text-[#6366f1]">Variant B</span> — sent to a random 50% of recipients
                </label>
                <textarea
                  className={input + " font-mono"}
                  rows={4}
                  value={messageB}
                  onChange={(e) => setMessageB(e.target.value)}
                  maxLength={4096}
                  disabled={isComposeDisabled}
                />
                <div className="text-[10px] text-[#6b7280] mt-1">
                  Winner is the variant with the higher reply rate (fan messages back within 48h).
                </div>
              </div>
            )}
          </div>

          {/* Daily cap + Send */}
          <div className="flex flex-wrap items-end gap-3 mt-3">
            <div>
              <label className="text-[11px] text-[#9ca3af] block mb-1">Max per day</label>
              <NumberField
                className="w-28"
                value={dailyLimit}
                onChange={setDailyLimit}
                min={0}
                placeholder="no cap"
                disabled={isComposeDisabled}
              />
            </div>
            <button
              className={btnPrimary}
              onClick={startCampaign}
              disabled={
                starting || isComposeDisabled || !modelId || !message.trim() || finalCount === 0
              }
            >
              {starting ? "Starting…" : `Send to ${finalCount} fans`}
            </button>
            {err && <span className="text-[11px] text-red-400">{err}</span>}
          </div>
        </div>

        {/* LIVE */}
        {activeCampaign && (
          <div className={card}>
            <h2 className="text-[14px] font-semibold uppercase tracking-wider text-[#9ca3af] mb-3">
              Live campaign — {activeCampaign.status}
            </h2>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[12px] text-[#d1d5db] mb-1">
                  <span>
                    {activeCampaign.sent_count + activeCampaign.failed_count}/
                    {activeCampaign.total_recipients}
                  </span>
                  <span>{progressPct}%</span>
                </div>
                <div className="h-2 bg-[#1f2937] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#6366f1] to-[#4f46e5] transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="text-[11px] text-[#9ca3af] mt-1">
                  Sent {activeCampaign.sent_count} · Failed {activeCampaign.failed_count}
                  {activeCampaign.status === "paused" && (
                    <span className="text-amber-400"> · daily cap reached, resume tomorrow</span>
                  )}
                </div>
              </div>

              {abStats && (abStats.a.sent > 0 || abStats.b.sent > 0) && (() => {
                const rate = (v: { sent: number; replied: number }) =>
                  v.sent > 0 ? (v.replied / v.sent) * 100 : 0;
                const ra = rate(abStats.a);
                const rb = rate(abStats.b);
                const winner = ra === rb ? null : ra > rb ? "A" : "B";
                const cell = (label: string, v: { sent: number; replied: number }, win: boolean) => (
                  <div className={`flex-1 rounded-lg p-3 border ${win ? "border-emerald-500/50 bg-emerald-500/5" : "border-[#2a2d35] bg-[#0f131a]"}`}>
                    <div className="text-[10px] uppercase tracking-wider text-[#9ca3af] flex items-center gap-1.5">
                      Variant {label} {win && <span className="text-emerald-400">· winner 🏆</span>}
                    </div>
                    <div className="text-[18px] font-bold text-white mt-1">{rate(v).toFixed(1)}%</div>
                    <div className="text-[11px] text-[#6b7280]">{v.replied} replied / {v.sent} sent</div>
                  </div>
                );
                return (
                  <div className="flex gap-2">
                    {cell("A", abStats.a, winner === "A")}
                    {cell("B", abStats.b, winner === "B")}
                  </div>
                );
              })()}

              {recentSent.length > 0 && (
                <div className="bg-[#0f131a] border border-[#2a2d35] rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-[#9ca3af] mb-1.5">
                    Recently sent
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recentSent.map((r, i) => (
                      <span key={i} className="px-2 py-0.5 bg-[#1f2937] rounded text-[11px] text-[#a7f3d0]">
                        {r.peer_username ? `@${r.peer_username}` : r.first_name ?? "Fan"}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {recentFailed.length > 0 && (
                <div className="bg-[#1f0d10] border border-[#3a1d20] rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-red-400 mb-1.5">Failed</div>
                  <div className="space-y-1">
                    {recentFailed.slice(0, 5).map((r, i) => (
                      <div key={i} className="text-[11px] text-[#fca5a5]">
                        {r.peer_username ? `@${r.peer_username}` : r.first_name ?? "Fan"} — {r.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(activeCampaign.status === "running" || activeCampaign.status === "paused") && (
                <button className={btnDanger} onClick={stopCampaign}>
                  {activeCampaign.status === "paused" ? "Cancel campaign" : "Stop campaign"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* HISTORY */}
        {history.length > 0 && (
          <div className={card}>
            <h2 className="text-[14px] font-semibold uppercase tracking-wider text-[#9ca3af] mb-3">
              History
            </h2>
            <div className="space-y-2">
              {history.map((c) => (
                <div
                  key={c.id}
                  className="bg-[#0f131a] border border-[#2a2d35] rounded-lg p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] text-[#6b7280] mb-0.5">
                      {new Date(c.created_at).toLocaleString("en-US")}
                    </div>
                    <div className="text-[12px] text-white truncate max-w-[500px]">{c.message}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-[11px] font-semibold uppercase tracking-wider ${
                        c.status === "completed"
                          ? "text-emerald-400"
                          : c.status === "running"
                          ? "text-[#6366f1]"
                          : c.status === "paused"
                          ? "text-amber-400"
                          : c.status === "cancelled"
                          ? "text-[#9ca3af]"
                          : "text-red-400"
                      }`}
                    >
                      {c.status}
                    </div>
                    <div className="text-[11px] text-[#d1d5db]">
                      {c.sent_count}/{c.total_recipients}
                    </div>
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
