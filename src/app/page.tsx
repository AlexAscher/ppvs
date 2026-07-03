"use client";

// Landing v3 — 1:1 port of the customer-supplied HTML/CSS (main_page.txt).
// Same colour tokens, sections, sizing, marquee, categorised FAQ. Base64
// images from the source doc replaced with our /public assets:
//   /landing/logo.png       — nav + footer wordmark
//   /hero_ppvs.png          — hero-visual
//   /built_for.png          — screenshot-img in "Built for agencies"
//   /for_agency_owners.png  — dashboard screenshot
//   /for_chatters.png       — chatter workspace screenshot
//   /for_payouts.png        — wallet screenshot
// Auth-aware CTA: signed-in visitors get "Dashboard" pointing at /dashboard.

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

// zoom:0.9 was applied at html-level in the source; we do the same so the
// whole site defaults 10% smaller (v3 brief).
const HTML_ZOOM = "0.9";

const C = {
  bg: "#0a0e16",
  bgRaised: "#11161f",
  bgCard: "#141a25",
  line: "#232a38",
  text: "#f4f6fa",
  textDim: "#aab3c5",
  textFaint: "#6b7488",
  accent: "#2fb8ff",
  accentDeep: "#0d8fe0",
  accentGlow: "rgba(47,184,255,0.18)",
  green: "#34d399",
  gold: "#f0b94d",
  radius: 14,
};

const MARQUEE = [
  "PAY WITH TELEGRAM STARS", "CRYPTO PAYOUTS", "15% PLATFORM FEE",
  "WITHOUT LEAVING TELEGRAM", "NO MONTHLY FEES", "NO KYC", "SETUP IN MINUTES",
];

const BUILT_CARDS = [
  { emoji: "💸", title: "Flexible PPV Selling", desc: "Custom pricing per fan. Content unlocks instantly the moment payment clears — no delays, no manual delivery." },
  { emoji: "📊", title: "Agency Dashboard", desc: "Creators, chatters, payouts, and analytics — all in one place. Every sale tracked, every chatter accountable." },
  { emoji: "⭐", title: "Native Telegram Payments", desc: "Fans unlock PPVs directly with Telegram Stars. If they need to top up, they can do it instantly with Apple Pay, Google Pay, or card — without leaving the app." },
];

type Faq = { q: string; a: React.ReactNode; open?: boolean };
const FAQ_GROUPS: { title: string; items: Faq[] }[] = [
  {
    title: "Payments & Payouts",
    items: [
      {
        q: "If a fan pays 1,000 Stars, how much do I receive?",
        open: true,
        a: (
          <>
            <p>Telegram sets a fixed withdrawal rate of $0.013 USD per Star. Here&apos;s how 1,000 Stars breaks down:</p>
            <div className="math">
              <b>1,000 Stars</b> × $0.013 = <b>$13.00</b> gross value<br />
              Stars convert to GRAM — we cover the conversion fee from our cut.<br />
              15% platform fee = $1.95<br />
              <span className="result">You receive ≈ $11.05 in GRAM. In full, no further deductions.</span>
            </div>
            <p>The final dollar value depends on the GRAM market price at the time of withdrawal.</p>
          </>
        ),
      },
      { q: "Why do I receive less than what fans pay for Stars?", a: <p>Telegram sets a fixed creator withdrawal rate of $0.013 per Star, regardless of what fans paid to purchase them. Fans buying through Apple or Google Pay often pay more due to their 30% in-app fee — that gap belongs to Telegram and the app stores, not ppvs.io. This applies to every Telegram Stars transaction.</p> },
      { q: "How do payouts work?", a: <p>As fans purchase PPVs, your Stars rewards accumulate and convert to GRAM. After a 25-day holding period, your balance becomes available to withdraw to your crypto wallet. The holding period covers Telegram&apos;s 21-day window plus a short buffer we keep for fraud review. Minimum withdrawal is $30.</p> },
      { q: "What currency are payouts in?", a: <p>Payouts are made in GRAM on the TON network. We handle the Stars-to-GRAM conversion and cover the network fee from our 15% cut — you receive your full 85% with no additional deductions.</p> },
      { q: "How do fans pay?", a: <p>Fans pay with Telegram Stars — Telegram&apos;s native currency. Stars can be purchased directly inside Telegram using Apple Pay, Google Pay, or a card. No separate account, no external checkout, no friction.</p> },
    ],
  },
  {
    title: "Security & Telegram",
    items: [
      { q: "Will Telegram ban my account for using ppvs.io?", a: <p>ppvs.io uses MTProto — the same API Telegram itself is built on. We implement careful session management to mimic normal human behavior. As with any third-party API usage there is a small risk, but we take every precaution to minimize it. To date, none of our users have had an account banned through normal platform use.</p> },
      { q: "What happens to my earnings if my Telegram account is banned?", a: <p>Your earnings are attributed to the PPVS bot account, not your personal Telegram account. If your creator account is ever banned or suspended, your accumulated balance is not lost — contact support with proof of account ownership and we&apos;ll process your withdrawal as normal.</p> },
      { q: "Is my content secure inside the vault?", a: <p>Your vault content is encrypted and stored securely — only you and your team can access it. Once a fan unlocks a PPV, screenshot protection activates so they cannot capture or save the content. Unlocked media is only accessible within that fan&apos;s own chat session.</p> },
      { q: "Do fans need another app or an account?", a: <p>No. Everything happens natively inside Telegram. Fans pay with Telegram Stars and content unlocks instantly — no downloads, no accounts, no redirects.</p> },
    ],
  },
  {
    title: "Agencies & Teams",
    items: [
      { q: "Can I manage multiple creators and chatters?", a: <p>Yes. ppvs.io is built for OFM agencies and supports multiple creators, multiple chatters, role-based permissions, and centralized management from a single dashboard.</p> },
      { q: "Can one chatter manage multiple models?", a: <p>Yes. Chatters switch between model accounts with one click from the model selector bar. Unread message counts appear per model so nothing gets missed.</p> },
      { q: "Can chatters set custom prices per fan?", a: <p>Yes. Chatters set individual prices for every fan and send content directly from the vault without leaving the conversation. The price displays both the Star amount and the net USD equivalent after the platform fee — so chatters always know exactly what they&apos;ll receive before sending.</p> },
      { q: "Can I see what each chatter is doing?", a: <p>Yes. Every conversation and sale is logged and accessible to agency admins. You can view conversations, see which chatter sent each message, and access any chatter&apos;s workspace directly from your dashboard.</p> },
    ],
  },
  {
    title: "Getting Started",
    items: [
      { q: "How does PPVS work?", a: <p>PPVS lets agencies and creators sell pay-per-view content directly inside Telegram. Fans unlock content using Telegram Stars without ever leaving the chat. You manage everything — content, chatters, payouts — from your agency dashboard.</p> },
      { q: "How long does setup take?", a: <p>Setup takes minutes. Connect your Telegram account, upload your first content, add your chatters, and you&apos;re ready to sell. No calls, no contracts, no approval process.</p> },
    ],
  },
];

function FaqItem({ q, a, defaultOpen }: { q: string; a: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={`faq-item ${open ? "open" : ""}`} style={{ borderBottom: `1px solid ${C.line}` }}>
      <div
        className="faq-q"
        style={{ padding: "17px 4px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontSize: 14, fontWeight: 600, gap: 16, userSelect: "none" }}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{q}</span>
        <i
          className="chev"
          style={{
            color: open ? C.accent : C.textFaint,
            transition: "transform .2s ease",
            transform: open ? "rotate(180deg)" : "none",
            flex: "0 0 auto",
            fontStyle: "normal",
          }}
        >⌄</i>
      </div>
      <div
        className="faq-a"
        style={{ maxHeight: open ? 800 : 0, overflow: "hidden", transition: "max-height .28s ease" }}
      >
        <div style={{ padding: "0 4px 17px", fontSize: 14, color: C.textDim, lineHeight: 1.7 }}>{a}</div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);
  // Apply the html {zoom:0.9} rule from the source globally, only on this page.
  useEffect(() => {
    const prev = document.documentElement.style.zoom;
    document.documentElement.style.zoom = HTML_ZOOM;
    return () => { document.documentElement.style.zoom = prev; };
  }, []);

  const ctaHref = authed ? "/dashboard" : "/signup";

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Inter',-apple-system,sans-serif", lineHeight: 1.5, WebkitFontSmoothing: "antialiased" }}>
      {/* embed google fonts + tiny keyframes/scoped styles that would be tedious to inline */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap');
        .land h1,.land h2,.land h3{font-family:'Space Grotesk','Inter',sans-serif;letter-spacing:-0.02em;}
        .land .accent{color:${C.accent};}
        @keyframes ppvs_scroll {from{transform:translateX(0);}to{transform:translateX(-50%);}}
        .land .marquee-track{display:inline-flex;animation:ppvs_scroll 30s linear infinite;}
        .land .marquee-track span{display:inline-flex;align-items:center;font-size:12px;font-weight:700;letter-spacing:0.08em;color:${C.textDim};padding:0 26px;}
        .land .marquee-track span::after{content:'◆';font-size:7px;color:${C.accent};margin-left:26px;}
        .land .btn{display:inline-flex;align-items:center;gap:8px;justify-content:center;padding:11px 22px;border-radius:10px;font-weight:600;font-size:14px;border:1px solid transparent;cursor:pointer;transition:all .15s ease;text-decoration:none;}
        .land .btn-primary{background:${C.accent};color:#06121c;}
        .land .btn-primary:hover{background:#46c4ff;box-shadow:0 4px 28px ${C.accentGlow};}
        .land .btn-lg{padding:15px 30px;font-size:15px;border-radius:12px;}
        .land .btn-ghost{border-color:${C.line};color:${C.text};background:transparent;}
        .land .btn-ghost:hover{border-color:#3a4458;}
        .land header.hero::before{content:'';position:absolute;top:-160px;left:35%;width:1100px;height:800px;background:radial-gradient(ellipse at center,rgba(47,184,255,0.11),transparent 65%);pointer-events:none;}
        .land .hero-visual::before{content:'';position:absolute;width:320px;height:480px;background:radial-gradient(ellipse,rgba(47,184,255,0.10),transparent 68%);border-radius:50%;z-index:0;}
        .land .final-cta::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at center,${C.accentGlow},transparent 65%);pointer-events:none;}
        .land .price-wrap::before{content:'';position:absolute;inset:-60px;background:radial-gradient(ellipse at center,rgba(47,184,255,0.13),transparent 68%);pointer-events:none;border-radius:50%;}
        .land .price-card::before,.land .price-card::after{content:'';position:absolute;width:22px;height:22px;border-color:rgba(47,184,255,0.5);border-style:solid;}
        .land .price-card::before{top:-1px;left:-1px;border-width:2px 0 0 2px;border-radius:20px 0 0 0;}
        .land .price-card::after{top:-1px;right:-1px;border-width:2px 2px 0 0;border-radius:0 20px 0 0;}
        .land .math{background:#161c28;border:1px solid ${C.line};border-radius:9px;padding:14px 16px;margin:10px 0 14px;font-size:13px;color:${C.textDim};line-height:1.8;}
        .land .math b{color:${C.text};}
        .land .math .result{color:${C.green};font-weight:700;}
        @media(max-width:960px){
          .land .wrap{padding:0 24px !important;}
          .land .nav-inner{padding:14px 24px !important;}
          .land .hero-grid,.land .role-section,.land .role-section.reverse,.land .card-row{grid-template-columns:1fr !important;}
          .land .role-section.reverse .role-screenshot{order:initial !important;}
          .land .hero h1{font-size:38px !important;}
          .land .hero-visual img{max-width:280px !important;}
          .land .box-row{max-width:100% !important;}
          .land .foot-grid{grid-template-columns:1fr 1fr !important;}
          .land .hero-copy{padding-right:0 !important;}
        }
      `}</style>

      <div className="land">
        {/* ── NAV ── */}
        <nav style={{ position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(14px)", background: "rgba(10,14,22,0.84)", borderBottom: `1px solid ${C.line}` }}>
          <div className="nav-inner" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 48px", maxWidth: 1200, margin: "0 auto" }}>
            <Link href="/" className="logo" style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 18, letterSpacing: "-0.01em", color: C.text, textDecoration: "none" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing/logo.png" alt="PPVS.IO logo" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover" }} />
              PPVS.IO
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 14, color: C.textDim }}>
              <a href="#features" style={{ color: "inherit", textDecoration: "none" }}>Features</a>
              <a href="#pricing" style={{ color: "inherit", textDecoration: "none" }}>Pricing</a>
              <a href="#faq" style={{ color: "inherit", textDecoration: "none" }}>FAQ</a>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* v3: signed-in visitors see a single CTA ("Open dashboard").
                  Anonymous visitors keep Login + Get Started. */}
              {!authed && (
                <Link href="/login" className="btn btn-ghost">Login</Link>
              )}
              <Link href={ctaHref} className="btn btn-primary">{authed ? "Open dashboard" : "Get Started"}</Link>
            </div>
          </div>
        </nav>

        {/* ── HERO ── */}
        <header className="hero" style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", overflow: "hidden", padding: "52px 0 40px" }}>
          <div className="wrap" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px", width: "100%" }}>
            <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "center", position: "relative", zIndex: 2, width: "100%" }}>
              <div className="hero-copy" style={{ paddingRight: 16 }}>
                <div className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 16px", borderRadius: 99, background: C.bgCard, border: `1px solid ${C.line}`, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: C.accent, marginBottom: 26 }}>
                  <span style={{ content: "", width: 6, height: 6, borderRadius: "50%", background: C.accent, boxShadow: `0 0 8px ${C.accent}`, display: "inline-block" }} />
                  TELEGRAM MONETIZATION PLATFORM
                </div>
                <h1 style={{ fontSize: 58, lineHeight: 1.03, fontWeight: 700, marginBottom: 22 }}>
                  Turn Telegram conversations into <span className="accent">revenue.</span>
                </h1>
                <p style={{ fontSize: 18, color: C.textDim, maxWidth: 500, marginBottom: 32, lineHeight: 1.65 }}>
                  Sell content, manage chatters, and get paid in crypto. Fans pay with Telegram Stars while you keep 85% of every sale.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
                  <Link href={ctaHref} className="btn btn-primary btn-lg">Start Selling PPVs 💸</Link>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: C.textFaint, flexWrap: "wrap", marginBottom: 40 }}>
                  <span>No monthly fees</span><span style={{ color: C.line }}>•</span><span>No setup costs</span>
                </div>
                <div className="box-row" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, maxWidth: 480 }}>
                  {[
                    { ic: "💌", l1: "Send", l2: "PPVs" },
                    { ic: "👥", l1: "Manage", l2: "Chatters" },
                    { ic: "📊", l1: "Agency", l2: "Dashboard" },
                    { ic: "💎", l1: "Crypto", l2: "Payouts" },
                  ].map((b, i) => (
                    <div key={i} style={{ background: C.bgCard, border: `1px solid ${C.line}`, borderRadius: 12, padding: "15px 10px", textAlign: "center", fontSize: 11, fontWeight: 700, color: C.textDim, lineHeight: 1.4 }}>
                      <span style={{ fontSize: 20, display: "block", marginBottom: 8 }}>{b.ic}</span>
                      {b.l1}<br />{b.l2}
                    </div>
                  ))}
                </div>
              </div>
              <div className="hero-visual" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", position: "relative", paddingLeft: 60 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/hero_ppvs.png"
                  alt="Fan unlocking PPV content inside Telegram"
                  style={{ width: "100%", maxWidth: 520, height: "auto", maxHeight: "calc(100vh - 120px)", objectFit: "contain", filter: "drop-shadow(0 32px 64px rgba(0,0,0,0.55))", position: "relative", zIndex: 1 }}
                />
              </div>
            </div>
          </div>
        </header>

        {/* ── MARQUEE ── */}
        <div style={{ borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, background: C.bgRaised, padding: "15px 0", overflow: "hidden", whiteSpace: "nowrap" }}>
          <div className="marquee-track">
            {[...MARQUEE, ...MARQUEE].map((m, i) => (<span key={i}>{m}</span>))}
          </div>
        </div>

        {/* ── BUILT FOR AGENCIES ── */}
        <section id="features" style={{ padding: "120px 0 96px" }}>
          <div className="wrap" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px" }}>
            <div style={{ textAlign: "center", maxWidth: 620, margin: "0 auto 52px" }}>
              <h2 style={{ fontSize: 36, fontWeight: 700, marginBottom: 14 }}>Built for agencies. Loved by chatters.</h2>
              <p style={{ color: C.textDim, fontSize: 16 }}>Everything runs natively inside Telegram — no separate app, no extra login.</p>
            </div>
            <div className="card-row" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, marginBottom: 44, maxWidth: 850, marginLeft: "auto", marginRight: "auto" }}>
              {BUILT_CARDS.map((c, i) => (
                <div key={i} style={{ background: C.bgCard, border: `1px solid ${C.line}`, borderRadius: C.radius, padding: 26 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: C.accentGlow, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginBottom: 16 }}>{c.emoji}</div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 9 }}>{c.title}</h3>
                  <p style={{ fontSize: 13, color: C.textDim, lineHeight: 1.65 }}>{c.desc}</p>
                </div>
              ))}
            </div>
            <div style={{ display: "block", maxWidth: 900, margin: "0 auto", borderRadius: 16, overflow: "hidden", boxShadow: "0 0 0 1px rgba(47,184,255,0.12), 0 28px 80px rgba(0,0,0,0.55), 0 0 70px rgba(47,184,255,0.07)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/built_for.png" alt="Fan view — locked PPV before purchase vs unlocked after" style={{ width: "100%", height: "auto", display: "block" }} />
            </div>
            <p style={{ textAlign: "center", color: C.textFaint, fontSize: 13, marginTop: 44 }}>Fans unlock content in one tap — all inside Telegram.</p>
          </div>
        </section>

        {/* ── FOR AGENCY OWNERS ── */}
        <section style={{ padding: "96px 0" }}>
          <div className="wrap role-section" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px", display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 60, alignItems: "center" }}>
            <div>
              <div style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: C.accent, background: C.accentGlow, padding: "5px 13px", borderRadius: 99, marginBottom: 18 }}>FOR AGENCY OWNERS</div>
              <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 24, lineHeight: 1.15 }}>Run your agency from one dashboard.</h2>
              <ul style={{ display: "flex", flexDirection: "column", gap: 14, padding: 0, margin: 0 }}>
                {["See every chatter's conversations and sales","Track revenue per creator, per chatter, per day","Set role-based permissions for your team","Get notified the moment a PPV sells"].map((t, i) => (
                  <li key={i} style={{ listStyle: "none", display: "flex", alignItems: "flex-start", gap: 11, fontSize: 15, color: C.textDim }}>
                    <span style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(52,211,153,.15)", color: C.green, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, marginTop: 2, fontWeight: 800 }}>✓</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="role-screenshot" style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${C.line}`, boxShadow: "0 20px 50px rgba(0,0,0,0.5)", aspectRatio: "4/3" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/for_agency_owners.png" alt="PPVS Agency Dashboard" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          </div>
        </section>

        <hr style={{ border: "none", borderTop: `1px solid ${C.line}`, margin: 0 }} />

        {/* ── FOR CHATTERS ── */}
        <section style={{ padding: "96px 0" }}>
          <div className="wrap role-section reverse" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px", display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 60, alignItems: "center" }}>
            <div className="role-screenshot" style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${C.line}`, boxShadow: "0 20px 50px rgba(0,0,0,0.5)", aspectRatio: "4/3" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/for_chatters.png" alt="PPVS Chatter Workspace" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
            <div style={{ paddingLeft: 28 }}>
              <div style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: C.accent, background: C.accentGlow, padding: "5px 13px", borderRadius: 99, marginBottom: 18 }}>FOR CHATTERS</div>
              <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 24, lineHeight: 1.15 }}>One workspace.<br />Every model. Every fan.</h2>
              <ul style={{ display: "flex", flexDirection: "column", gap: 14, padding: 0, margin: 0 }}>
                {["Chat on multiple accounts from a single screen","Custom pricing per fan, set on the fly","Send PPVs straight from the vault, mid-conversation","Shared content library across the whole team"].map((t, i) => (
                  <li key={i} style={{ listStyle: "none", display: "flex", alignItems: "flex-start", gap: 11, fontSize: 15, color: C.textDim }}>
                    <span style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(52,211,153,.15)", color: C.green, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, marginTop: 2, fontWeight: 800 }}>✓</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <hr style={{ border: "none", borderTop: `1px solid ${C.line}`, margin: 0 }} />

        {/* ── FOR PAYOUTS ── */}
        <section style={{ padding: "96px 0" }}>
          <div className="wrap role-section" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px", display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 60, alignItems: "center" }}>
            <div>
              <div style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: C.accent, background: C.accentGlow, padding: "5px 13px", borderRadius: 99, marginBottom: 18 }}>FOR PAYOUTS</div>
              <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 24, lineHeight: 1.15 }}>Get paid directly to your wallet.</h2>
              <ul style={{ display: "flex", flexDirection: "column", gap: 14, padding: 0, margin: 0 }}>
                {["Fans pay using Telegram Stars","Stars convert to GRAM — we cover the network fee from our cut","Withdraw directly to your wallet after the holding period","No KYC. No payment processors."].map((t, i) => (
                  <li key={i} style={{ listStyle: "none", display: "flex", alignItems: "flex-start", gap: 11, fontSize: 15, color: C.textDim }}>
                    <span style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(52,211,153,.15)", color: C.green, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, marginTop: 2, fontWeight: 800 }}>✓</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="role-screenshot" style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${C.line}`, boxShadow: "0 20px 50px rgba(0,0,0,0.5)", aspectRatio: "4/3" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/for_payouts.png" alt="PPVS Wallet" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          </div>
        </section>

        {/* ── PRICING ── */}
        <section id="pricing" style={{ padding: "96px 0" }}>
          <div className="wrap" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px" }}>
            <div style={{ textAlign: "center", maxWidth: 620, margin: "0 auto 52px" }}>
              <h2 style={{ fontSize: 36, fontWeight: 700, marginBottom: 14 }}>Simple, performance-based pricing</h2>
              <p style={{ color: C.textDim, fontSize: 16 }}>Pay only when you earn. No subscriptions, no setup costs.</p>
            </div>
            <div className="price-wrap" style={{ maxWidth: 480, margin: "0 auto", position: "relative" }}>
              <div className="price-card" style={{ background: "linear-gradient(165deg,#141c2c,#0e1320)", border: `1px solid ${C.accentDeep}`, borderRadius: 20, padding: 42, position: "relative", boxShadow: "0 0 0 1px rgba(47,184,255,0.08), 0 30px 60px -20px rgba(13,143,224,.25), 0 0 80px -10px rgba(47,184,255,0.08)" }}>
                <span style={{ position: "absolute", bottom: -1, left: -1, width: 22, height: 22, border: "2px solid rgba(47,184,255,0.5)", borderWidth: "0 0 2px 2px", borderRadius: "0 0 0 20px" }} />
                <span style={{ position: "absolute", bottom: -1, right: -1, width: 22, height: 22, border: "2px solid rgba(47,184,255,0.5)", borderWidth: "0 0 2px 2px", borderRadius: "0 0 20px 0", transform: "scaleX(-1)" }} />
                <div style={{ position: "absolute", top: -13, left: 32, background: C.accent, color: "#06121c", fontSize: 10, fontWeight: 800, padding: "5px 14px", borderRadius: 99, letterSpacing: ".04em" }}>AVAILABLE NOW</div>
                <h3 style={{ fontSize: 13, color: C.textDim, fontWeight: 600, marginBottom: 18 }}>Platform Fee</h3>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 58, fontWeight: 700, fontFamily: "'Space Grotesk',Inter,sans-serif" }}>15%</span>
                  <span style={{ fontSize: 14, color: C.textDim }}>of every sale. Nothing else.</span>
                </div>
                <p style={{ fontSize: 12, color: C.textFaint, marginBottom: 26 }}>No tiers, no usage limits, no surprise invoices.</p>
                <ul style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 30, padding: 0 }}>
                  {["Agency dashboard","Chatter workspace","Content vault","Creator management","Analytics","Payout in crypto","Telegram Stars integration"].map((line, i) => (
                    <li key={i} style={{ listStyle: "none", fontSize: 14, color: C.textDim, display: "flex", gap: 9, alignItems: "center" }}>
                      <span style={{ color: C.green, fontWeight: 700 }}>✓</span>{line}
                    </li>
                  ))}
                </ul>
                <Link href={ctaHref} className="btn btn-primary" style={{ width: "100%", padding: 14, fontSize: 15, marginBottom: 12 }}>
                  Start Selling PPVs 💸
                </Link>
                <p style={{ textAlign: "center", fontSize: 12, color: C.textFaint }}>No monthly fees. No setup costs. No hidden charges.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" style={{ padding: "96px 0" }}>
          <div className="wrap" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px" }}>
            <div style={{ textAlign: "center", maxWidth: 620, margin: "0 auto 52px" }}>
              <h2 style={{ fontSize: 36, fontWeight: 700, marginBottom: 14 }}>Frequently Asked Questions 🙋</h2>
              <p style={{ color: C.textDim, fontSize: 16 }}>Everything you need to know before you start selling.</p>
            </div>
            <div style={{ maxWidth: 760, margin: "0 auto" }}>
              {FAQ_GROUPS.map((g) => (
                <div key={g.title} style={{ marginBottom: 36 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", color: C.accent, marginBottom: 12, textTransform: "uppercase" }}>{g.title}</div>
                  {g.items.map((it, i) => (
                    <FaqItem key={i} q={it.q} a={it.a} defaultOpen={!!it.open} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section className="final-cta" style={{ textAlign: "center", padding: "104px 0", position: "relative" }}>
          <div className="wrap" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px", position: "relative" }}>
            <h2 style={{ fontSize: 40, fontWeight: 700, marginBottom: 14 }}>Ready to monetize your Telegram audience?</h2>
            <p style={{ color: C.textDim, fontSize: 17, marginBottom: 30 }}>Turn conversations into revenue on a more personal level.</p>
            <Link href={ctaHref} className="btn btn-primary btn-lg">Start Selling PPVs 💸</Link>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 7, fontSize: 13, color: C.textFaint, flexWrap: "wrap", marginTop: 18 }}>
              <span>No KYC</span><span style={{ color: C.line }}>•</span><span>No monthly fees</span><span style={{ color: C.line }}>•</span><span>No setup costs</span>
            </div>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ borderTop: `1px solid ${C.line}`, padding: "56px 0 32px" }}>
          <div className="wrap" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 48px" }}>
            <div className="foot-grid" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: 32, marginBottom: 40 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/landing/logo.png" alt="PPVS.IO" style={{ width: 28, height: 28, borderRadius: 7, objectFit: "cover" }} />
                  PPVS.IO
                </div>
                <p style={{ fontSize: 12, color: C.textFaint, maxWidth: 220, lineHeight: 1.65 }}>The complete monetization platform for OFM agencies on Telegram.</p>
              </div>
              <div>
                <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: 14, color: C.text }}>Product</h4>
                <a href="#features" style={FA_LINK}>Features</a>
                <a href="#pricing" style={FA_LINK}>Pricing</a>
                <a href="#faq" style={FA_LINK}>FAQ</a>
                <Link href="/login" style={FA_LINK}>Login</Link>
              </div>
              <div>
                <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: 14, color: C.text }}>Company</h4>
                <a href="https://t.me/manimayn" target="_blank" rel="noreferrer" style={FA_LINK}>Contact</a>
                <a href="https://t.me/manimayn" target="_blank" rel="noreferrer" style={FA_LINK}>Book a demo</a>
              </div>
              <div>
                <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: 14, color: C.text }}>Legal</h4>
                <Link href="/terms" style={FA_LINK}>Terms of Service</Link>
                <Link href="/terms" style={FA_LINK}>Privacy Policy</Link>
                <Link href="/terms" style={FA_LINK}>Acceptable Use Policy</Link>
                <Link href="/terms" style={FA_LINK}>Content Policy</Link>
                <Link href="/terms" style={FA_LINK}>Copyright &amp; Takedowns</Link>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 24, fontSize: 12, color: C.textFaint, textAlign: "center" }}>© 2026 PPVS.IO. All rights reserved.</div>
          </div>
        </footer>
      </div>
    </div>
  );
}

const FA_LINK: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: C.textFaint,
  marginBottom: 9,
  textDecoration: "none",
};
