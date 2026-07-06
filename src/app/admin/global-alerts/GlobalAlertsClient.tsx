"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Status = {
  connected: boolean;
  enabled: boolean;
  botUsername: string | null;
};

/**
 * /admin/global-alerts — platform-owner Sales Alerts channel.
 *
 * Connect flow mirrors the per-agency Sales Alerts UX: tap Connect →
 * open t.me/<bot>?start=admin_<code> → we poll status until the bot
 * writes bot_chat_id via /start. Notifications fan out to every
 * connected admin on every sale, independent of the agency.
 */
export function GlobalAlertsClient({ adminEmail }: { adminEmail: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [msg, setMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void refresh();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function refresh(): Promise<Status | null> {
    const r = await fetch("/api/admin/global-alerts");
    if (!r.ok) return null;
    const j = (await r.json()) as Status;
    setStatus(j);
    return j;
  }

  async function connect() {
    setConnecting(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/global-alerts", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { link?: string; error?: string };
      if (!r.ok || !j.link) {
        setMsg(`Error: ${j.error ?? "could not start"}`);
        setConnecting(false);
        return;
      }
      window.open(j.link, "_blank");
      let ticks = 0;
      pollRef.current = setInterval(async () => {
        ticks += 1;
        const s = await refresh();
        if (s?.connected || ticks > 40) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setConnecting(false);
        }
      }, 3000);
    } catch {
      setMsg("Error: network");
      setConnecting(false);
    }
  }

  async function disconnect() {
    await fetch("/api/admin/global-alerts", { method: "DELETE" });
    await refresh();
  }

  if (!status) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center text-[#9ca3af] text-[13px]">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] p-6">
      <div className="max-w-[720px] mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="text-[13px] text-[#9ca3af] hover:text-white transition-colors"
          >
            ← Back to Admin
          </Link>
        </div>

        <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl p-6">
          <h1 className="text-[18px] font-semibold text-white mb-1">
            Global Sales Alerts 💰
          </h1>
          <p className="text-[13px] text-[#9ca3af] mt-1">
            Get a Telegram DM every time <span className="text-white">any</span>{" "}
            agency on the platform records a PPV or tip sale. Connected as{" "}
            <span className="text-white">{adminEmail}</span>.
          </p>

          <div className="mt-5 bg-[#0f131a] border border-[#2a2d35] rounded-lg p-4">
            {status.connected ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] text-emerald-400 font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Connected — alerts go to your Telegram
                </div>
                <button
                  onClick={disconnect}
                  className="px-4 py-2 bg-[#1f2937] border border-[#374151] text-white rounded-lg text-[12px] hover:bg-[#252b36]"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[13px] text-[#9ca3af]">
                  {connecting
                    ? "Waiting — tap Start in the Telegram chat that just opened…"
                    : status.botUsername
                      ? `Link @${status.botUsername} to this admin account so it can DM you every sale.`
                      : "Notifications bot is not configured — set TELEGRAM_BOT_TOKEN."}
                </div>
                <button
                  onClick={connect}
                  disabled={connecting || !status.botUsername}
                  className="px-5 py-2.5 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] text-white rounded-lg font-semibold text-[12px] hover:from-[#0098D4] hover:to-[#0098D4] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {connecting ? "Waiting…" : "Connect"}
                </button>
              </div>
            )}
          </div>

          {msg && (
            <p className="text-[11px] text-red-400 mt-3">
              {msg}
            </p>
          )}

          <p className="text-[11px] text-[#6b7280] mt-4 leading-relaxed">
            Fan-out is fire-and-forget: an agency&apos;s own Sales Alerts keep
            working exactly as before, and platform-owner alerts are appended
            on top. Failure to deliver here never blocks the sale itself.
          </p>
        </div>
      </div>
    </div>
  );
}
