"use client";

import { useState } from "react";
import { unlockPpv } from "./actions";

type Props = {
  code: string;
  title: string;
  price: number;
  thumbUrl: string;
  fileType: "image" | "video";
};

export function PayClient({ code, title, price, thumbUrl, fileType }: Props) {
  const [state, setState] = useState<"locked" | "loading" | "unlocked" | "error">("locked");
  const [contentUrl, setContentUrl] = useState("");
  const [errMsg, setErrMsg] = useState("");

  async function handleUnlock() {
    setState("loading");
    const result = await unlockPpv(code);
    if (result.error) {
      setErrMsg(result.error);
      setState("error");
      return;
    }
    setContentUrl(result.url!);
    setState("unlocked");
  }

  const isLocked = state === "locked" || state === "loading" || state === "error";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#0d1117]">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(0,175,240,0.07) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="#00AFF0" />
            <path d="M12 28 L20 12 L28 28" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M15 22 L25 22" stroke="white" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#e6edf3", letterSpacing: "-0.02em" }}>
            ppvs<span style={{ color: "#00AFF0" }}>.io</span>
          </span>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-[16px] overflow-hidden">
          {/* Media preview */}
          <div className="relative aspect-[16/9] bg-[#0d1117] overflow-hidden">
            {thumbUrl && (
              <img
                src={thumbUrl}
                alt={title}
                className="w-full h-full object-cover"
                style={isLocked ? { filter: "blur(18px) brightness(0.5)", transform: "scale(1.15)" } : undefined}
              />
            )}

            {isLocked && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-black/50 border border-white/10 flex items-center justify-center mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round" />
                  </svg>
                </div>
                <div style={{ color: "#e6edf3", fontSize: 14, fontWeight: 600 }}>Locked content</div>
                <div style={{ color: "#8b949e", fontSize: 12, marginTop: 4 }}>{fileType === "video" ? "Video" : "Photo"}</div>
              </div>
            )}

            {state === "unlocked" && fileType === "video" && (
              <video controls autoPlay className="absolute inset-0 w-full h-full object-contain bg-black">
                <source src={contentUrl} />
              </video>
            )}
          </div>

          {/* Info panel */}
          <div className="p-5">
            <div className="text-[16px] font-semibold mb-1" style={{ color: "#e6edf3" }}>{title}</div>

            {state === "unlocked" ? (
              <div>
                <div className="text-[13px] mb-4" style={{ color: "#3fb950" }}>Content unlocked! Enjoy.</div>
                {fileType === "image" && (
                  <a
                    href={contentUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full text-center py-[12px] rounded-[10px] text-[14px] font-semibold transition-colors"
                    style={{ background: "#00AFF0", color: "white" }}
                  >
                    Download Photo
                  </a>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-baseline gap-1.5 mb-4">
                  <span style={{ fontSize: 28, fontWeight: 800, color: "#00AFF0", letterSpacing: "-0.03em" }}>
                    ${price}
                  </span>
                  <span style={{ fontSize: 13, color: "#8b949e" }}>one-time unlock</span>
                </div>

                {state === "error" && (
                  <div className="mb-3 bg-red-500/10 border border-red-500/20 rounded-[8px] px-3.5 py-2.5 text-[12px] text-red-400">
                    {errMsg}
                  </div>
                )}

                <button
                  onClick={handleUnlock}
                  disabled={state === "loading"}
                  className="w-full py-[13px] rounded-[10px] text-[14px] font-semibold transition-all border-none cursor-pointer"
                  style={{
                    background: state === "loading" ? "#00AFF060" : "#00AFF0",
                    color: "white",
                  }}
                >
                  {state === "loading" ? "Processing..." : `Unlock for $${price}`}
                </button>

                <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "#484f58" }}>
                  Secure one-time payment via ppvs.io
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
