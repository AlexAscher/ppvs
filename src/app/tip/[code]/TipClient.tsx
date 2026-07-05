"use client";

import { useState } from "react";

type Props = {
  code: string;
  amount: number;
  message: string;
  peerUsername: string | null;
  initiallyPaid: boolean;
};

export function TipClient({
  code,
  amount,
  message,
  peerUsername,
  initiallyPaid,
}: Props) {
  const [state, setState] = useState<"pending" | "loading" | "paid" | "error">(
    initiallyPaid ? "paid" : "pending",
  );
  const [errMsg, setErrMsg] = useState("");

  // Read-only status check. Payment is settled by Telegram Stars.
  async function handlePay() {
    setState("loading");
    setErrMsg("");
    try {
      const res = await fetch("/api/tips/deliver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        alreadyPaid?: boolean;
      };
      if (res.status === 402) {
        setErrMsg(
          data.error ||
            "This tip is not paid yet. Open the link in Telegram to pay with Stars.",
        );
        setState("error");
        return;
      }
      if (!res.ok || data.error) {
        setErrMsg(data.error || `HTTP ${res.status}`);
        setState("error");
        return;
      }
      setState("paid");
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : "Network error");
      setState("error");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-3 sm:px-4 bg-[#0d1117] py-6 sm:py-10">
      {/* Radial glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(0, 175, 240,0.07) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00AFF0] to-[#00AFF0] flex items-center justify-center text-white font-bold text-[15px]">
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
            ppvs<span style={{ color: "#00AFF0" }}>.io</span>
          </span>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-[16px] overflow-hidden">
          {/* Tip icon */}
          <div className="flex items-center justify-center pt-8 pb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00AFF0]/20 to-[#00AFF0]/10 border border-[#00AFF0]/30 flex items-center justify-center text-[32px]">
              💰
            </div>
          </div>

          <div className="px-6 pb-8">
            {peerUsername && (
              <p className="text-center text-[12px] text-[#8b949e] mb-1">
                For @{peerUsername}
              </p>
            )}

            <h1
              className="text-center text-[22px] font-bold mb-1"
              style={{ color: "#e6edf3" }}
            >
              Tip Request
            </h1>

            {message && (
              <p
                className="text-center text-[13px] mb-4 whitespace-pre-wrap leading-relaxed"
                style={{ color: "#9ca3af" }}
              >
                {message}
              </p>
            )}

            {state === "paid" ? (
              <div className="rounded-[10px] bg-emerald-500/10 border border-emerald-500/20 px-4 py-4 text-center">
                <div className="text-[28px] mb-2">🎉</div>
                <div className="text-[15px] font-semibold text-emerald-300 mb-1">
                  Thank you!
                </div>
                <div className="text-[12px] text-emerald-400/80">
                  Your ${amount.toFixed(2)} tip was received.
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-center gap-2 mb-6 mt-2">
                  <span
                    style={{
                      fontSize: 40,
                      fontWeight: 800,
                      color: "#00AFF0",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    ${amount.toFixed(2)}
                  </span>
                  <span style={{ fontSize: 13, color: "#8b949e" }}>one-time tip</span>
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
                  style={{
                    background: state === "loading" ? "#00AFF060" : "#00AFF0",
                    color: "white",
                  }}
                >
                  {state === "loading" ? "Checking…" : "I've paid — check status"}
                </button>

                <div
                  style={{
                    textAlign: "center",
                    marginTop: 12,
                    fontSize: 11,
                    color: "#484f58",
                  }}
                >
                  Payment is processed by Telegram Stars. Open this link inside Telegram to pay.
                </div>
              </>
            )}
          </div>
        </div>

        <div
          style={{
            textAlign: "center",
            marginTop: 20,
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
