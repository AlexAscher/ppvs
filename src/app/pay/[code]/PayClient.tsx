"use client";

import { useState } from "react";

type Item = { name: string; media_url: string | null };

type Props = {
  code: string;
  items: Item[];
  /** Chatter's price — what the agency expects to receive. */
  basePrice: number;
  /** Platform's 10% surcharge. Buyer pays it on top.
   *  Currently unused (Malum bypassed) but kept on the prop boundary so
   *  re-enabling the gateway is just an uncomment. */
  fee: number;
  /** basePrice + fee. Used while Malum is active to mirror the checkout
   *  total exactly. */
  total: number;
  caption: string;
  recipient: string | null;
  initiallyDelivered: boolean;
};

export function PayClient({
  code,
  items,
  basePrice,
  caption,
  recipient,
  initiallyDelivered,
}: Props) {
  const [state, setState] = useState<"locked" | "loading" | "delivered" | "error">(
    initiallyDelivered ? "delivered" : "locked",
  );
  const [errMsg, setErrMsg] = useState("");

  async function handlePay() {
    setState("loading");
    setErrMsg("");
    // Malum disabled — unlock directly via /api/ppv/deliver. The server marks
    // the send paid and kicks off the Telegram push in the background. We
    // intentionally DON'T render the unlocked URLs here: the fan sees a
    // playful "content is flying to your Telegram" screen instead.
    try {
      const res = await fetch("/api/ppv/deliver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || data.error) {
        setErrMsg(data.error || `HTTP ${res.status}`);
        setState("error");
        return;
      }
      setState("delivered");
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : "Network error");
      setState("error");
    }
  }

  // ── Delivered: playful "flying to Telegram" screen ────────────────────────
  if (state === "delivered") {
    return <DeliveredScreen itemCount={items.length} recipient={recipient} />;
  }

  // ── Locked: preview tiles + Pay button ────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center px-3 sm:px-4 bg-[#0d1117] py-6 sm:py-10">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(99,102,241,0.07) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 w-full max-w-[520px]">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#4f46e5] flex items-center justify-center text-white font-bold text-[15px]">
            P
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#e6edf3", letterSpacing: "-0.02em" }}>
            ppvs<span style={{ color: "#6366f1" }}>.io</span>
          </span>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-[16px] overflow-hidden">
          {/* Preview grid — all locked, blurred. */}
          <div className="p-3">
            <div
              className={`grid gap-2 ${
                items.length === 1
                  ? "grid-cols-1"
                  : items.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-3"
              }`}
            >
              {items.map((it, i) => (
                <div
                  key={i}
                  className="relative aspect-square rounded-md overflow-hidden bg-gradient-to-br from-[#1f2937] to-[#111827] border border-[#30363d] flex items-center justify-center"
                >
                  <span className="text-[28px] opacity-40 select-none">🔒</span>
                  {it.media_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.media_url}
                      alt={it.name}
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ filter: "blur(22px) brightness(0.55)", transform: "scale(1.15)" }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-9 h-9 rounded-full bg-black/55 border border-white/10 flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 pb-5">
            {recipient && <div className="text-[12px] text-[#8b949e] mb-1">For @{recipient}</div>}
            <div className="text-[15px] font-semibold mb-1" style={{ color: "#e6edf3" }}>
              {items.length} {items.length === 1 ? "item" : "items"} locked
            </div>
            {caption.trim() && (
              <div className="text-[12px] text-[#9ca3af] mb-3 whitespace-pre-wrap">{caption}</div>
            )}

            <div className="flex items-baseline gap-1.5 mb-4 mt-2">
              <span style={{ fontSize: 32, fontWeight: 800, color: "#6366f1", letterSpacing: "-0.03em" }}>
                ${basePrice.toFixed(2)}
              </span>
              <span style={{ fontSize: 13, color: "#8b949e" }}>one-time unlock</span>
            </div>

            {state === "error" && (
              <div className="mb-3 bg-red-500/10 border border-red-500/20 rounded-[8px] px-3.5 py-2.5 text-[12px] text-red-400">
                {errMsg}
              </div>
            )}

            <button
              onClick={handlePay}
              disabled={state === "loading"}
              className="w-full py-[13px] rounded-[10px] text-[14px] font-semibold transition-all border-none cursor-pointer"
              style={{ background: state === "loading" ? "#6366f160" : "#6366f1", color: "white" }}
            >
              {state === "loading" ? "Unlocking..." : `Pay $${basePrice.toFixed(2)} & Unlock`}
            </button>

            <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "#484f58" }}>
              Payment gateway temporarily disabled — clicking Pay unlocks content for testing.
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#484f58" }}>
          Powered by ppvs.io · Telegram PPV platform
        </div>
      </div>
    </div>
  );
}

// ── Delivered "flying to Telegram" screen ───────────────────────────────────

function DeliveredScreen({
  itemCount,
  recipient,
}: {
  itemCount: number;
  recipient: string | null;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-3 sm:px-4 bg-[#0d1117] py-6 sm:py-10 relative overflow-hidden">
      {/* Animated radial glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 30%, rgba(99,102,241,0.15) 0%, transparent 70%)",
        }}
      />

      {/* Floating sparkle confetti — pure CSS, no library */}
      <div className="pointer-events-none fixed inset-0 z-0 select-none">
        {[
          { l: "8%", t: "12%", d: "0s", e: "✨" },
          { l: "82%", t: "20%", d: "0.6s", e: "💖" },
          { l: "15%", t: "75%", d: "1.2s", e: "💫" },
          { l: "75%", t: "65%", d: "1.8s", e: "🌟" },
          { l: "92%", t: "45%", d: "2.4s", e: "✨" },
          { l: "5%", t: "45%", d: "3.0s", e: "💫" },
        ].map((s, i) => (
          <span
            key={i}
            className="absolute text-[22px]"
            style={{
              left: s.l,
              top: s.t,
              animation: `floaty 4s ease-in-out ${s.d} infinite`,
              opacity: 0.7,
            }}
          >
            {s.e}
          </span>
        ))}
      </div>

      <style>{`
        @keyframes floaty {
          0%,100% { transform: translateY(0) rotate(-6deg); }
          50%     { transform: translateY(-14px) rotate(6deg); }
        }
        @keyframes rocket {
          0%   { transform: translateY(0)    rotate(-12deg); }
          50%  { transform: translateY(-12px) rotate(-12deg); }
          100% { transform: translateY(0)    rotate(-12deg); }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(0.85); opacity: 0.55; }
          70%  { transform: scale(1.4);  opacity: 0;   }
          100% { transform: scale(1.4);  opacity: 0;   }
        }
      `}</style>

      <div className="relative z-10 w-full max-w-[460px]">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#4f46e5] flex items-center justify-center text-white font-bold text-[15px]">
            P
          </div>
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#e6edf3",
              letterSpacing: "-0.02em",
            }}
          >
            ppvs<span style={{ color: "#6366f1" }}>.io</span>
          </span>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-[20px] overflow-hidden p-7 sm:p-8">
          {/* Rocket icon with pulse ring */}
          <div className="relative w-28 h-28 mx-auto mb-5 flex items-center justify-center">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.35) 0%, transparent 70%)",
                animation: "pulse-ring 2.4s ease-out infinite",
              }}
            />
            <div
              className="absolute inset-2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45) 0%, transparent 70%)",
                animation: "pulse-ring 2.4s ease-out infinite 0.8s",
              }}
            />
            <div
              className="relative text-[68px] leading-none"
              style={{ animation: "rocket 2s ease-in-out infinite" }}
            >
              🚀
            </div>
          </div>

          {/* Headline */}
          <h1
            className="text-center text-[26px] sm:text-[28px] font-bold leading-tight mb-2"
            style={{ color: "#e6edf3", letterSpacing: "-0.02em" }}
          >
            Payment received 🎉
          </h1>
          <p
            className="text-center text-[14px] mb-1"
            style={{ color: "#9ca3af" }}
          >
            Your{" "}
            <span style={{ color: "#a5a8ff", fontWeight: 600 }}>
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>{" "}
            already flying into
          </p>
          <p
            className="text-center text-[15px] font-semibold mb-5"
            style={{ color: "#e6edf3" }}
          >
            your Telegram chat 💌
          </p>

          {/* Telegram CTA */}
          <a
            href="tg://"
            className="block w-full py-[13px] rounded-[12px] text-center text-[14px] font-semibold transition-all border-none cursor-pointer"
            style={{
              background: "linear-gradient(135deg, #229ED9 0%, #1B86B8 100%)",
              color: "white",
              boxShadow: "0 8px 24px -8px rgba(34,158,217,0.5)",
            }}
          >
            Open Telegram →
          </a>

          {/* Small reassurance line */}
          <p
            className="text-center text-[11px] mt-4 leading-relaxed"
            style={{ color: "#6b7280" }}
          >
            Delivery usually takes a few seconds.
            {recipient ? ` Check your chat with the model.` : ""}
            <br />
            Don&apos;t close this tab — keep it as your receipt 💜
          </p>
        </div>

        <div
          style={{
            textAlign: "center",
            marginTop: 18,
            fontSize: 11,
            color: "#484f58",
          }}
        >
          Powered by ppvs.io · Telegram PPV platform
        </div>
      </div>
    </div>
  );
}
