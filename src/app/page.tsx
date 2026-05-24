"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

/* ─── colors from the HTML (exact) ─── */
// #0a0a0a bg, #111 surface, #1c1c1c border
// #161b22 dash-bg, #0d1117 dash-surf, #1c2128 dash-border
// #21262d dash-card, #252a33 dash-frame-border
// #e6edf3 dash-text, #c9d1d9 dash-text-2
// #484f58 dash-muted, #30363d dash-dim
// #8b949e avatar text
// #555 text-muted, #888 text-mid, #333 text-dim
// #00AFF0 blue, #003d54 blue-dark

/* ══════════════════════════ LOGO ICON ══════════════════════════ */
function LogoIcon({ size = 34 }: { size?: number }) {
  const r = size / 34;
  return (
    <div
      style={{
        width: size, height: size,
        background: "#00AFF0",
        borderRadius: size * 0.26,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width={22 * r} height={22 * r} viewBox="0 0 24 24" fill="none">
        <path d="M5 11l13-6-6 13-2-5-5-2z" fill="rgba(255,255,255,0.3)"
          stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
        <rect x="13" y="13" width="8" height="8" rx="1.5"
          fill="rgba(0,0,0,0.25)" stroke="#fff" strokeWidth="1.4" />
        <path d="M15 16.5v-1a1 1 0 0 1 2 0v1M14.5 16.5h3a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5z"
          stroke="#fff" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}

/* ══════════════════════════ NAV ══════════════════════════ */
function Nav() {
  return (
    <nav style={{ borderBottom: "1px solid #1c1c1c", padding: "16px 0" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 48px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <LogoIcon size={34} />
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.5px", color: "#fff" }}>
            ppvs<em style={{ color: "#00AFF0", fontStyle: "normal" }}>.io</em>
          </span>
        </Link>
        <div style={{ display: "flex", gap: 28 }}>
          {["Features", "How it works", "Pricing", "Agencies"].map((t) => (
            <a key={t} href={`#${t.toLowerCase().replace(/ /g, "-")}`}
              style={{ fontSize: 13, color: "#555", textDecoration: "none" }}>
              {t}
            </a>
          ))}
        </div>
        <Link href="/signup"
          style={{ background: "#00AFF0", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "none" }}>
          Get started free
        </Link>
      </div>
    </nav>
  );
}

/* ══════════════════════════ HERO ══════════════════════════ */
function Hero() {
  return (
    <div style={{ padding: "88px 0 72px", textAlign: "center" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#111", border: "1px solid #1e1e1e", color: "#888", fontSize: 12, padding: "6px 14px", borderRadius: 20, marginBottom: 24 }}>
        <div style={{ width: 7, height: 7, background: "#00AFF0", borderRadius: "50%" }} />
        Built for Telegram creators &amp; agencies
      </div>
      <h1 style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.07, letterSpacing: "-2px", marginBottom: 18 }}>
        Sell content.<br />
        <em style={{ color: "#00AFF0", fontStyle: "normal" }}>Get paid instantly.</em>
      </h1>
      <p style={{ fontSize: 16, color: "#555", lineHeight: 1.8, maxWidth: 460, margin: "0 auto 34px" }}>
        Send PPV links in Telegram DMs. Fans pay, content unlocks automatically. No KYC, no waiting, crypto payouts.
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <Link href="/signup" style={{ background: "#00AFF0", color: "#fff", border: "none", borderRadius: 9, padding: "13px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "none" }}>
          Start for free
        </Link>
        <a href="#how-it-works" style={{ background: "transparent", color: "#888", border: "1px solid #222", borderRadius: 9, padding: "13px 28px", fontSize: 14, cursor: "pointer", textDecoration: "none" }}>
          See how it works →
        </a>
      </div>
    </div>
  );
}

/* ══════════════════════════ DASHBOARD MOCK ══════════════════════════ */
const S = {
  /* dash frame */
  frame: { background: "#161b22", border: "1px solid #252a33", borderRadius: 16, overflow: "hidden", marginBottom: 72 } as React.CSSProperties,
  bar: { background: "#0d1117", borderBottom: "1px solid #1c2128", padding: "11px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties,
  tab: (on: boolean): React.CSSProperties => ({ fontSize: 12, color: on ? "#e6edf3" : "#484f58", padding: "5px 14px", borderRadius: 6, background: on ? "#21262d" : "transparent" }),
  content: { display: "grid", gridTemplateColumns: "188px 1fr" } as React.CSSProperties,
  side: { background: "#0d1117", borderRight: "1px solid #1c2128", padding: 16 } as React.CSSProperties,
  sideSec: { fontSize: 10, color: "#30363d", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 } as React.CSSProperties,
  sideSecMt: { fontSize: 10, color: "#30363d", letterSpacing: "0.06em", textTransform: "uppercase", margin: "14px 0 6px" } as React.CSSProperties,
  sItem: (on: boolean): React.CSSProperties => ({ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: on ? "#e6edf3" : "#484f58", padding: "7px 9px", borderRadius: 7, marginBottom: 1, background: on ? "#21262d" : "transparent" }),
  main: { padding: "18px 20px" } as React.CSSProperties,
  kpis: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 } as React.CSSProperties,
  kpi: { background: "#0d1117", border: "1px solid #21262d", borderRadius: 9, padding: "13px 14px" } as React.CSSProperties,
  kpiL: { fontSize: 10, color: "#484f58", marginBottom: 4 } as React.CSSProperties,
  kpiV: { fontSize: 19, fontWeight: 700, color: "#e6edf3" } as React.CSSProperties,
  kpiS: { fontSize: 10, color: "#00AFF0", marginTop: 2 } as React.CSSProperties,
  dashRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } as React.CSSProperties,
  card: { background: "#0d1117", border: "1px solid #21262d", borderRadius: 9, padding: "13px 14px" } as React.CSSProperties,
  cardT: { fontSize: 10, color: "#30363d", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 } as React.CSSProperties,
  sRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #1c2128" } as React.CSSProperties,
  sRowLast: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0" } as React.CSSProperties,
  sThumb: { width: 28, height: 28, borderRadius: 5, background: "#21262d", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 } as React.CSSProperties,
  sName: { fontSize: 11, color: "#c9d1d9" } as React.CSSProperties,
  sTime: { fontSize: 10, color: "#30363d" } as React.CSSProperties,
  sAmt: { fontSize: 11, fontWeight: 600, color: "#e6edf3" } as React.CSSProperties,
  badgeSold: { fontSize: 9, padding: "2px 6px", borderRadius: 3, fontWeight: 600, display: "inline-block", marginTop: 1, background: "#00AFF015", color: "#00AFF0" } as React.CSSProperties,
  badgePend: { fontSize: 9, padding: "2px 6px", borderRadius: 3, fontWeight: 600, display: "inline-block", marginTop: 1, background: "#ffffff08", color: "#484f58" } as React.CSSProperties,
  cRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #1c2128" } as React.CSSProperties,
  cRowLast: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0" } as React.CSSProperties,
  cAv: { width: 24, height: 24, borderRadius: "50%", background: "#21262d", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#8b949e", flexShrink: 0 } as React.CSSProperties,
  cNm: { flex: 1, fontSize: 11, color: "#c9d1d9" } as React.CSSProperties,
  cVal: { fontSize: 11, color: "#00AFF0", fontWeight: 600 } as React.CSSProperties,
};

function SvgGrid() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
}
function SvgSend() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>;
}
function SvgVault() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>;
}
function SvgUsers() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85"/></svg>;
}
function SvgDollar() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
}

const SALES = [
  { icon: "🖼", name: "Beach set · 12 photos", time: "2 min ago", amt: "$25", sold: true },
  { icon: "🎬", name: "Exclusive video", time: "14 min ago", amt: "$40", sold: true },
  { icon: "📦", name: "Bundle · 3 videos", time: "1 hr ago", amt: "$80", sold: true },
  { icon: "🖼", name: "Studio shoot", time: "2 hr ago", amt: "$15", sold: false },
];

const CHATTERS = [
  { av: "JM", name: "Jamie M", val: "$1,240 · 42 sales" },
  { av: "AK", name: "Alex K", val: "$980 · 31 sales" },
  { av: "RP", name: "Ryan P", val: "$620 · 19 sales" },
];

function Dashboard() {
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 11, color: "#333", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
        Creator &amp; agency dashboard
      </div>
      <div style={S.frame}>
        {/* Top bar */}
        <div style={S.bar}>
          <div style={{ display: "flex", gap: 2 }}>
            {["Dashboard", "Vault", "Chatters", "Payouts"].map((t, i) => (
              <div key={t} style={S.tab(i === 0)}>{t}</div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#484f58" }}>
            <div style={{ width: 22, height: 22, background: "#00AFF020", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#00AFF0" }}>SC</div>
            Sofia C · Creator
          </div>
        </div>

        <div style={S.content}>
          {/* Sidebar */}
          <div style={S.side}>
            <div style={S.sideSec}>Main</div>
            <div style={S.sItem(true)}><SvgGrid />Dashboard</div>
            <div style={S.sItem(false)}><SvgSend />Send PPV</div>
            <div style={S.sItem(false)}><SvgVault />Vault</div>
            <div style={S.sideSecMt as React.CSSProperties}>Team</div>
            <div style={S.sItem(false)}><SvgUsers />Chatters</div>
            <div style={S.sItem(false)}><SvgDollar />Payouts</div>
          </div>

          {/* Main */}
          <div style={S.main}>
            <div style={S.kpis}>
              {[
                { l: "Total earned", v: "$4,820", s: "↑ 18% this week" },
                { l: "PPVs sold", v: "143", s: "↑ 12 today" },
                { l: "Active chatters", v: "3", s: "2 online now" },
                { l: "Conversion", v: "38%", s: "open → paid" },
              ].map((k) => (
                <div key={k.l} style={S.kpi}>
                  <div style={S.kpiL}>{k.l}</div>
                  <div style={S.kpiV}>{k.v}</div>
                  <div style={S.kpiS}>{k.s}</div>
                </div>
              ))}
            </div>

            <div style={S.dashRow}>
              {/* Recent PPV sales */}
              <div style={S.card}>
                <div style={S.cardT}>Recent PPV sales</div>
                {SALES.map((a, i) => (
                  <div key={i} style={i < SALES.length - 1 ? S.sRow : S.sRowLast}>
                    <div style={S.sThumb}>{a.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={S.sName}>{a.name}</div>
                      <div style={S.sTime}>{a.time}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={S.sAmt}>{a.amt}</div>
                      <span style={a.sold ? S.badgeSold : S.badgePend}>{a.sold ? "Sold" : "Pending"}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Chatter leaderboard */}
              <div style={S.card}>
                <div style={S.cardT}>Chatter leaderboard</div>
                {CHATTERS.map((c, i) => (
                  <div key={c.av} style={i < CHATTERS.length - 1 ? S.cRow : S.cRowLast}>
                    <div style={S.cAv}>{c.av}</div>
                    <div style={S.cNm}>{c.name}</div>
                    <div style={S.cVal}>{c.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════ CHAT + SEND ══════════════════════════ */
const GRADS = [
  "linear-gradient(135deg,#8a6a5a,#5a3a2a)",
  "linear-gradient(135deg,#7a5a7a,#4a2a5a)",
  "linear-gradient(135deg,#6a7a6a,#3a5a3a)",
  "linear-gradient(135deg,#5a6a8a,#2a3a6a)",
  "linear-gradient(135deg,#8a7a5a,#5a4a2a)",
  "linear-gradient(135deg,#5a8a7a,#2a5a4a)",
];
const VAULT_GRADS = [
  "linear-gradient(135deg,#8a6a5a,#5a3a2a)",
  "linear-gradient(135deg,#7a5a7a,#4a2a5a)",
  "linear-gradient(135deg,#5a6a8a,#2a3a6a)",
  "linear-gradient(135deg,#6a8a5a,#3a5a2a)",
  "linear-gradient(135deg,#8a7a5a,#5a4a2a)",
  "linear-gradient(135deg,#5a8a8a,#2a5a5a)",
];

function ChatMock() {
  const frameStyle: React.CSSProperties = { background: "#161b22", border: "1px solid #252a33", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column" };
  return (
    <div style={frameStyle}>
      <div style={{ background: "#0d1117", borderBottom: "1px solid #1c2128", padding: "11px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#00AFF020", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#00AFF0", flexShrink: 0 }}>F</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3" }}>@user2847</div>
          <div style={{ fontSize: 10, color: "#00AFF0" }}>● online</div>
        </div>
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, background: "#0d1117", flex: 1 }}>
        {/* received */}
        <div style={{ maxWidth: "80%", alignSelf: "flex-start" }}>
          <div style={{ borderRadius: 12, padding: "8px 12px", fontSize: 12, lineHeight: 1.55, background: "#21262d", color: "#c9d1d9" }}>
            hey, any new content? 👀
          </div>
          <div style={{ fontSize: 10, color: "#30363d", marginTop: 3 }}>14:02</div>
        </div>
        {/* sent */}
        <div style={{ maxWidth: "80%", alignSelf: "flex-end" }}>
          <div style={{ borderRadius: 12, padding: "8px 12px", fontSize: 12, lineHeight: 1.55, background: "#00AFF0", color: "#fff" }}>
            just dropped something exclusive for you 🔥
          </div>
          <div style={{ fontSize: 10, color: "#30363d", marginTop: 3, textAlign: "right" }}>14:03</div>
        </div>
        {/* PPV bubble */}
        <div style={{ background: "#161b22", border: "1px solid #00AFF030", borderRadius: 14, overflow: "hidden", width: 210, alignSelf: "flex-end" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, background: "#1c2128" }}>
            {GRADS.map((g, i) => (
              <div key={i} style={{ aspectRatio: "1", overflow: "hidden" }}>
                <div style={{ width: "100%", height: "100%", background: g, filter: "blur(7px)", transform: "scale(1.2)" }} />
              </div>
            ))}
          </div>
          <div style={{ padding: "9px 12px", background: "#161b22", borderTop: "1px solid #1c2128" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#e6edf3", marginBottom: 5 }}>🔒 PPV EXAMPLE 1</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, color: "#00AFF0", fontWeight: 800 }}>$20.00</span>
              <button style={{ background: "#00AFF0", color: "#fff", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>🔓 Unlock</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SendPanel() {
  return (
    <div style={{ background: "#161b22", border: "1px solid #252a33", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#0d1117", borderBottom: "1px solid #1c2128", padding: "11px 16px", fontSize: 12, color: "#484f58", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>
        Send PPV from vault
      </div>
      <div style={{ padding: "12px 14px 4px", fontSize: 11, color: "#30363d" }}>Select content</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "6px 14px" }}>
        {VAULT_GRADS.map((g, i) => (
          <div key={i} style={{ aspectRatio: "1", borderRadius: 8, background: "#0d1117", border: i === 0 ? "1px solid #00AFF0" : "1px solid #21262d", cursor: "pointer", position: "relative", overflow: "hidden" }}>
            <div style={{ width: "100%", height: "100%", background: g, filter: "blur(5px)", transform: "scale(1.15)" }} />
            {i === 0 && (
              <div style={{ position: "absolute", top: 4, right: 4, width: 14, height: 14, background: "#00AFF0", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2.5">
                  <path d="M2 5l2 2L8 3" />
                </svg>
              </div>
            )}
          </div>
        ))}
        {[0, 1].map((i) => (
          <div key={`a${i}`} style={{ aspectRatio: "1", borderRadius: 8, background: "#0d1117", border: "1px solid #21262d", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#30363d" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
        ))}
      </div>
      <div style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column", gap: 8, flex: 1, justifyContent: "flex-end" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#484f58", width: 36, flexShrink: 0 }}>Price</span>
          <input defaultValue="$20" readOnly style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 7, padding: "7px 10px", fontSize: 13, fontWeight: 700, color: "#e6edf3", width: 72, outline: "none" }} />
          <span style={{ fontSize: 11, color: "#30363d" }}>1 set · 6 photos</span>
        </div>
        <button style={{ background: "#00AFF0", border: "none", borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}>
          Send PPV to @user2847
        </button>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
          {["Bundle", "Tip request", "Video"].map((t) => (
            <div key={t} style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 7, padding: 7, fontSize: 11, color: "#484f58", cursor: "pointer", textAlign: "center" }}>
              {t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════ STEPS ══════════════════════════ */
function Steps() {
  const steps = [
    { n: "01", t: "Upload to your vault", d: "Drop photos, videos, and bundles into your private vault. Set your price. Your content never goes public." },
    { n: "02", t: "Send PPV in Telegram", d: "Your chatter picks content from the vault and sends a blurred preview with a payment link into the fan's DM." },
    { n: "03", t: "Fan pays, you earn", d: "Fan pays via crypto. Content unlocks instantly. Earnings go to your wallet. No manual steps, no delays." },
  ];
  return (
    <div id="how-it-works" style={{ padding: "72px 0" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#00AFF0", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>How it works</div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px", color: "#fff" }}>Three steps to your first sale</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 32 }}>
        {steps.map((s, i) => (
          <div key={s.n} style={{ background: "#111", border: "1px solid #1c1c1c", borderRadius: 14, padding: "26px 22px", position: "relative" }}>
            <div style={{ fontSize: 42, fontWeight: 900, color: "#1a1a1a", lineHeight: 1, marginBottom: 10 }}>{s.n}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 7, color: "#fff" }}>{s.t}</div>
            <div style={{ fontSize: 13, color: "#555", lineHeight: 1.65 }}>{s.d}</div>
            {i < 2 && (
              <div style={{ position: "absolute", top: "50%", right: -11, transform: "translateY(-50%)", width: 22, height: 22, background: "#00AFF0", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", zIndex: 2 }}>→</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════ FEATURES ══════════════════════════ */
function Features() {
  const feats = [
    { ico: "🔐", t: "Content vault", d: "Private media library. Upload once, sell forever. Organised by type, always ready." },
    { ico: "✈️", t: "Telegram-native", d: "Runs inside Telegram DMs. No app switching. Fans pay without leaving the chat." },
    { ico: "📦", t: "Bundles & tips", d: "Package files into bundles or request tips. Both unlock instantly on payment." },
    { ico: "👥", t: "VA chatter workspace", d: "VAs get their own login. They sell from your vault, you track every sale live." },
    { ico: "📊", t: "Agency dashboard", d: "Manage multiple creators. Leaderboards, earnings, and team performance in one view." },
    { ico: "⚡", t: "Instant unlock", d: "Payment webhook fires in under a second. Content unlocks automatically." },
  ];
  return (
    <div id="features" style={{ padding: "0 0 72px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#00AFF0", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Features</div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px", color: "#fff" }}>Everything you need to monetise</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 32 }}>
        {feats.map((f) => (
          <div key={f.t} style={{ background: "#111", border: "1px solid #1c1c1c", borderRadius: 12, padding: 22 }}>
            <div style={{ fontSize: 20, marginBottom: 11 }}>{f.ico}</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5, color: "#fff" }}>{f.t}</div>
            <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>{f.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════ PRICING ══════════════════════════ */
function Pf({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#888", padding: "5px 0", borderBottom: "1px solid #1c1c1c" }}>
      <span style={{ color: "#00AFF0", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>✓</span>
      {children}
    </div>
  );
}
function PfLast({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#888", padding: "5px 0" }}>
      <span style={{ color: "#00AFF0", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>✓</span>
      {children}
    </div>
  );
}

function Pricing() {
  return (
    <div id="pricing" style={{ padding: "0 0 72px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#00AFF0", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Pricing</div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px", color: "#fff" }}>Simple. No surprises.</div>
      <div style={{ fontSize: 14, color: "#555", marginTop: 6 }}>Start free. Upgrade when you&apos;re earning.</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start", marginTop: 28 }}>
        {/* Free */}
        <div style={{ background: "#111", border: "1px solid #1c1c1c", borderRadius: 14, padding: 26, display: "flex", flexDirection: "column" }}>
          <div style={{ visibility: "hidden", display: "inline-block", background: "#00AFF0", color: "#003d54", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 4, marginBottom: 12, letterSpacing: "0.05em" }}>PLACEHOLDER</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Free</div>
          <div style={{ fontSize: 34, fontWeight: 900, color: "#fff", margin: "8px 0 3px" }}>
            $0<sub style={{ fontSize: 14, fontWeight: 400, color: "#555" }}>/month</sub>
          </div>
          <div style={{ fontSize: 13, color: "#00AFF0", fontWeight: 600, marginBottom: 14 }}>12.5% platform fee on earnings</div>
          <div style={{ fontSize: 13, color: "#555", lineHeight: 1.65, marginBottom: 18, paddingBottom: 18, borderBottom: "1px solid #1c1c1c" }}>
            Full PPV features, one creator account. No time limit. Pay us only when you earn.
          </div>
          <Pf>1 creator account</Pf>
          <Pf>Image, video &amp; bundle PPV</Pf>
          <Pf>Tip requests</Pf>
          <Pf>Content vault</Pf>
          <PfLast>Crypto payouts</PfLast>
          <div style={{ flex: 1 }} />
          <Link href="/signup" style={{ display: "block", textAlign: "center", background: "transparent", border: "1px solid #222", borderRadius: 9, padding: 12, fontSize: 13, fontWeight: 600, color: "#888", cursor: "pointer", marginTop: 18, textDecoration: "none" }}>
            Get started free
          </Link>
        </div>

        {/* Pro */}
        <div style={{ background: "#00AFF008", border: "1px solid #00AFF0", borderRadius: 14, padding: 26, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "inline-block", background: "#00AFF0", color: "#003d54", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 4, marginBottom: 12, letterSpacing: "0.05em" }}>MOST POPULAR</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Pro</div>
          <div style={{ fontSize: 34, fontWeight: 900, color: "#fff", margin: "8px 0 3px" }}>
            $99<sub style={{ fontSize: 14, fontWeight: 400, color: "#555" }}>/month</sub>
          </div>
          <div style={{ fontSize: 13, color: "#00AFF0", fontWeight: 600, marginBottom: 14 }}>10% platform fee — lower at scale</div>
          <div style={{ fontSize: 13, color: "#555", lineHeight: 1.65, marginBottom: 18, paddingBottom: 18, borderBottom: "1px solid #1c1c1c" }}>
            For agencies. Unlimited creators, VA logins, team analytics. The fee drop pays for itself fast.
          </div>
          <Pf>Unlimited creator accounts</Pf>
          <Pf>VA chatter workspace</Pf>
          <Pf>Agency dashboard</Pf>
          <Pf>Chatter leaderboard</Pf>
          <PfLast>Priority support</PfLast>
          <div style={{ flex: 1 }} />
          <Link href="/signup" style={{ display: "block", textAlign: "center", background: "#00AFF0", border: "none", borderRadius: 9, padding: 12, fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", marginTop: 18, textDecoration: "none" }}>
            Start Pro — $99/mo
          </Link>
        </div>
      </div>

      <div style={{ background: "#111", border: "1px solid #1c1c1c", borderRadius: 10, padding: "14px 18px", fontSize: 12, color: "#555", lineHeight: 1.7, marginTop: 14 }}>
        <strong style={{ color: "#aaa" }}>When does Pro pay for itself?</strong> — At $4,000/month in sales the 2.5% fee drop saves you $100. Above that, every dollar earned saves you more than the subscription costs. Agencies with multiple creators hit this in their first month.
      </div>
    </div>
  );
}

/* ══════════════════════════ CTA ══════════════════════════ */
function CTA() {
  return (
    <div style={{ background: "#00AFF0", padding: "60px 48px", textAlign: "center" }}>
      <h2 style={{ fontSize: 28, fontWeight: 800, color: "#003d54", marginBottom: 8 }}>Ready to start selling on Telegram?</h2>
      <p style={{ fontSize: 14, color: "#005a7a", marginBottom: 22 }}>No KYC. No card required. Set up in under 5 minutes.</p>
      <Link href="/signup" style={{ background: "#003d54", color: "#fff", border: "none", borderRadius: 9, padding: "13px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "none" }}>
        Create your free account
      </Link>
    </div>
  );
}

/* ══════════════════════════ FOOTER ══════════════════════════ */
function Footer() {
  return (
    <div style={{ padding: "26px 0", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #1c1c1c" }}>
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
        <LogoIcon size={26} />
        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>
          ppvs<em style={{ color: "#00AFF0", fontStyle: "normal" }}>.io</em>
        </span>
      </Link>
      <div style={{ fontSize: 12, color: "#333" }}>© 2025 ppvs.io · Built for Telegram creators</div>
      <div style={{ display: "flex", gap: 20 }}>
        {["Terms", "Privacy", "Contact"].map((t) => (
          <a key={t} href="#" style={{ fontSize: 12, color: "#333", textDecoration: "none" }}>{t}</a>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════ PAGE ══════════════════════════ */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/dashboard");
    });
  }, [router]);

  const wrap: React.CSSProperties = { maxWidth: 860, margin: "0 auto", padding: "0 48px" };
  return (
    <div style={{ background: "#0a0a0a", fontFamily: "var(--font-geist-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)", color: "#fff", width: "100%" }}>
      <Nav />
      <div style={wrap}>
        <Hero />
        <Dashboard />
        <div style={{ textAlign: "center", fontSize: 11, color: "#333", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
          How chatters send PPVs — Telegram DM view
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "stretch", marginBottom: 72 }}>
          <ChatMock />
          <SendPanel />
        </div>
        <Steps />
        <Features />
        <Pricing />
      </div>
      <CTA />
      <div style={wrap}>
        <Footer />
      </div>
    </div>
  );
}
