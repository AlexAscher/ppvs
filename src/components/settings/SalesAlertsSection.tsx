"use client";

import { useEffect, useRef, useState } from "react";
import { Toggle } from "@/components/ui/Toggle";

type Settings = {
  alerts_enabled: boolean;
  alerts_ppv: boolean;
  alerts_tips: boolean;
  alerts_bot_connected?: boolean;
};

/**
 * Sales Alerts — agency Settings panel (bot delivery).
 *
 * Flow:
 *   1. Toggle alerts on.
 *   2. Tap "Connect" → opens t.me/<bot>?start=<code> in Telegram. The
 *      agency taps Start with their PERSONAL account; the bot poller binds
 *      their chat_id. We poll settings until alerts_bot_connected flips.
 *   3. Pick PPV / Tips. Optional "Send test".
 *
 * No userbot, no channel, no ban risk — a plain Telegram bot DMs the
 * agency, and chatters on model accounts never see it.
 */
export function SalesAlertsSection() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savingMsg, setSavingMsg] = useState("");
  const [testMsg, setTestMsg] = useState("");
  const [connecting, setConnecting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void refresh();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function refresh(): Promise<Settings | null> {
    const r = await fetch("/api/alerts/settings");
    const j = (await r.json()) as { settings: Settings | null };
    setSettings(j.settings);
    return j.settings;
  }

  async function patch(p: Partial<Settings>): Promise<void> {
    if (!settings) return;
    setSettings({ ...settings, ...p });
    setSavingMsg("");
    const r = await fetch("/api/alerts/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setSavingMsg(`Error: ${j.error ?? "save failed"}`);
    } else {
      setSavingMsg("Saved ✓");
    }
  }

  async function connect() {
    setConnecting(true);
    setSavingMsg("");
    try {
      const r = await fetch("/api/alerts/connect", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { link?: string; error?: string };
      if (!r.ok || !j.link) {
        setSavingMsg(`Error: ${j.error ?? "could not start"}`);
        setConnecting(false);
        return;
      }
      // Open the deep link so the agency taps Start in Telegram.
      window.open(j.link, "_blank");
      // Poll until the bot binds the chat_id (up to ~2 min).
      let ticks = 0;
      pollRef.current = setInterval(async () => {
        ticks += 1;
        const s = await refresh();
        if (s?.alerts_bot_connected || ticks > 40) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setConnecting(false);
        }
      }, 3000);
    } catch {
      setSavingMsg("Error: network");
      setConnecting(false);
    }
  }

  async function disconnect() {
    await fetch("/api/alerts/connect", { method: "DELETE" });
    await refresh();
  }

  async function sendTest() {
    setTestMsg("Sending…");
    const r = await fetch("/api/alerts/test", { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setTestMsg(r.ok ? "Sent ✓ — check your Telegram" : `Error: ${j.error ?? "failed"}`);
  }

  if (!settings) return null;

  const card = "bg-[#161a22] border border-[#2a2d35] rounded-xl p-5 md:p-6";
  const btn =
    "px-5 py-2.5 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] text-white rounded-lg font-semibold text-[12px] hover:from-[#0098D4] hover:to-[#0098D4] transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const btnGhost =
    "px-4 py-2 bg-[#1f2937] border border-[#374151] text-white rounded-lg text-[12px] hover:bg-[#252b36] transition-all";

  const connected = !!settings.alerts_bot_connected;

  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[15px] font-semibold text-white">Sales Alerts</h2>
          <p className="text-[12px] text-[#9ca3af] mt-0.5">
            Get a Telegram message the instant a PPV or tip is paid — straight to
            your personal account, private from your chatters.
          </p>
        </div>
        <Toggle
          checked={settings.alerts_enabled}
          onChange={(v) => patch({ alerts_enabled: v })}
          ariaLabel="Toggle Sales Alerts"
        />
      </div>

      <div className="space-y-4">
        {/* Connection */}
        <div className="bg-[#0f131a] border border-[#2a2d35] rounded-lg p-3">
          {connected ? (
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] text-emerald-400 font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Connected — alerts go to your Telegram
              </div>
              <button className={btnGhost} onClick={disconnect}>
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[13px] text-[#9ca3af]">
                {connecting
                  ? "Waiting — tap Start in the Telegram chat that just opened…"
                  : "Link your Telegram so the bot can DM you."}
              </div>
              <button className={btn} onClick={connect} disabled={connecting}>
                {connecting ? "Waiting…" : "Connect"}
              </button>
            </div>
          )}
        </div>

        {/* Event toggles */}
        <div className="grid grid-cols-2 gap-3">
          <Checkbox label="PPV payments" checked={settings.alerts_ppv} onChange={(v) => patch({ alerts_ppv: v })} />
          <Checkbox label="Tips" checked={settings.alerts_tips} onChange={(v) => patch({ alerts_tips: v })} />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button className={btn} onClick={sendTest} disabled={!settings.alerts_enabled || !connected}>
            Send test
          </button>
          {(testMsg || savingMsg) && (
            <span
              className={`text-[11px] ${
                (testMsg || savingMsg).startsWith("Error") ? "text-red-400" : "text-emerald-400"
              }`}
            >
              {testMsg || savingMsg}
            </span>
          )}
        </div>
      </div>
    </div>
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
          checked ? "bg-[#00AFF0] border-[#00AFF0]" : "bg-[#1f2937] border-[#374151]"
        }`}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span className="text-[13px] text-white">{label}</span>
    </label>
  );
}
