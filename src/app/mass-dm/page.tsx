"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Topbar } from "@/components/chatter-page-classic/Topbar";

/**
 * /mass-dm — agency Mass DMs page.
 *
 * Three columns:
 *   1. Compose: model picker, filters (tags / min spent / last seen),
 *      live recipient count + sample, message template editor,
 *      throttle slider, Send button.
 *   2. Live campaign (when one is running): progress bar, recent sends,
 *      Stop button.
 *   3. History: past campaigns list.
 */

type ModelLite = { id: string; name: string };

type Filters = {
  tags?: string[];
  minSpent?: number;
  lastSeenDays?: number;
};

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

const COMMON_TAGS = ["🔥", "💎", "💸", "⭐", "🆕", "💀", "🥶"];

export default function MassDmPage() {
  const supabase = createClient();
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [models, setModels] = useState<ModelLite[]>([]);
  const [modelId, setModelId] = useState<string>("");

  const [filters, setFilters] = useState<Filters>({});
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewSample, setPreviewSample] = useState<{ name: string; spent: number }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [message, setMessage] = useState(
    "Hey {first_name} 💋 you been quiet — anything I can send you?",
  );
  const [jitterMin, setJitterMin] = useState(2000);
  const [jitterMax, setJitterMax] = useState(4000);

  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [recentSent, setRecentSent] = useState<RecentSent[]>([]);
  const [recentFailed, setRecentFailed] = useState<RecentFailed[]>([]);
  const [history, setHistory] = useState<Campaign[]>([]);
  const [err, setErr] = useState<string>("");

  // ── Boot: load user, models, history. ────────────────────────────────
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
      void loadHistory();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Live preview (debounced via filter+model key). ───────────────────
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
        const j = (await r.json()) as { count?: number; sample?: { name: string; spent: number }[]; error?: string };
        if (j.count !== undefined) {
          setPreviewCount(j.count);
          setPreviewSample(j.sample ?? []);
        } else if (j.error) {
          setErr(j.error);
        }
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(tid);
  }, [previewKey, modelId, filters]);

  // ── Poll the active campaign every 1.5s. ─────────────────────────────
  useEffect(() => {
    if (!activeCampaign) return;
    const iv = setInterval(async () => {
      const r = await fetch(`/api/mass-dm/${activeCampaign.id}`);
      if (!r.ok) return;
      const j = (await r.json()) as {
        campaign: Campaign;
        recentSent: RecentSent[];
        recentFailed: RecentFailed[];
      };
      setActiveCampaign(j.campaign);
      setRecentSent(j.recentSent ?? []);
      setRecentFailed(j.recentFailed ?? []);
      if (
        j.campaign.status === "completed" ||
        j.campaign.status === "cancelled" ||
        j.campaign.status === "failed"
      ) {
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

  async function startCampaign() {
    setErr("");
    if (!modelId) return;
    if (!message.trim()) {
      setErr("Message required");
      return;
    }
    if ((previewCount ?? 0) === 0) {
      setErr("No recipients match");
      return;
    }
    const r = await fetch("/api/mass-dm/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId,
        message,
        filters,
        jitterMinMs: jitterMin,
        jitterMaxMs: jitterMax,
      }),
    });
    const j = (await r.json()) as { campaignId?: string; total?: number; error?: string };
    if (!r.ok || !j.campaignId) {
      setErr(j.error ?? "Failed to create");
      return;
    }
    await fetch(`/api/mass-dm/${j.campaignId}/start`, { method: "POST" });
    // Fetch initial state so the live panel shows up immediately.
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
  }

  async function stopCampaign() {
    if (!activeCampaign) return;
    await fetch(`/api/mass-dm/${activeCampaign.id}/stop`, { method: "POST" });
  }

  const toggleTag = useCallback((tag: string) => {
    setFilters((f) => {
      const cur = new Set(f.tags ?? []);
      if (cur.has(tag)) cur.delete(tag);
      else cur.add(tag);
      return { ...f, tags: [...cur] };
    });
  }, []);

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

  const messageCharCount = message.length;

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
              <label className="text-[11px] text-[#9ca3af] block mb-1">Model</label>
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
                Throttle (ms between sends)
              </label>
              <div className="flex items-center gap-2">
                <input
                  className={input + " w-24"}
                  type="number"
                  min={500}
                  step={100}
                  value={jitterMin}
                  onChange={(e) => setJitterMin(Number(e.target.value))}
                  disabled={isComposeDisabled}
                />
                <span className="text-[12px] text-[#6b7280]">to</span>
                <input
                  className={input + " w-24"}
                  type="number"
                  min={600}
                  step={100}
                  value={jitterMax}
                  onChange={(e) => setJitterMax(Number(e.target.value))}
                  disabled={isComposeDisabled}
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="text-[11px] text-[#9ca3af] block mb-1">Filters</label>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {COMMON_TAGS.map((t) => {
                    const on = (filters.tags ?? []).includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTag(t)}
                        disabled={isComposeDisabled}
                        className={`px-3 py-1.5 rounded-full text-[12px] border transition-all ${
                          on
                            ? "bg-[#6366f1] border-[#6366f1] text-white"
                            : "bg-[#1f2937] border-[#374151] text-[#9ca3af] hover:text-white"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#9ca3af] block mb-1">
                      Min total spent ($)
                    </label>
                    <input
                      className={input}
                      type="number"
                      min={0}
                      value={filters.minSpent ?? ""}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          minSpent: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      placeholder="0"
                      disabled={isComposeDisabled}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#9ca3af] block mb-1">
                      Active in last N days
                    </label>
                    <input
                      className={input}
                      type="number"
                      min={0}
                      value={filters.lastSeenDays ?? ""}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          lastSeenDays: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      placeholder="all time"
                      disabled={isComposeDisabled}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="mt-4 bg-[#0f131a] border border-[#2a2d35] rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] font-semibold text-white">
                {previewLoading
                  ? "Counting…"
                  : `${previewCount ?? "—"} recipient${previewCount === 1 ? "" : "s"} match`}
              </div>
              <div className="text-[10px] text-[#6b7280] uppercase tracking-wider">
                top spenders shown
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {previewSample.map((f, i) => (
                <span
                  key={i}
                  className="px-2 py-1 bg-[#1f2937] border border-[#374151] rounded text-[11px] text-[#d1d5db]"
                >
                  {f.name} {f.spent > 0 && <span className="text-[#6366f1]">${f.spent.toFixed(0)}</span>}
                </span>
              ))}
              {!previewSample.length && !previewLoading && (
                <span className="text-[11px] text-[#6b7280]">No matches yet.</span>
              )}
            </div>
          </div>

          {/* Message */}
          <div className="mt-4">
            <label className="text-[11px] text-[#9ca3af] block mb-1">
              Message — supports{" "}
              <code className="text-[#6366f1]">{"{first_name}"}</code>,{" "}
              <code className="text-[#6366f1]">{"{name}"}</code>,{" "}
              <code className="text-[#6366f1]">{"{username}"}</code>
            </label>
            <textarea
              className={input + " font-mono"}
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={4096}
              disabled={isComposeDisabled}
            />
            <div className="text-[10px] text-[#6b7280] mt-1 text-right">
              {messageCharCount}/4096
            </div>
          </div>

          <div className="flex items-center gap-3 mt-3">
            <button
              className={btnPrimary}
              onClick={startCampaign}
              disabled={
                isComposeDisabled ||
                !modelId ||
                !message.trim() ||
                (previewCount ?? 0) === 0
              }
            >
              Send to {previewCount ?? "?"} fans
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
                </div>
              </div>

              {recentSent.length > 0 && (
                <div className="bg-[#0f131a] border border-[#2a2d35] rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-[#9ca3af] mb-1.5">
                    Recently sent
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recentSent.map((r, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-[#1f2937] rounded text-[11px] text-[#a7f3d0]"
                      >
                        {r.peer_username ? `@${r.peer_username}` : r.first_name ?? "Fan"}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {recentFailed.length > 0 && (
                <div className="bg-[#1f0d10] border border-[#3a1d20] rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-red-400 mb-1.5">
                    Failed
                  </div>
                  <div className="space-y-1">
                    {recentFailed.slice(0, 5).map((r, i) => (
                      <div key={i} className="text-[11px] text-[#fca5a5]">
                        {r.peer_username ? `@${r.peer_username}` : r.first_name ?? "Fan"} — {r.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeCampaign.status === "running" && (
                <button className={btnDanger} onClick={stopCampaign}>
                  Stop campaign
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
                      {new Date(c.created_at).toLocaleString()}
                    </div>
                    <div className="text-[12px] text-white truncate max-w-[500px]">
                      {c.message}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-[11px] font-semibold uppercase tracking-wider ${
                        c.status === "completed"
                          ? "text-emerald-400"
                          : c.status === "running"
                          ? "text-[#6366f1]"
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
