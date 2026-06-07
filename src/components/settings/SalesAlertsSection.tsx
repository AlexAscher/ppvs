"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

type Settings = {
  alerts_enabled: boolean;
  alerts_ppv: boolean;
  alerts_tips: boolean;
  alerts_channel_id: string | null;
  alerts_channel_access_hash: string | null;
  alerts_channel_title: string | null;
  alerts_sender_model_id: string | null;
};

type ChannelOption = {
  id: string;
  access_hash: string;
  title: string;
  isAdmin: boolean;
};

type ModelLite = { id: string; name: string };

/**
 * Sales Alerts — agency Settings panel.
 *
 * UX:
 *   1. Pick a sender model (any connected one).
 *   2. Press "Load channels" → MTProto fetches the channels that
 *      sender session is a member of, populates the picker.
 *   3. Choose the alerts target channel + flip enabled.
 *   4. Optional "Send test" emits a dummy PPV alert.
 *
 * The picker stores channel_id + access_hash so we can send to private
 * channels without resolving by username every time.
 */
export function SalesAlertsSection() {
  const supabase = createClient();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [models, setModels] = useState<ModelLite[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [savingMsg, setSavingMsg] = useState("");
  const [testMsg, setTestMsg] = useState("");

  useEffect(() => {
    // Load current settings + the agency's models for the sender picker.
    void (async () => {
      const r1 = await fetch("/api/alerts/settings");
      const j1 = (await r1.json()) as { settings: Settings | null };
      const { data: { user } } = await supabase.auth.getUser();
      let modelList: ModelLite[] = [];
      if (user) {
        const { data } = await supabase
          .from("models")
          .select("id, name")
          .eq("agency_user_id", user.id);
        modelList = (data ?? []) as ModelLite[];
        setModels(modelList);
      }
      // Default-pick the first model into the picker so "Load channels"
      // works on first render (writes back only when user explicitly saves).
      setSettings(
        j1.settings && !j1.settings.alerts_sender_model_id && modelList.length
          ? { ...j1.settings, alerts_sender_model_id: modelList[0].id }
          : j1.settings,
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patch(patch: Partial<Settings>): Promise<void> {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSavingMsg("");
    const r = await fetch("/api/alerts/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setSavingMsg(`Error: ${j.error ?? "save failed"}`);
    } else {
      setSavingMsg("Saved ✓");
    }
  }

  async function loadChannels() {
    if (!settings?.alerts_sender_model_id) return;
    setLoadingChannels(true);
    setChannels([]);
    try {
      const r = await fetch(
        `/api/alerts/channels?modelId=${settings.alerts_sender_model_id}`,
      );
      const j = (await r.json()) as { channels?: ChannelOption[]; error?: string };
      if (j.channels) setChannels(j.channels);
      else if (j.error) setSavingMsg(`Error: ${j.error}`);
    } finally {
      setLoadingChannels(false);
    }
  }

  async function sendTest() {
    setTestMsg("Sending…");
    const r = await fetch("/api/alerts/test", { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setTestMsg(r.ok ? "Sent ✓" : `Error: ${j.error ?? "failed"}`);
  }

  if (!settings) return null;

  const card = "bg-[#161a22] border border-[#2a2d35] rounded-xl p-5 md:p-6";
  const label = "block text-[12px] text-[#9ca3af] mb-1.5 font-medium";
  const input =
    "w-full px-3.5 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1]";
  const btn =
    "px-5 py-2.5 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[12px] hover:from-[#5558e3] hover:to-[#4338ca] transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const btnSecondary =
    "px-4 py-2 bg-[#1f2937] border border-[#374151] text-white rounded-lg text-[12px] hover:bg-[#252b36] transition-all disabled:opacity-50";

  const channelSummary = settings.alerts_channel_title
    ? settings.alerts_channel_title
    : "— not picked —";

  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[15px] font-semibold text-white">Sales Alerts</h2>
          <p className="text-[12px] text-[#9ca3af] mt-0.5">
            Real-time TG messages when a PPV or tip is paid.
          </p>
        </div>
        <Switch
          checked={settings.alerts_enabled}
          onChange={(v) => patch({ alerts_enabled: v })}
        />
      </div>

      <div className="space-y-4">
        {/* Sender model picker */}
        <div>
          <label className={label}>Send from</label>
          <select
            className={input}
            value={settings.alerts_sender_model_id ?? ""}
            onChange={(e) =>
              patch({ alerts_sender_model_id: e.target.value || null })
            }
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
            {!models.length && <option value="">Connect a model first</option>}
          </select>
        </div>

        {/* Channel picker */}
        <div>
          <label className={label}>Alerts channel</label>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 px-3.5 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] text-white">
              {channelSummary}
            </div>
            <button
              className={btnSecondary}
              onClick={loadChannels}
              disabled={!settings.alerts_sender_model_id || loadingChannels}
            >
              {loadingChannels ? "Loading…" : "Pick channel"}
            </button>
          </div>
          {channels.length > 0 && (
            <div className="bg-[#0f131a] border border-[#2a2d35] rounded-lg p-1.5 max-h-[200px] overflow-y-auto">
              {channels.map((c) => (
                <button
                  key={c.id}
                  className="w-full text-left px-3 py-2 hover:bg-[#1f2937] rounded text-[13px] text-white flex items-center justify-between"
                  onClick={() => {
                    patch({
                      alerts_channel_id: c.id,
                      alerts_channel_access_hash: c.access_hash,
                      alerts_channel_title: c.title,
                    });
                    setChannels([]);
                  }}
                >
                  <span>{c.title}</span>
                  {c.isAdmin && (
                    <span className="text-[10px] text-[#6366f1] font-semibold uppercase tracking-wider">
                      admin
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-[#6b7280] mt-1.5">
            Create a private TG channel and add this model account as a member. The
            picker lists everything that sender account can write to.
          </p>
        </div>

        {/* Event toggles */}
        <div className="grid grid-cols-2 gap-3">
          <Checkbox
            label="PPV payments"
            checked={settings.alerts_ppv}
            onChange={(v) => patch({ alerts_ppv: v })}
          />
          <Checkbox
            label="Tips"
            checked={settings.alerts_tips}
            onChange={(v) => patch({ alerts_tips: v })}
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button className={btn} onClick={sendTest} disabled={!settings.alerts_enabled}>
            Send test
          </button>
          {testMsg && (
            <span
              className={`text-[11px] ${testMsg.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}
            >
              {testMsg}
            </span>
          )}
          {!testMsg && savingMsg && (
            <span
              className={`text-[11px] ${savingMsg.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}
            >
              {savingMsg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors ${
        checked ? "bg-[#6366f1]" : "bg-[#374151]"
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
          checked
            ? "bg-[#6366f1] border-[#6366f1]"
            : "bg-[#1f2937] border-[#374151]"
        }`}
      >
        {checked && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2 6L5 9L10 3"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      <span className="text-[13px] text-white">{label}</span>
    </label>
  );
}
