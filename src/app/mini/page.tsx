"use client";

import { useEffect, useState } from "react";

/**
 * /mini — Telegram Mini App entry.
 *
 * Loaded by Telegram inside its native WebView when a fan taps a
 * `t.me/{bot}/{app}?startapp=<code>` link. The Mini App SDK exposes:
 *   - window.Telegram.WebApp.initData    (raw URL-encoded payload, verified
 *     server-side via HMAC + bot token)
 *   - window.Telegram.WebApp.initDataUnsafe.start_param (the pay code)
 *
 * Brand-neutral UI: no ppvs.io branding, no platform logo. The fan only
 * sees the model's content preview + a Pay button.
 *
 * STATE (batch 54): we removed the Malum + card2crypto gateways and are
 * migrating to Telegram Stars (batch 55). For now the Pay button is a
 * disabled placeholder so fans see a clean "coming soon" instead of a
 * broken checkout.
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
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TGWebApp };
  }
}

export default function MiniAppPage() {
  const [boot, setBoot] = useState<InitResponse | null>(null);
  const [bootError, setBootError] = useState("");

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
          if (!cancelled) setBoot(j as InitResponse);
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
          <div className="inline-block w-8 h-8 border-2 border-[#374151] border-t-[#00AFF0] rounded-full animate-spin" />
        </div>
      </Shell>
    );
  }

  // Locked screen — preview + disabled Stars CTA.
  const itemCount = boot.kind === "ppv" ? boot.items.length : 1;

  return (
    <Shell>
      <div className="px-4 py-6">
        <div className="text-center mb-5">
          {boot.kind === "ppv" ? (
            <>
              <div className="text-[28px] mb-1">🔒</div>
              <div className="text-[18px] font-bold text-white">
                Private content{" "}
                {itemCount > 1 ? <span className="text-[#00AFF0]">({itemCount})</span> : null}
              </div>
            </>
          ) : (
            <>
              <div className="text-[28px] mb-1">💎</div>
              <div className="text-[18px] font-bold text-white">Send a tip</div>
            </>
          )}
        </div>

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

        {/* Stars placeholder — actual sendInvoice(XTR) flow lands in batch 55.
            Disabled so a fan can't trigger a broken checkout in the meantime. */}
        <button
          disabled
          className="w-full py-3.5 bg-[#1f2937] border border-[#30363d] rounded-xl text-[#6b7280] font-semibold text-[15px] cursor-not-allowed"
        >
          ⭐ Pay with Telegram Stars · ${boot.basePrice.toFixed(2)}
        </button>
        <div className="text-[11px] text-[#6b7280] text-center mt-2">
          Payments are being upgraded — back online very soon.
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-[#0d1117] text-white"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="max-w-[480px] mx-auto">{children}</div>
    </div>
  );
}
