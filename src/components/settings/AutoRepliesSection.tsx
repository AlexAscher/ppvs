"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Smile, X, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { EmojiPicker } from "@/components/chatter-page/EmojiPicker";

/**
 * Auto Replies — agency Settings section.
 *
 * - Model picker (one auto-reply per model). Defaults to first.
 * - Enable toggle.
 * - Message textarea (≤ 4 KB).
 * - Send delay preset (1 / 2 / 5 / 10 / 30 min).
 * - Stars price (0 = free; > 0 = native paid media via @ppvstarbot).
 * - Vault picker: multi-select PPVs to attach (up to 10).
 *
 * Media comes from the Vault exclusively — the legacy per-AR upload path
 * was retired in batch 93c. Saved fields are read/written through
 * /api/auto-reply/[modelId].
 */

type Model = { id: string; name: string };

type VaultPpv = {
  id: string;
  name: string;
  media_url: string | null;
  preview_url: string | null;
};

type Config = {
  enabled: boolean;
  text: string;
  /** Delay in seconds before the auto-reply fires after the fan's first
   *  message. Presets 60 / 120 / 300 / 600 / 1800. Default 60. */
  delaySec: number;
  /** Telegram Stars price (0..10 000). 0 = free album; > 0 = native Paid
   *  Media via @ppvstarbot (business connection required). */
  stars: number;
  /** Ordered list of Vault PPV ids to attach (max 10, mirroring native
   *  sendPaidMedia's album cap). */
  ppvIds: string[];
};

const DELAY_PRESETS = [
  { value: 60, label: "1 min" },
  { value: 120, label: "2 min" },
  { value: 300, label: "5 min" },
  { value: 600, label: "10 min" },
  { value: 1800, label: "30 min" },
] as const;

const MAX_STARS = 10_000;
const MAX_PPVS_PER_AR = 10;

export function AutoRepliesSection() {
  const supabase = createClient();

  const [agencyUserId, setAgencyUserId] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const [config, setConfig] = useState<Config>({
    enabled: false,
    text: "",
    delaySec: 60,
    stars: 0,
    ppvIds: [],
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Vault picker.
  const [vaultPpvs, setVaultPpvs] = useState<VaultPpv[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setAgencyUserId(user.id);
      const { data } = await supabase
        .from("models")
        .select("id, name")
        .eq("agency_user_id", user.id);
      const list = (data ?? []) as Model[];
      setModels(list);
      if (list.length > 0) setSelectedModelId(list[0].id);
    })();
  }, [supabase]);

  // Reload config + vault PPVs when the selected model changes.
  useEffect(() => {
    if (!selectedModelId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [cfgRes, ppvsRes] = await Promise.all([
          fetch(`/api/auto-reply/${selectedModelId}`),
          supabase
            .from("ppvs")
            .select("id, name, media_url, preview_url")
            .eq("model_id", selectedModelId)
            .order("created_at", { ascending: false }),
        ]);
        if (!cfgRes.ok) throw new Error(`HTTP ${cfgRes.status}`);
        const data = (await cfgRes.json()) as Config;
        if (cancelled) return;
        setConfig({
          enabled: !!data.enabled,
          text: data.text ?? "",
          delaySec: Number(data.delaySec ?? 60),
          stars: Math.max(0, Math.floor(Number(data.stars ?? 0))),
          ppvIds: Array.isArray(data.ppvIds) ? data.ppvIds : [],
        });
        setVaultPpvs((ppvsRes.data ?? []) as VaultPpv[]);
        setMsg("");
      } catch (e: unknown) {
        if (!cancelled) setMsg(e instanceof Error ? `Error: ${e.message}` : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedModelId, supabase]);

  async function persist(patch: Partial<Config>): Promise<void> {
    if (!selectedModelId) return;
    setSaving(true);
    setMsg("");
    try {
      const body: Record<string, unknown> = {};
      if ("enabled" in patch) body.enabled = patch.enabled;
      if ("text" in patch) body.text = patch.text;
      if ("delaySec" in patch) body.delaySec = patch.delaySec;
      if ("stars" in patch) body.stars = patch.stars;
      if ("ppvIds" in patch) body.ppvIds = patch.ppvIds;
      const res = await fetch(`/api/auto-reply/${selectedModelId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setMsg("Saved ✓");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? `Error: ${e.message}` : "Save error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAll() {
    await persist({
      enabled: config.enabled,
      text: config.text,
      delaySec: config.delaySec,
      stars: config.stars,
      ppvIds: config.ppvIds,
    });
  }

  async function toggleEnabled(next: boolean) {
    if (!selectedModelId || saving) return;
    const prev = config.enabled;
    setConfig((c) => ({ ...c, enabled: next })); // optimistic
    try {
      await persist({ enabled: next });
      setMsg(next ? "Auto-replies enabled ✓" : "Auto-replies disabled");
    } catch {
      setConfig((c) => ({ ...c, enabled: prev })); // rollback
    }
  }

  function toggleSelPpv(id: string) {
    setConfig((c) => {
      const has = c.ppvIds.includes(id);
      const next = has
        ? c.ppvIds.filter((x) => x !== id)
        : c.ppvIds.length >= MAX_PPVS_PER_AR
          ? c.ppvIds
          : [...c.ppvIds, id];
      return { ...c, ppvIds: next };
    });
  }

  function removePpv(id: string) {
    setConfig((c) => ({ ...c, ppvIds: c.ppvIds.filter((x) => x !== id) }));
  }

  const card = "bg-[#161a22] border border-[#2a2d35] rounded-xl p-5 md:p-6";
  const label = "block text-[12px] text-[#9ca3af] mb-1.5 font-medium";
  const input =
    "w-full px-3.5 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#00AFF0]";
  const btn =
    "px-5 py-2.5 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] text-white rounded-lg font-semibold text-[12px] hover:from-[#0098D4] hover:to-[#0098D4] transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const msgCls = (m: string) =>
    `text-[11px] ${m.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`;

  const selectedModel = models.find((m) => m.id === selectedModelId);
  const ppvById = new Map(vaultPpvs.map((p) => [p.id, p]));
  const selectedPpvs = config.ppvIds
    .map((id) => ppvById.get(id))
    .filter((p): p is VaultPpv => !!p);

  const overStarCap = config.stars > MAX_STARS;

  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h2 className="text-[15px] font-semibold text-white">Auto Replies 🤖</h2>
          <p className="text-[12px] text-[#6b7280] mt-1">
            Auto-respond to a fan&apos;s very first message with a custom
            greeting + PPVs from your Vault. Sent once per fan, then your
            chatters take over.
          </p>
          <p className="text-[11px] text-[#6b7280] mt-1.5 italic">
            Auto replies are sent only if no chatter or agency member replied
            to the fan before the timer went off.
          </p>
        </div>
        {/* Model picker */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowModelDropdown((v) => !v)}
            className="px-3 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] font-medium text-white hover:bg-[#374151] transition-all flex items-center gap-2 min-w-[160px] justify-between"
          >
            <span className="truncate">{selectedModel?.name ?? "Select creator"}</span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          </button>
          {showModelDropdown && (
            <div className="absolute top-full right-0 mt-1 w-full bg-[#1f2937] border border-[#374151] rounded-lg shadow-xl overflow-hidden z-10 max-h-[200px] overflow-y-auto">
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedModelId(m.id); setShowModelDropdown(false); }}
                  className={`w-full px-3 py-2 text-[12px] text-left hover:bg-[#374151] transition-colors ${
                    selectedModelId === m.id ? "bg-[#374151] text-[#00AFF0]" : "text-white"
                  }`}
                >
                  {m.name}
                </button>
              ))}
              {models.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-[#6b7280]">No creators</div>
              )}
            </div>
          )}
        </div>
      </div>

      {!selectedModelId ? (
        <p className="text-[12px] text-[#6b7280] mt-4">
          Add a creator in the Creators tab to configure auto-replies.
        </p>
      ) : loading ? (
        <p className="text-[12px] text-[#6b7280] mt-4">Loading…</p>
      ) : (
        <div className="space-y-4 mt-4">
          {/* Enable toggle. */}
          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            disabled={saving}
            onClick={() => toggleEnabled(!config.enabled)}
            className="w-full flex items-center justify-between gap-3 p-3 bg-[#1f2937]/40 border border-[#2a2d35] rounded-lg cursor-pointer hover:bg-[#1f2937]/70 transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div>
              <div className="text-[13px] font-medium text-white">Enable auto-replies</div>
              <div className="text-[11px] text-[#9ca3af] mt-0.5">
                Send this message to every brand-new fan automatically
              </div>
            </div>
            <div
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                config.enabled ? "bg-[#00AFF0]" : "bg-[#374151]"
              }`}
            >
              <div
                className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
                style={{ transform: config.enabled ? "translateX(20px)" : "translateX(0)" }}
              />
            </div>
          </button>

          {/* Send delay */}
          <div>
            <label className={label}>Send delay</label>
            <div className="flex flex-wrap gap-2">
              {DELAY_PRESETS.map((preset) => {
                const active = config.delaySec === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, delaySec: preset.value }))}
                    className={`px-3.5 py-2 rounded-lg text-[12px] font-medium border transition-all ${
                      active
                        ? "bg-[#00AFF0] border-[#00AFF0] text-white"
                        : "bg-[#1f2937] border-[#374151] text-[#9ca3af] hover:text-white"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-[#6b7280] mt-1.5">
              How long to wait after the fan&apos;s first message before the
              auto-reply fires.
            </p>
          </div>

          {/* Message text */}
          <div>
            <label className={label}>Message</label>
            <div className="relative">
              <textarea
                className={`${input} resize-none pr-10`}
                rows={4}
                maxLength={4096}
                value={config.text}
                onChange={(e) => setConfig((c) => ({ ...c, text: e.target.value }))}
                placeholder="Hey 💋 thanks for the message! Stick around — got a lot to show you 🔥"
              />
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setEmojiOpen((v) => !v); }}
                title="Add emoji"
                aria-label="Add emoji"
                className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
                  emojiOpen ? "text-[#00AFF0]" : "text-[#9ca3af] hover:text-white"
                }`}
              >
                <Smile className="w-4 h-4" />
              </button>
              {emojiOpen && (
                <EmojiPicker
                  anchored
                  onSelect={(em) => setConfig((c) => ({ ...c, text: c.text + em }))}
                  onClose={() => setEmojiOpen(false)}
                />
              )}
            </div>
            <div className="text-[10px] text-[#6b7280] mt-1 text-right">
              {config.text.length} / 4096
            </div>
          </div>

          {/* Stars price */}
          <div>
            <label className={label}>Price in Stars (0 = free)</label>
            <input
              type="number"
              min={0}
              max={MAX_STARS}
              step={1}
              value={config.stars}
              onChange={(e) => {
                const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                setConfig((c) => ({ ...c, stars: n }));
              }}
              className={`${input} max-w-[220px]`}
            />
            <p className="text-[11px] text-[#6b7280] mt-1.5">
              When &gt; 0, the attached PPVs are sent as native Telegram Paid
              Media with the ⭐ unlock overlay (requires @ppvstarbot connected
              to the creator). Maximum is {MAX_STARS.toLocaleString()} stars per
              PPV.
            </p>
            {overStarCap && (
              <p className="text-[11px] text-red-400 mt-1">
                Maximum total star price set by Telegram is {MAX_STARS.toLocaleString()} stars.
              </p>
            )}
          </div>

          {/* Vault attachments */}
          <div>
            <label className={label}>
              Attached PPVs (from Vault) — {config.ppvIds.length} / {MAX_PPVS_PER_AR}
            </label>
            {selectedPpvs.length > 0 && (
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-2">
                {selectedPpvs.map((p) => (
                  <div
                    key={p.id}
                    className="relative aspect-square rounded-md overflow-hidden bg-[#1f2937] border border-[#374151]"
                  >
                    {p.media_url ? (
                      /\.(mp4|mov|webm|m4v)(\?|$)/i.test(p.media_url) ? (
                        <video src={`/api/ppv/file/${p.id}`} muted className="w-full h-full object-cover" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/ppv/file/${p.id}`}
                          alt={p.name}
                          className="w-full h-full object-cover"
                        />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-[#6b7280]">
                        {p.name}
                      </div>
                    )}
                    <button
                      onClick={() => removePpv(p.id)}
                      aria-label="Remove"
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              disabled={vaultPpvs.length === 0}
              className="px-4 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] font-medium text-white hover:bg-[#374151] transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {selectedPpvs.length > 0 ? "Change selection" : "Pick from Vault"}
            </button>
            {vaultPpvs.length === 0 && (
              <p className="text-[11px] text-[#6b7280] mt-1.5">
                This creator has no PPVs in the Vault yet. Upload some in the
                Vault tab to attach them to auto-replies.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              className={btn}
              onClick={handleSaveAll}
              disabled={saving || overStarCap}
            >
              {saving ? "Saving…" : "Save auto-reply"}
            </button>
            {msg && <span className={msgCls(msg)}>{msg}</span>}
          </div>
        </div>
      )}

      {showPicker && agencyUserId && selectedModelId && (
        <VaultPickerModal
          vaultPpvs={vaultPpvs}
          selectedIds={config.ppvIds}
          onToggle={toggleSelPpv}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function VaultPickerModal({
  vaultPpvs,
  selectedIds,
  onToggle,
  onClose,
}: {
  vaultPpvs: VaultPpv[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#161a22] border border-[#2a2d35] rounded-xl shadow-2xl w-full max-w-[720px] p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[15px] font-semibold text-white">Pick from Vault</h3>
            <p className="text-[11px] text-[#9ca3af] mt-0.5">
              {selectedIds.length} / {MAX_PPVS_PER_AR} selected · click a card to toggle
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#9ca3af] hover:text-white text-[22px] leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
          {vaultPpvs.map((p) => {
            const sel = selectedIds.includes(p.id);
            const disabled = !sel && selectedIds.length >= MAX_PPVS_PER_AR;
            return (
              <button
                key={p.id}
                onClick={() => !disabled && onToggle(p.id)}
                disabled={disabled}
                className={`relative aspect-square rounded-lg overflow-hidden bg-[#1f2937] border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  sel ? "border-[#00AFF0]" : "border-[#374151] hover:border-[#00AFF0]/50"
                }`}
              >
                {p.media_url ? (
                  /\.(mp4|mov|webm|m4v)(\?|$)/i.test(p.media_url) ? (
                    <video src={`/api/ppv/file/${p.id}`} muted className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/ppv/file/${p.id}`}
                      alt={p.name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[#6b7280] p-2 text-center">
                    {p.name}
                  </div>
                )}
                {sel && (
                  <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[#00AFF0] flex items-center justify-center shadow-lg">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 px-2 py-1 bg-gradient-to-t from-black/80 to-transparent">
                  <div className="text-[10px] text-white truncate">{p.name}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#00AFF0] hover:bg-[#0098D4] text-white rounded-lg text-[12px] font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
