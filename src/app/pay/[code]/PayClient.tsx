"use client";

import { useState } from "react";

type Item = { name: string; media_url: string | null };

type DeliveredItem = { name: string; mediaUrl: string; isVideo: boolean };

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

function isVideoUrl(url: string): boolean {
  const u = url.toLowerCase().split("?")[0];
  return /\.(mp4|mov|webm|m4v|mkv)$/.test(u);
}

// ── Malum payment flow (temporarily disabled) ───────────────────────────
// Re-enable by:
//   1. Restoring the email input + breakdown JSX below the // BYPASS markers.
//   2. Replacing handlePay's deliver call with the commented fetch to
//      /api/payments/malum/create + window.location redirect.
// The success page (/pay/[code]/success) and webhook handler
// (/api/webhooks/malum) are still wired up — no other code changes needed.
//
// const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// ────────────────────────────────────────────────────────────────────────

export function PayClient({
  code,
  items,
  basePrice,
  // fee, total — unused while the gateway is bypassed (see banner above).
  caption,
  recipient,
  initiallyDelivered,
}: Props) {
  const [state, setState] = useState<"locked" | "loading" | "delivered" | "error">(
    initiallyDelivered ? "delivered" : "locked",
  );
  const [delivered, setDelivered] = useState<DeliveredItem[]>([]);
  const [errMsg, setErrMsg] = useState("");

  async function handlePay() {
    setState("loading");
    setErrMsg("");
    // BYPASS — Malum disabled, unlock straight from /api/ppv/deliver.
    // The deliver endpoint marks the send paid and fires the Telegram
    // push in the background, same as it would after a real webhook.
    try {
      const res = await fetch("/api/ppv/deliver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        items?: DeliveredItem[];
      };
      if (!res.ok || data.error) {
        setErrMsg(data.error || `HTTP ${res.status}`);
        setState("error");
        return;
      }
      setDelivered(data.items ?? []);
      setState("delivered");
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : "Network error");
      setState("error");
    }

    // ── Malum flow, restore by deleting the bypass above and uncommenting:
    // const e = email.trim().toLowerCase();
    // if (!EMAIL_RE.test(e)) {
    //   setErrMsg("Enter a valid email");
    //   setState("error");
    //   return;
    // }
    // try {
    //   const res = await fetch("/api/payments/malum/create", {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ code, email: e }),
    //   });
    //   const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    //   if (!res.ok || !data.url) {
    //     setErrMsg(data.error || `Could not open checkout (HTTP ${res.status})`);
    //     setState("error");
    //     return;
    //   }
    //   window.location.href = data.url;
    // } catch (err: unknown) {
    //   setErrMsg(err instanceof Error ? err.message : "Network error");
    //   setState("error");
    // }
  }

  const isLocked = state !== "delivered";

  // Once delivered, prefer the server's list of original URLs (paid path).
  // Otherwise show the items we got from the SSR render (locked previews).
  const tilesToRender =
    state === "delivered" && delivered.length > 0
      ? delivered.map((d) => ({ name: d.name, media_url: d.mediaUrl, isVideo: d.isVideo }))
      : items.map((it) => ({
          name: it.name,
          media_url: it.media_url,
          isVideo: it.media_url ? isVideoUrl(it.media_url) : false,
        }));

  return (
    <div className="min-h-screen flex items-center justify-center px-3 sm:px-4 bg-[#0d1117] py-6 sm:py-10">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(99,102,241,0.07) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 w-full max-w-[520px]">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#4f46e5] flex items-center justify-center text-white font-bold text-[15px]">
            P
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#e6edf3", letterSpacing: "-0.02em" }}>
            ppvs<span style={{ color: "#6366f1" }}>.io</span>
          </span>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-[16px] overflow-hidden">
          {/* Preview grid */}
          <div className="p-3">
            <div
              className={`grid gap-2 ${
                tilesToRender.length === 1
                  ? "grid-cols-1"
                  : tilesToRender.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-3"
              }`}
            >
              {tilesToRender.map((it, i) => (
                <div
                  key={i}
                  className="relative aspect-square rounded-md overflow-hidden bg-gradient-to-br from-[#1f2937] to-[#111827] border border-[#30363d] flex items-center justify-center"
                >
                  <span className="text-[28px] opacity-40 select-none">🔒</span>
                  {it.media_url ? (
                    it.isVideo && state === "delivered" ? (
                      <video
                        src={it.media_url}
                        controls
                        className="absolute inset-0 w-full h-full object-cover bg-black"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.media_url}
                        alt={it.name}
                        className="absolute inset-0 w-full h-full object-cover"
                        style={
                          isLocked
                            ? { filter: "blur(22px) brightness(0.55)", transform: "scale(1.15)" }
                            : undefined
                        }
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )
                  ) : null}
                  {isLocked && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-9 h-9 rounded-full bg-black/55 border border-white/10 flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                          <rect x="3" y="11" width="18" height="11" rx="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>
                  )}
                  {state === "delivered" && it.media_url && !it.isVideo && (
                    <a
                      href={it.media_url}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="absolute bottom-1 right-1 px-2 py-1 rounded bg-black/65 text-white text-[10px] font-medium hover:bg-black/85"
                      title="Download"
                    >
                      ⬇ Save
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="px-5 pb-5">
            {recipient && (
              <div className="text-[12px] text-[#8b949e] mb-1">For @{recipient}</div>
            )}
            <div className="text-[15px] font-semibold mb-1" style={{ color: "#e6edf3" }}>
              {state === "delivered"
                ? `${tilesToRender.length} ${tilesToRender.length === 1 ? "item" : "items"} unlocked`
                : `${items.length} ${items.length === 1 ? "item" : "items"} locked`}
            </div>
            {caption.trim() && (
              <div className="text-[12px] text-[#9ca3af] mb-3 whitespace-pre-wrap">
                {caption}
              </div>
            )}

            {state === "delivered" ? (
              <div className="mt-2">
                <div className="rounded-[10px] bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-3 text-[13px] text-emerald-300 leading-relaxed">
                  ✅ Content unlocked. Tap any tile to view full size; use ⬇ Save to download.
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-baseline gap-1.5 mb-4 mt-2">
                  <span style={{ fontSize: 32, fontWeight: 800, color: "#6366f1", letterSpacing: "-0.03em" }}>
                    ${basePrice.toFixed(2)}
                  </span>
                  <span style={{ fontSize: 13, color: "#8b949e" }}>one-time unlock</span>
                </div>

                {/* ── BYPASS: email input + fee breakdown hidden while
                       the gateway is disabled. See top-of-file note. ──
                <div className="text-[11px] text-[#8b949e] mb-4 leading-relaxed">
                  Content&nbsp;<span className="text-[#c9d1d9]">${basePrice.toFixed(2)}</span>{" "}
                  · Service fee&nbsp;<span className="text-[#c9d1d9]">${fee.toFixed(2)}</span>
                </div>
                <label className="block text-[12px] text-[#8b949e] mb-1.5">Email for receipt</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  inputMode="email"
                  autoComplete="email"
                  disabled={state === "loading"}
                  className="w-full mb-3 px-3.5 py-2.5 rounded-[8px] bg-[#0d1117] border border-[#30363d] text-[13px] text-[#e6edf3] outline-none focus:border-[#6366f1] placeholder:text-[#484f58]"
                />
                ── */}

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
                    background: state === "loading" ? "#6366f160" : "#6366f1",
                    color: "white",
                  }}
                >
                  {state === "loading" ? "Unlocking..." : `Pay $${basePrice.toFixed(2)} & Unlock`}
                </button>

                <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "#484f58" }}>
                  Payment gateway temporarily disabled — clicking Pay unlocks content for testing.
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#484f58" }}>
          Powered by ppvs.io · Telegram PPV platform
        </div>
      </div>
    </div>
  );
}
