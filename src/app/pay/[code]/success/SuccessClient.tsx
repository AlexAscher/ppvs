"use client";

import { useEffect, useRef, useState } from "react";

type Item = { name: string; media_url: string | null };

type Props = {
  code: string;
  items: Item[];
  price: number;
  caption: string;
  recipient: string | null;
  initiallyPaid: boolean;
};

function isVideoUrl(url: string): boolean {
  const u = url.toLowerCase().split("?")[0];
  return /\.(mp4|mov|webm|m4v|mkv)$/.test(u);
}

/**
 * Buyer-facing success view.
 *
 * On mount, if the row is already `paid`/`delivered`, we just render
 * unlocked tiles. Otherwise we poll `/api/ppv/send/status?code=` once a
 * second for up to ~60s, waiting for the Malum webhook to flip status.
 *
 * The originals are passed in from SSR — we don't re-fetch them, we just
 * decide whether to drop the blur filter.
 */
export function SuccessClient({ code, items, price, caption, recipient, initiallyPaid }: Props) {
  // Locked → poll status → reload on flip. We don't track `paid` in state;
  // the SSR-passed flag is the single source of truth for this render, and
  // the page reloads when the row flips so SSR runs again with originals.
  const paid = initiallyPaid;
  const [tick, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (paid) return;
    let cancelled = false;
    const MAX_TICKS = 60; // ~60s budget — plenty of time for the webhook.
    async function poll() {
      try {
        const res = await fetch(`/api/ppv/send/status?code=${encodeURIComponent(code)}`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as { status?: string };
        if (cancelled) return;
        if (data.status === "paid" || data.status === "delivered") {
          // Reload so SSR re-runs and ships the original media_url. The
          // SSR gate keeps originals out of the HTML until the row is
          // actually paid, so we can't just flip a flag client-side.
          window.location.reload();
          return;
        }
      } catch {
        /* swallow — try again */
      }
      if (cancelled) return;
      if (tick + 1 >= MAX_TICKS) return; // give up, leave UI in "processing"
      timerRef.current = setTimeout(() => setTick((t) => t + 1), 1000);
    }
    poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tick, paid, code]);

  const tilesToRender = items.map((it) => ({
    name: it.name,
    media_url: it.media_url,
    isVideo: it.media_url ? isVideoUrl(it.media_url) : false,
  }));

  return (
    <div className="min-h-screen flex items-center justify-center px-3 sm:px-4 bg-[#0d1117] py-6 sm:py-10">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(0, 175, 240,0.07) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 w-full max-w-[520px]">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00AFF0] to-[#00AFF0] flex items-center justify-center text-white font-bold text-[15px]">
            P
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#e6edf3", letterSpacing: "-0.02em" }}>
            ppvs<span style={{ color: "#00AFF0" }}>.io</span>
          </span>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-[16px] overflow-hidden">
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
                    paid && it.isVideo ? (
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
                          !paid
                            ? { filter: "blur(22px) brightness(0.55)", transform: "scale(1.15)" }
                            : undefined
                        }
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )
                  ) : null}
                  {paid && it.media_url && !it.isVideo && (
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

          <div className="px-5 pb-5">
            {recipient && (
              <div className="text-[12px] text-[#8b949e] mb-1">For @{recipient}</div>
            )}
            <div className="text-[15px] font-semibold mb-1" style={{ color: "#e6edf3" }}>
              {paid
                ? `${tilesToRender.length} ${tilesToRender.length === 1 ? "item" : "items"} unlocked`
                : "Confirming payment…"}
            </div>
            {caption.trim() && (
              <div className="text-[12px] text-[#9ca3af] mb-3 whitespace-pre-wrap">
                {caption}
              </div>
            )}

            {paid ? (
              <div className="mt-2">
                <div className="rounded-[10px] bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-3 text-[13px] text-emerald-300 leading-relaxed">
                  ✅ Payment received. Tap any tile to view full size; use ⬇ Save to download.
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <div className="rounded-[10px] bg-amber-500/10 border border-amber-500/20 px-3.5 py-3 text-[13px] text-amber-300 leading-relaxed">
                  ⏳ Waiting for the gateway to confirm your payment ({tick}s)…
                  <div className="text-[11px] text-amber-300/70 mt-1">
                    This usually takes a few seconds. You can safely keep this tab open.
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5 mt-3">
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#8b949e" }}>${price.toFixed(2)}</span>
                  <span style={{ fontSize: 12, color: "#484f58" }}>charged</span>
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
