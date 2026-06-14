"use client";

import { useEffect, useState } from "react";

/**
 * /mini — Telegram Mini App entry.
 *
 * Loaded by Telegram inside its native WebView when a fan taps a
 * `t.me/{bot}/{app}?startapp=<code>` link. The Mini App SDK exposes:
 *   - window.Telegram.WebApp.initData     (raw URL-encoded payload,
 *     verified server-side via HMAC + bot token)
 *   - window.Telegram.WebApp.initDataUnsafe.start_param (the code)
 *
 * We deliberately keep the UI brand-neutral here: there is no "ppvs.io"
 * branding, no platform logo. The fan only sees the model's content
 * preview + a Pay button.
 *
 * On Pay we hit the same /api/ppv/deliver as the legacy web flow — the
 * Mini App is a transport, not a separate payment system.
 */

type InitResponse =
  | {
      kind: "ppv";
      code: string;
      items: { name: string; media_url: string | null }[];
      basePrice: number;
      total: number;
      caption: string;
      recipient: string | null;
      status: string;
      trusted: boolean;
    }
  | {
      kind: "tip";
      code: string;
      basePrice: number;
      total: number;
      caption: string;
      recipient: string | null;
      /** The creator/model's @ — shown on the success receipt. Distinct
       *  from `recipient`, which is the FAN the tip-link was sent to. */
      creatorUsername: string | null;
      status: string;
      trusted: boolean;
    };

type TGWebApp = {
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  initData?: string;
  initDataUnsafe?: { start_param?: string };
  themeParams?: { bg_color?: string };
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred?: (style: "success" | "warning" | "error") => void;
  };
  MainButton?: {
    setText?: (t: string) => void;
    show?: () => void;
    hide?: () => void;
    onClick?: (cb: () => void) => void;
    offClick?: (cb: () => void) => void;
    enable?: () => void;
    disable?: () => void;
    showProgress?: (leaveActive?: boolean) => void;
    hideProgress?: () => void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TGWebApp };
  }
}

export default function MiniAppPage() {
  const [boot, setBoot] = useState<InitResponse | null>(null);
  const [bootError, setBootError] = useState("");
  const [state, setState] = useState<"locked" | "loading" | "delivered" | "error">("locked");
  const [errMsg, setErrMsg] = useState("");

  // Boot: load the TG SDK script, then call /api/mini/init with initData.
  useEffect(() => {
    let cancelled = false;
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.onload = () => {
      const tg = window.Telegram?.WebApp;
      tg?.ready?.();
      tg?.expand?.();

      const initData = tg?.initData ?? "";
      // Fallback when running outside TG (local testing): allow ?code= in URL.
      const url = new URL(window.location.href);
      const fallbackCode = url.searchParams.get("code") ?? "";
      const startParam = tg?.initDataUnsafe?.start_param ?? fallbackCode;

      if (!startParam) {
        if (!cancelled) setBootError("Open this app from a chat link.");
        return;
      }

      void fetch("/api/mini/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, startParam }),
      })
        .then(async (r) => {
          const j = (await r.json().catch(() => ({}))) as
            | InitResponse
            | { error?: string };
          if (!r.ok || "error" in j) {
            if (!cancelled)
              setBootError(("error" in j && j.error) || `HTTP ${r.status}`);
            return;
          }
          if (cancelled) return;
          setBoot(j as InitResponse);
          if ((j as InitResponse).status === "delivered" || (j as InitResponse).status === "paid") {
            setState("delivered");
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) setBootError(e instanceof Error ? e.message : "Network");
        });
    };
    document.body.appendChild(script);
    return () => {
      cancelled = true;
      script.remove();
    };
  }, []);

  async function handlePay() {
    if (!boot) return;
    const tg = window.Telegram?.WebApp;
    tg?.HapticFeedback?.impactOccurred?.("medium");
    setState("loading");
    setErrMsg("");
    try {
      // PPV vs tip dispatch via the existing legacy endpoints — no
      // separate Mini App payment system; this is a transport wrap.
      const url = boot.kind === "ppv" ? "/api/ppv/deliver" : "/api/tips/deliver";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: boot.code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || data.error) {
        tg?.HapticFeedback?.notificationOccurred?.("error");
        setErrMsg(data.error || `HTTP ${res.status}`);
        setState("error");
        return;
      }
      tg?.HapticFeedback?.notificationOccurred?.("success");
      setState("delivered");
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : "Network error");
      setState("error");
    }
  }

  if (bootError) {
    return (
      <Shell>
        <div className="text-center py-12 px-4">
          <div className="text-[40px] mb-3">⚠️</div>
          <div className="text-[14px] text-[#9ca3af]">{bootError}</div>
        </div>
      </Shell>
    );
  }

  if (!boot) {
    return (
      <Shell>
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-2 border-[#374151] border-t-[#6366f1] rounded-full animate-spin" />
        </div>
      </Shell>
    );
  }

  if (state === "delivered") return <DeliveredScreen boot={boot} />;

  // ── Locked: preview + Pay button ────────────────────────────────────
  const itemCount = boot.kind === "ppv" ? boot.items.length : 1;

  return (
    <Shell>
      <div className="px-4 py-6">
        {/* Header */}
        <div className="text-center mb-5">
          {boot.kind === "ppv" ? (
            <>
              <div className="text-[28px] mb-1">🔒</div>
              <div className="text-[18px] font-bold text-white">
                Private content{" "}
                {itemCount > 1 ? <span className="text-[#6366f1]">({itemCount})</span> : null}
              </div>
            </>
          ) : (
            <>
              <div className="text-[28px] mb-1">💎</div>
              <div className="text-[18px] font-bold text-white">Send a tip</div>
            </>
          )}
          {boot.kind !== "tip" && boot.caption && (
            <div className="text-[13px] text-[#9ca3af] mt-2 max-w-[400px] mx-auto">
              {boot.caption}
            </div>
          )}
        </div>

        {/* Preview tiles (PPV only) */}
        {boot.kind === "ppv" && (
          <div
            className={`grid gap-2 mb-5 ${
              boot.items.length === 1
                ? "grid-cols-1"
                : boot.items.length === 2
                  ? "grid-cols-2"
                  : "grid-cols-3"
            }`}
          >
            {boot.items.map((it, i) => (
              <div
                key={i}
                className="relative aspect-square bg-[#1f2937] rounded-lg overflow-hidden flex items-center justify-center"
              >
                {it.media_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.media_url}
                    alt={it.name}
                    className="w-full h-full object-cover"
                    style={{ filter: "blur(10px)" }}
                  />
                ) : (
                  <div className="text-[#374151] text-[32px]">🔒</div>
                )}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="w-8 h-8 bg-black/60 rounded-full flex items-center justify-center">
                    <span className="text-[16px]">🔒</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Price breakdown — show ONLY for PPV (tips have no platform fee
            so basePrice === total there, would just be visual noise). The
            fan sees one chatter-set base price + 10% service fee + total
            so the difference between the chat caption price ($15) and the
            checkout total ($16.50) is no longer mysterious. */}
        {boot.kind === "ppv" && boot.total > boot.basePrice && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-3 mb-4 space-y-2">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[#9ca3af]">Content</span>
              <span className="text-white font-medium">${boot.basePrice.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[#9ca3af]">Service fee (10%)</span>
              <span className="text-white font-medium">
                ${(boot.total - boot.basePrice).toFixed(2)}
              </span>
            </div>
            <div className="border-t border-[#30363d] pt-2 mt-1 flex items-center justify-between">
              <span className="text-[14px] font-semibold text-white">Total</span>
              <span className="text-[18px] font-bold text-[#6366f1]">
                ${boot.total.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Pay button */}
        <button
          onClick={handlePay}
          disabled={state === "loading"}
          className="w-full py-3.5 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] rounded-xl text-white font-semibold text-[15px] disabled:opacity-60 transition-all active:scale-[0.98]"
        >
          {state === "loading"
            ? "Processing…"
            : boot.kind === "ppv"
              ? `🔓 Unlock for $${boot.total.toFixed(2)}`
              : `💸 Send tip $${boot.total.toFixed(2)}`}
        </button>

        {errMsg && (
          <div className="text-[12px] text-red-400 text-center mt-3">{errMsg}</div>
        )}

        <div className="text-[10px] text-[#6b7280] text-center mt-5">
          Secure checkout · payment provider · refund within 24h
        </div>
      </div>
    </Shell>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-[#0d1117] text-white"
      // Make sure the page covers Telegram's safe-area inset on iPhone X+
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="max-w-[480px] mx-auto">{children}</div>
    </div>
  );
}

function DeliveredScreen({ boot }: { boot: InitResponse }) {
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
  // PPV success: "Content is flying to YOUR chat" — `recipient` is the
  // buyer's own handle, which is correct here.
  // Tip success: "Tip delivered to @CREATOR" — we use the model's @, not
  // the buyer's, otherwise the receipt reads as if the buyer tipped
  // themselves. Falls back to a generic line when the @ isn't set.
  const ppvLine = `Content is flying to your Telegram chat${
    boot.kind === "ppv" && boot.recipient ? ` @${boot.recipient}` : ""
  } 💌`;
  const tipCreator = boot.kind === "tip" ? boot.creatorUsername : null;
  const tipLine = tipCreator
    ? `Tip delivered to @${tipCreator} — they'll be smiling 🥰`
    : `Tip delivered — they'll be smiling 🥰`;

  return (
    <Shell>
      <div className="text-center px-4 py-10">
        <div className="relative inline-block mb-5">
          <div className="text-[64px] animate-bounce">🚀</div>
          <div className="absolute -top-2 -right-2 text-[20px] animate-pulse">✨</div>
          <div className="absolute -bottom-1 -left-3 text-[18px] animate-pulse">💖</div>
        </div>
        <div className="text-[22px] font-bold text-white mb-2">Payment received 🎉</div>
        <div className="text-[13px] text-[#9ca3af] mb-6">
          {boot.kind === "ppv" ? ppvLine : tipLine}
        </div>
        <button
          onClick={() => tg?.close?.()}
          className="px-5 py-3 bg-[#1f2937] border border-[#374151] rounded-xl text-white text-[13px] font-semibold"
        >
          Close
        </button>
      </div>
    </Shell>
  );
}
