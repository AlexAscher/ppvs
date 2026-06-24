"use client";

import { useCallback, useEffect, useState } from "react";

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
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
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

// card2crypto providers shown in the picker. `min` is the provider's minimum
// USD (card2crypto enforces the real one; we use it to hide options the order
// is too small for). Slugs match CARD2CRYPTO_PROVIDERS on the server.
const C2C_PROVIDERS: { slug: string; label: string; min: number }[] = [
  { slug: "stripe", label: "Card · Stripe (US)", min: 2 },
  { slug: "rampnetwork", label: "Ramp", min: 4 },
  { slug: "robinhood", label: "Robinhood (US)", min: 5 },
  { slug: "paypal", label: "PayPal (US)", min: 5 },
  { slug: "revolut", label: "Revolut", min: 8 },
  { slug: "bitnovo", label: "Bitnovo · card", min: 10 },
  { slug: "sardine", label: "Sardine", min: 10 },
  { slug: "topper", label: "Topper", min: 10 },
  { slug: "binance", label: "Binance Pay", min: 15 },
  { slug: "transak", label: "Transak", min: 15 },
  { slug: "transfi", label: "TransFi", min: 15 },
  { slug: "utorg", label: "Utorg", min: 15 },
  { slug: "moonpay", label: "MoonPay", min: 20 },
  { slug: "banxa", label: "Banxa", min: 20 },
  { slug: "simplex", label: "Simplex", min: 20 },
];

export default function MiniAppPage() {
  const [boot, setBoot] = useState<InitResponse | null>(null);
  const [bootError, setBootError] = useState("");
  const [state, setState] = useState<"locked" | "providers" | "loading" | "ready" | "waiting" | "delivered" | "error">("locked");
  const [errMsg, setErrMsg] = useState("");
  const [email, setEmail] = useState("");
  // Hosted checkout URL from Malum. Held so the "ready" screen can offer BOTH
  // an in-webview "Pay now" (stays inside the Mini App) and an "Open in
  // browser" fallback (for gateways whose page hangs inside the webview).
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  // Poll /api/mini/init until the webhook flips the order to paid/delivered,
  // then flip the screen. The webhook delivers the PPV/tip server-side
  // regardless, so even if the fan closes the app the content still lands in
  // their Telegram chat. Stable (useCallback) so the boot effect can depend on
  // it without re-running.
  const pollUntilPaid = useCallback(async () => {
    const tg = window.Telegram?.WebApp;
    const initData = tg?.initData ?? "";
    const url = new URL(window.location.href);
    const startParam = tg?.initDataUnsafe?.start_param ?? url.searchParams.get("code") ?? "";
    const deadline = Date.now() + 10 * 60_000; // give up after 10 min
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      try {
        const r = await fetch("/api/mini/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData, startParam }),
        });
        const j = (await r.json().catch(() => ({}))) as { status?: string };
        if (j.status === "paid" || j.status === "delivered") {
          tg?.HapticFeedback?.notificationOccurred?.("success");
          setState("delivered");
          return;
        }
      } catch {
        /* transient — keep polling */
      }
    }
  }, []);

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
          const s = (j as InitResponse).status;
          if (s === "delivered" || s === "paid") {
            setState("delivered");
          } else if (url.searchParams.get("paid") === "1") {
            // We just came back from the Malum checkout (success_url). The
            // webhook may not have flipped the order yet — show the waiting
            // screen and poll until it lands as paid/delivered.
            setState("waiting");
            void pollUntilPaid();
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
  }, [pollUntilPaid]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function handlePay(gateway: "card2crypto" | "malum", provider?: string) {
    if (!boot) return;
    if (!emailValid) {
      setErrMsg("Enter a valid email for your receipt.");
      return;
    }
    const tg = window.Telegram?.WebApp;
    tg?.HapticFeedback?.impactOccurred?.("medium");
    setState("loading");
    setErrMsg("");
    try {
      // Both gateways resolve by code; the webhook settles + delivers. We open
      // the hosted page and poll for completion. card2crypto pays the agency's
      // 90% directly (auto), Malum pools to the platform. `source: "mini"` (Malum
      // only) returns the buyer into /mini; card2crypto's page has no return URL.
      const endpoint =
        gateway === "card2crypto"
          ? "/api/payments/card2crypto/create"
          : "/api/payments/malum/create";
      const payload =
        gateway === "card2crypto"
          ? { code: boot.code, email: email.trim().toLowerCase(), provider }
          : { code: boot.code, email: email.trim().toLowerCase(), source: "mini" };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || data.error || !data.url) {
        tg?.HapticFeedback?.notificationOccurred?.("error");
        setErrMsg(data.error || `HTTP ${res.status}`);
        setState("error");
        return;
      }
      // Show the "ready" screen with two ways to pay: in-webview (stays inside
      // the Mini App) or open-in-browser (fallback for gateways that hang in
      // the webview, e.g. Stix). We can't auto-navigate AND keep a fallback
      // button — once the webview navigates away our UI is gone — so we let
      // the buyer choose here.
      setCheckoutUrl(data.url);
      setState("ready");
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
          <div className="inline-block w-8 h-8 border-2 border-[#374151] border-t-[#00AFF0] rounded-full animate-spin" />
        </div>
      </Shell>
    );
  }

  if (state === "delivered") return <DeliveredScreen boot={boot} />;

  if (state === "ready" && checkoutUrl) {
    const url = checkoutUrl;
    const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
    return (
      <Shell>
        <div className="px-4 py-10 text-center">
          <div className="text-[40px] mb-3">💳</div>
          <div className="text-[16px] font-semibold text-white mb-2">Your payment is ready</div>
          <div className="text-[13px] text-[#9ca3af] max-w-[320px] mx-auto leading-relaxed mb-6">
            Tap “Pay now” to pay here. If the payment page doesn’t load, use “Open
            in browser”. Your {boot.kind === "tip" ? "tip" : "content"} arrives in
            this chat once payment is confirmed.
          </div>
          {/* Primary: navigate the Mini App's own webview to the checkout. */}
          <button
            onClick={() => {
              tg?.HapticFeedback?.impactOccurred?.("medium");
              window.location.href = url;
            }}
            className="w-full py-3.5 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] rounded-xl text-white font-semibold text-[15px] active:scale-[0.98] transition-all mb-3"
          >
            💳 Pay now
          </button>
          {/* Fallback: open in an external browser, then poll for the webhook. */}
          <button
            onClick={() => {
              if (tg?.openLink) tg.openLink(url);
              else window.open(url, "_blank");
              setState("waiting");
              void pollUntilPaid();
            }}
            className="w-full py-3 bg-[#161b22] border border-[#30363d] rounded-xl text-[#9ca3af] font-medium text-[13px] active:scale-[0.98] transition-all"
          >
            Open in browser ↗
          </button>
        </div>
      </Shell>
    );
  }

  if (state === "providers") {
    const price = boot.basePrice;
    const eligible = C2C_PROVIDERS.filter((p) => price >= p.min);
    const list = eligible.length > 0 ? eligible : C2C_PROVIDERS.slice(0, 1);
    return (
      <Shell>
        <div className="px-4 py-6">
          <div className="text-center mb-4">
            <div className="text-[18px] font-bold text-white mb-1">Choose payment method</div>
            <div className="text-[12px] text-[#9ca3af]">
              Pay by card · ${price.toFixed(2)} — a small provider fee is added at checkout.
            </div>
          </div>
          <div className="space-y-2">
            {list.map((p) => (
              <button
                key={p.slug}
                onClick={() => handlePay("card2crypto", p.slug)}
                className="w-full py-3 px-4 bg-[#161b22] border border-[#30363d] rounded-xl text-white text-[14px] font-medium text-left hover:border-[#00AFF0] transition-all active:scale-[0.98] flex items-center justify-between"
              >
                <span>{p.label}</span>
                <span className="text-[#6b7280] text-[12px]">→</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setState("locked")}
            className="w-full py-2.5 mt-3 text-[#9ca3af] text-[13px]"
          >
            ← Back
          </button>
          {errMsg && <div className="text-[12px] text-red-400 text-center mt-2">{errMsg}</div>}
        </div>
      </Shell>
    );
  }

  if (state === "loading") {
    return (
      <Shell>
        <div className="px-4 py-12 text-center">
          <div className="inline-block w-8 h-8 border-2 border-[#374151] border-t-[#00AFF0] rounded-full animate-spin mb-4" />
          <div className="text-[14px] text-[#9ca3af]">Opening checkout…</div>
        </div>
      </Shell>
    );
  }

  if (state === "waiting") {
    return (
      <Shell>
        <div className="px-4 py-12 text-center">
          <div className="inline-block w-8 h-8 border-2 border-[#374151] border-t-[#00AFF0] rounded-full animate-spin mb-4" />
          <div className="text-[15px] font-semibold text-white mb-1">Waiting for payment…</div>
          <div className="text-[13px] text-[#9ca3af] max-w-[320px] mx-auto leading-relaxed">
            Finish the payment in the page that just opened. Your{" "}
            {boot.kind === "tip" ? "tip" : "content"} arrives right here in this chat once it&apos;s confirmed.
          </div>
        </div>
      </Shell>
    );
  }

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
                {itemCount > 1 ? <span className="text-[#00AFF0]">({itemCount})</span> : null}
              </div>
            </>
          ) : (
            <>
              <div className="text-[28px] mb-1">💎</div>
              <div className="text-[18px] font-bold text-white">Send a tip</div>
            </>
          )}
          {/* The chatter's caption is intentionally NOT shown in the Mini
              App — it already went out with the chat message; repeating it on
              the checkout looks like a duplicate/leak. Applies to PPV + tip. */}
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

        {/* No price breakdown here: the Mini App shows only the chatter's
            base price (on the Unlock button). The gateway fee is added and
            itemised on the Malum checkout page itself, so we don't duplicate
            a "service fee" line in the app. */}

        {/* Email — required by the payment provider for the receipt. */}
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email for your receipt"
          className="w-full px-4 py-3 mb-3 bg-[#161b22] border border-[#30363d] rounded-xl text-[14px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#00AFF0]"
        />

        {/* Pay buttons — buyer picks a gateway. card2crypto is the primary
            (clean card UX); Malum is the alternative. */}
        <button
          onClick={() => {
            if (!emailValid) {
              setErrMsg("Enter a valid email for your receipt.");
              return;
            }
            setErrMsg("");
            setState("providers");
          }}
          disabled={!emailValid}
          className="w-full py-3.5 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] rounded-xl text-white font-semibold text-[15px] disabled:opacity-60 transition-all active:scale-[0.98]"
        >
          {boot.kind === "ppv"
            ? `💳 Pay by card · $${boot.basePrice.toFixed(2)}`
            : `💳 Send tip by card · $${boot.basePrice.toFixed(2)}`}
        </button>
        <button
          onClick={() => handlePay("malum")}
          disabled={!emailValid}
          className="w-full py-3 mt-2 bg-[#161b22] border border-[#30363d] rounded-xl text-[#9ca3af] font-medium text-[13px] disabled:opacity-60 transition-all active:scale-[0.98]"
        >
          Other payment options
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
