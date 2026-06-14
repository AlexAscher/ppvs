"use client";

// Landing page — port of /Create_start_design/src/app/LandingPage.tsx, kept
// 1:1 with the reference's copy / layout / styles. The only intentional
// deviations from the reference are:
//   - Next.js `Link` instead of bare `<a>` for internal app routes;
//   - the PNG logo is served from /public/landing/logo.png (copied from the
//     reference's src/imports);
//   - auth-aware nav + hero + CTA buttons: when a Supabase session exists in
//     the browser, the labels flip to "Dashboard" / "Open dashboard" and all
//     three CTAs point at /dashboard. The auto-redirect that used to fire
//     on mount has been removed — visitors always land on this marketing
//     page and choose to enter the app via a button.
//
// Don't refactor the markup to "improve" it; the design is the contract.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LockOpen,
  Zap,
  Check,
  ArrowRight,
  ChevronRight,
  Bot,
  ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase";

const OF_BLUE = "#00AFF0";
const LOGO_SRC = "/landing/logo.png";
// Telegram contact for "Book a demo" + footer Contact link.
const BOOK_DEMO_HREF = "https://t.me/manimayn";

const agencyFeatures = [
  {
    id: "agency-dashboard",
    label: "Dashboard",
    desc: "See your total earnings, per-model breakdowns, per-chatter performance, and conversion rates — all in one view, updated in real time.",
  },
  {
    id: "agency-vault",
    label: "Vault",
    desc: "Upload your photos, videos, and bundles once, tag them by model and content type, and every chatter on your team can find and send the right content instantly.",
  },
  {
    id: "agency-creators",
    label: "Creators",
    desc: "Add models, connect their Telegram accounts, and manage everything from one place — no logging in and out of different accounts.",
  },
  {
    id: "agency-chatters",
    label: "Chatters",
    desc: "Your chatters see live Telegram DMs, pick content from the vault, and send PPVs without ever leaving the platform.",
  },
  {
    id: "agency-wallet",
    label: "Wallet",
    desc: "Your balance updates after every sale — withdraw to USDT, BTC, or ETH anytime with no KYC and a $20 minimum.",
  },
];

const chatterFeatures = [
  {
    id: "chatter-creators",
    label: "Creators",
    desc: "Switch between model accounts in one click — unread notifications appear per model so nothing gets missed across your whole roster.",
  },
  {
    id: "chatter-vault",
    label: "Vault",
    desc: "Filter the vault by tag, select one item or bundle multiple together, and the total price calculates automatically before sending.",
  },
  {
    id: "chatter-tips",
    label: "Tips",
    desc: "Send a custom tip request with a personal message directly into the fan's Telegram DM — one click, no manual link generation.",
  },
  {
    id: "chatter-notes",
    label: "Notes",
    desc: "Leave private notes on any fan and tag them with emoji based on their spend — so every chatter knows exactly who they're dealing with before they type a word.",
  },
  {
    id: "chatter-dashboard",
    label: "Dashboard",
    desc: "Chatters see their own total sales in real time — commission arrangements with the agency stay completely private.",
  },
];

const faqGroups = [
  {
    group: "Payments & Payouts",
    items: [
      { q: "How do fans pay?", a: "Fans pay by card (Visa, Mastercard, Apple Pay) or crypto. No account creation needed — they click the link, pay, and the content unlocks instantly." },
      { q: "How do I get paid?", a: "Revenue lands in your ppvs.io balance after each transaction. Withdraw anytime to USDT, BTC, or ETH. Minimum withdrawal is $20. No KYC required to withdraw." },
      { q: "What is the 10% fee exactly?", a: "We take 10% of every transaction that goes through the platform. This covers payment processing, hosting, and our platform fee. There are no other fees — no monthly cost, no setup fee, no per-seat pricing." },
      { q: "Are there chargebacks?", a: "Crypto payments are irreversible — no chargebacks ever." },
    ],
  },
  {
    group: "Telegram & Technical",
    items: [
      { q: "How does the Telegram integration work?", a: "You connect your model's Telegram account via MTProto API — the same protocol Telegram uses natively. Fans interact with the real account. Your chatters work inside ppvs.io and the messages appear on both sides as normal Telegram DMs." },
      { q: "Will Telegram ban the account?", a: "MTProto API access is what Telegram itself uses. We implement session management carefully to mimic normal human behavior. Thousands of OFM agencies use MTProto-based tools daily. There is always a small risk with any third-party API usage, but we take every precaution to minimize it." },
      { q: "Can one chatter manage multiple models?", a: "Yes. Chatters switch between model accounts with one click from the model selector bar. Unread message notifications appear per model so nothing gets missed." },
    ],
  },
  {
    group: "Team & Agency",
    items: [
      { q: "Can I see what each chatter is selling?", a: "Yes. Every sale is logged with the chatter who sent it. You see revenue broken down by chatter, by model, and by content type in real time." },
      { q: "Do chatters see each other's stats or earnings?", a: "No. Each chatter sees only their own sales total. Commission arrangements between you and your chatters stay private — that's between you and them." },
      { q: "How do I add chatters?", a: "From your agency dashboard, go to Chatters, click Add Chatter, enter their email. They receive a login link and get access to the chatter workspace immediately. You control which models they can access." },
    ],
  },
  {
    group: "Getting Started",
    items: [
      { q: "How long does setup take?", a: "Under 5 minutes. Connect your Telegram account, upload your first piece of content to the vault, add your chatter or chat yourself, and you're live. No calls, no contracts, no approval process." },
      { q: "Do I need a registered business?", a: "No. No KYC, no business registration, no ID verification required to use the platform or withdraw earnings." },
      { q: "What if I want to talk to someone before signing up?", a: "Hit the Book a demo button at the top of the page — it goes straight to our Telegram where you can ask anything before committing to anything." },
    ],
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
      <div className="flex items-center justify-between py-4 gap-4">
        <span className="text-white" style={{ fontSize: "15px", fontWeight: 500 }}>{q}</span>
        <ChevronDown className="shrink-0 w-4 h-4 transition-transform" style={{ color: "#6b7280", transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
      </div>
      {open && <p className="pb-5" style={{ fontSize: "14px", color: "#8b95a8", lineHeight: 1.75 }}>{a}</p>}
    </div>
  );
}

function GreyImageBox({ label, minHeight = 320 }: { label: string; minHeight?: number }) {
  return (
    <div className="w-full rounded-2xl flex flex-col items-center justify-center" style={{ background: "#1a1f2a", border: "1px solid rgba(255,255,255,0.07)", minHeight }}>
      <div className="flex flex-col items-center gap-3 text-center px-8">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="2" width="14" height="10" rx="2" stroke="#374151" strokeWidth="1.5" />
            <rect x="5" y="14" width="8" height="2" rx="1" fill="#374151" />
          </svg>
        </div>
        <span style={{ fontSize: "12px", color: "#374151" }}>{label}</span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const allFeatures = [...agencyFeatures, ...chatterFeatures];
  const [activeFeature, setActiveFeature] = useState<string>(allFeatures[0].id);
  const currentFeature = allFeatures.find((f) => f.id === activeFeature)!;

  // Session-aware CTA labels + targets. `null` until we know — we keep the
  // logged-out labels as the default so first paint matches the reference;
  // when a session is found we swap to dashboard-pointing CTAs without a
  // navigation. Removed the previous auto-redirect to /dashboard on mount:
  // visitors stay on the landing page until they click a button.
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setAuthed(!!session);
    }).catch(() => {
      if (!cancelled) setAuthed(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loginHref = authed ? "/dashboard" : "/login";
  const loginLabel = authed ? "Dashboard" : "Login";
  const startHref = authed ? "/dashboard" : "/signup";
  const startNavLabel = authed ? "Open dashboard" : "Get Started";
  const startHeroLabel = authed ? "Open dashboard" : "Start earning 💸";
  const startPricingLabel = authed ? "Open dashboard" : "Start earning 💸";
  const startCtaLabel = authed ? "Open dashboard" : "Start earning";

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}>

      {/* ── NAV ── */}
      <nav className="fixed top-0 w-full z-50" style={{ background: "rgba(8,11,18,0.9)", backdropFilter: "blur(14px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-[1200px] mx-auto px-8 h-[66px] flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_SRC} alt="ppvs.io" style={{ height: "30px", width: "auto", objectFit: "contain" }} />
          <div className="flex items-center gap-5">
            <Link href={loginHref} className="transition-colors hover:text-white" style={{ fontSize: "14px", color: "#9ca3af" }}>
              {loginLabel}
            </Link>
            <Link href={startHref} className="px-5 py-2.5 rounded-lg text-white transition-all hover:opacity-90" style={{ background: OF_BLUE, fontSize: "14px", fontWeight: 600, display: "inline-block" }}>
              {startNavLabel}
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="min-h-screen flex flex-col items-center justify-center px-8 text-center" style={{ background: "#080b12", paddingTop: "140px", paddingBottom: "140px" }}>
        <div className="max-w-[820px] w-full">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-10" style={{ background: "rgba(0,175,240,0.1)", border: "1px solid rgba(0,175,240,0.25)", color: OF_BLUE, fontSize: "12px", fontWeight: 600, letterSpacing: "0.04em" }}>
            <LockOpen className="w-3.5 h-3.5" />
            all-in-one OFM management software
          </div>

          <h1 className="text-white mb-6" style={{ fontSize: "60px", fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.03em" }}>
            Stop leaving money on the table —<br />
            <span style={{ color: OF_BLUE }}>sell inside Telegram.</span>
          </h1>

          <p className="mb-10 mx-auto" style={{ fontSize: "18px", color: "#8b95a8", maxWidth: "600px", lineHeight: 1.7 }}>
            ppvs.io is the all-in-one management platform for agencies monetizing inside Telegram — for a flat fee of 10%.
          </p>

          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-4">
              <Link href={startHref} className="px-8 py-4 rounded-xl text-white transition-all hover:opacity-90 active:scale-95" style={{ background: OF_BLUE, fontSize: "16px", fontWeight: 700, display: "inline-block" }}>
                {startHeroLabel}
              </Link>
              <a href={BOOK_DEMO_HREF} target="_blank" rel="noopener noreferrer" className="px-8 py-4 rounded-xl text-white transition-all hover:opacity-80" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.13)", fontSize: "16px", fontWeight: 600, display: "inline-block" }}>
                Book a demo →
              </a>
            </div>
            <p style={{ fontSize: "13px", color: "#4b5563" }}>Free forever · No KYC · No monthly fees</p>
          </div>

          {/* Video placeholder */}
          <div className="mt-12 w-full rounded-2xl overflow-hidden" style={{ background: "#141924", border: "1px solid rgba(255,255,255,0.08)", aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="#374151">
                  <path d="M7 4.5a1 1 0 0 1 1.6-.8l9 6.5a1 1 0 0 1 0 1.6l-9 6.5A1 1 0 0 1 7 17.5v-13z" />
                </svg>
              </div>
              <span style={{ fontSize: "13px", color: "#4b5563" }}>Product video coming soon</span>
            </div>
          </div>

          <p className="mt-5" style={{ fontSize: "13px", color: "#374151" }}>We only make money when you do. 10% of revenue, nothing else.</p>
        </div>
      </section>

      {/* ── PAYMENT CAROUSEL DIVIDER ── */}
      <div style={{ background: "#0d1117", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", overflow: "hidden", padding: "16px 0" }}>
        <style>{`
          @keyframes ppv-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
          .ppv-marquee { display: flex; width: max-content; animation: ppv-marquee 30s linear infinite; }
          .ppv-marquee:hover { animation-play-state: paused; }
        `}</style>
        <div className="ppv-marquee">
          {[
            { label: "Visa", symbol: "💳" }, { label: "Mastercard", symbol: "💳" },
            { label: "Apple Pay", symbol: "🍎" }, { label: "Google Pay", symbol: "🔵" },
            { label: "Bitcoin", symbol: "₿" }, { label: "USDT", symbol: "💵" },
            { label: "Ethereum", symbol: "⟠" }, { label: "USDC", symbol: "🔵" },
            { label: "Litecoin", symbol: "⚡" }, { label: "Binance Pay", symbol: "🟡" },
            { label: "Visa", symbol: "💳" }, { label: "Mastercard", symbol: "💳" },
            { label: "Apple Pay", symbol: "🍎" }, { label: "Google Pay", symbol: "🔵" },
            { label: "Bitcoin", symbol: "₿" }, { label: "USDT", symbol: "💵" },
            { label: "Ethereum", symbol: "⟠" }, { label: "USDC", symbol: "🔵" },
            { label: "Litecoin", symbol: "⚡" }, { label: "Binance Pay", symbol: "🟡" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 mx-3 px-5 py-2 rounded-full" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", whiteSpace: "nowrap" }}>
              <span style={{ fontSize: "14px" }}>{item.symbol}</span>
              <span style={{ fontSize: "13px", fontWeight: 500, color: "#9ca3af" }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section id="features" className="py-28 px-8" style={{ background: "#0f1420" }}>
        <div className="max-w-[1200px] mx-auto">
          <div className="mb-14">
            <h2 className="text-white mb-3" style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.02em" }}>
              One platform. Every tool your agency needs. 📈
            </h2>
            <p style={{ fontSize: "16px", color: "#6b7280" }}>Built specifically for OFM agencies running Telegram.</p>
          </div>

          {/* Interactive feature selector */}
          <div className="flex gap-12 mb-16" style={{ minHeight: "380px" }}>
            {/* Left: feature list */}
            <div className="flex flex-col gap-8 shrink-0" style={{ width: "260px" }}>
              <div>
                <div className="mb-3" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", color: "#4b5563", textTransform: "uppercase" }}>Agency</div>
                <div className="flex flex-col gap-1">
                  {agencyFeatures.map((f) => {
                    const isActive = activeFeature === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => setActiveFeature(f.id)}
                        className="flex items-center justify-between text-left px-4 py-2.5 rounded-lg transition-all"
                        style={{
                          background: isActive ? "rgba(0,175,240,0.1)" : "transparent",
                          border: isActive ? "1px solid rgba(0,175,240,0.3)" : "1px solid transparent",
                          color: isActive ? OF_BLUE : "#9ca3af",
                          fontSize: "14px",
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        {f.label}
                        <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="mb-3" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", color: "#4b5563", textTransform: "uppercase" }}>Chatter</div>
                <div className="flex flex-col gap-1">
                  {chatterFeatures.map((f) => {
                    const isActive = activeFeature === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => setActiveFeature(f.id)}
                        className="flex items-center justify-between text-left px-4 py-2.5 rounded-lg transition-all"
                        style={{
                          background: isActive ? "rgba(0,175,240,0.1)" : "transparent",
                          border: isActive ? "1px solid rgba(0,175,240,0.3)" : "1px solid transparent",
                          color: isActive ? OF_BLUE : "#9ca3af",
                          fontSize: "14px",
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        {f.label}
                        <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right: image + feature info */}
            <div className="flex-1 rounded-2xl flex flex-col overflow-hidden" style={{ background: "#141924", border: `1px solid rgba(0,175,240,0.2)` }}>
              <div className="flex-1 flex items-center justify-center px-12 py-12 text-center" style={{ background: "#181d28" }}>
                <div className="flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(0,175,240,0.12)", border: "1px solid rgba(0,175,240,0.25)" }}>
                    <Zap className="w-6 h-6" style={{ color: OF_BLUE }} />
                  </div>
                  <div className="text-white" style={{ fontSize: "22px", fontWeight: 700 }}>{currentFeature.label}</div>
                  <div style={{ color: "#8b95a8", fontSize: "15px", maxWidth: "420px", lineHeight: 1.7 }}>{currentFeature.desc}</div>
                </div>
              </div>
              <div className="flex items-center justify-between px-6 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "#0f1420" }}>
                <span style={{ fontSize: "12px", color: "#374151" }}>Screenshot / preview coming soon</span>
                <span style={{ fontSize: "12px", color: OF_BLUE, opacity: 0.6 }}>ppvs.io</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── HOW IT WORKS — two alternating rows ── */}
      <section id="how" style={{ background: "#0d1117" }}>
        {/* ROW 1 — Text left, image right */}
        <div className="max-w-[1200px] mx-auto px-8 py-16">
          <div className="flex items-center gap-20">
            {/* Text */}
            <div className="flex-1">
              <div className="mb-4 inline-block px-3 py-1 rounded-full" style={{ background: "rgba(0,175,240,0.1)", border: "1px solid rgba(0,175,240,0.2)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", color: OF_BLUE, textTransform: "uppercase" }}>
                How selling works
              </div>
              <h2 className="text-white mb-5" style={{ fontSize: "38px", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
                Fan pays. Content delivers.<br />You do nothing.
              </h2>
              <p className="mb-8" style={{ fontSize: "16px", color: "#8b95a8", lineHeight: 1.8, maxWidth: "480px" }}>
                Your chatter picks content from the vault and sends a blurred preview with a payment link directly into the fan&apos;s Telegram DM. The fan pays by card or crypto — no account, no registration. The moment payment confirms, our system automatically sends the same file unblurred to the fan. Your chatter never has to follow up.
              </p>
              <div className="flex flex-col gap-3">
                {[
                  "Fan pays by Visa, Mastercard, or crypto",
                  "Content unlocks automatically on payment",
                  "Your chatter is notified instantly",
                ].map((line, i) => (
                  <div key={i} className="flex items-center gap-3" style={{ fontSize: "14px", color: "#d1d5db" }}>
                    <span style={{ color: OF_BLUE, fontWeight: 700 }}>✓</span>
                    {line}
                  </div>
                ))}
              </div>
            </div>
            {/* Image */}
            <div className="flex-1">
              <GreyImageBox label="Chatter workspace — blurred PPV card being sent in a Telegram DM with a pay button visible" minHeight={380} />
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }} />

        {/* ROW 2 — Image left, text right */}
        <div className="max-w-[1200px] mx-auto px-8 py-16">
          <div className="flex items-center gap-20">
            {/* Image */}
            <div className="flex-1">
              <GreyImageBox label="Withdrawal screen — balance, crypto address field, USDT / BTC / ETH options visible" minHeight={380} />
            </div>
            {/* Text */}
            <div className="flex-1">
              <div className="mb-4 inline-block px-3 py-1 rounded-full" style={{ background: "rgba(0,175,240,0.1)", border: "1px solid rgba(0,175,240,0.2)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", color: OF_BLUE, textTransform: "uppercase" }}>
                How payouts work
              </div>
              <h2 className="text-white mb-5" style={{ fontSize: "38px", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
                Your money. Your wallet.<br />No middlemen.
              </h2>
              <p className="mb-8" style={{ fontSize: "16px", color: "#8b95a8", lineHeight: 1.8, maxWidth: "480px" }}>
                Every sale goes straight to your ppvs.io balance. Withdraw anytime to USDT, BTC, or ETH — no KYC, no bank transfer, no waiting period. Minimum withdrawal is $20. Most payouts land in your wallet within minutes.
              </p>
              <div className="flex flex-col gap-3">
                {[
                  "No KYC required to withdraw",
                  "USDT, BTC, ETH supported",
                  "$20 minimum · no maximum",
                ].map((line, i) => (
                  <div key={i} className="flex items-center gap-3" style={{ fontSize: "14px", color: "#d1d5db" }}>
                    <span style={{ color: OF_BLUE, fontWeight: 700 }}>✓</span>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="py-28 px-8" style={{ background: "#0f1420" }}>
        <div className="max-w-[880px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-white mb-4" style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.02em" }}>
              No monthly fees. Ever. 💎
            </h2>
            <p style={{ fontSize: "16px", color: "#6b7280", maxWidth: "480px", margin: "0 auto", lineHeight: 1.7 }}>
              We take 10% of what flows through the platform. That&apos;s it. If you don&apos;t earn, we don&apos;t earn.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "stretch" }}>
            {/* Plan 1 — Free forever */}
            <div className="flex flex-col p-8 rounded-2xl" style={{ background: "#141924", border: `2px solid ${OF_BLUE}`, position: "relative" }}>
              <div style={{ position: "absolute", top: "-14px", left: "32px", background: OF_BLUE, color: "#fff", fontSize: "11px", fontWeight: 700, padding: "4px 14px", borderRadius: "999px", letterSpacing: "0.04em" }}>
                AVAILABLE NOW
              </div>
              <div className="mb-5">
                <div className="text-white mb-2" style={{ fontSize: "22px", fontWeight: 700 }}>Free forever</div>
                <div style={{ fontSize: "14px", color: "#6b7280", lineHeight: 1.6 }}>The platform is always free. We only take a cut when a fan pays.</div>
              </div>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-white" style={{ fontSize: "44px", fontWeight: 800, letterSpacing: "-0.03em" }}>10%</span>
                <span style={{ fontSize: "14px", color: "#6b7280" }}>of every sale · nothing else</span>
              </div>
              <p className="mb-8" style={{ fontSize: "13px", color: "#4b5563", lineHeight: 1.7 }}>
                No subscription. No setup fee. No hidden charges. We take 10% of each transaction — card or crypto — and you keep the rest. Payouts in USDT, BTC, or ETH with no KYC required.
              </p>
              <div className="flex flex-col gap-3 mb-8 flex-1">
                {[
                  "Unlimited creators & chatters",
                  "Full agency dashboard with per-model stats",
                  "Content vault with tagging",
                  "Real-time revenue tracking",
                  "Telegram native integration",
                  "Crypto & card payments · no KYC payouts",
                  "Role-based access for your whole team",
                ].map((f, i) => (
                  <div key={i} className="flex items-start gap-3" style={{ fontSize: "14px", color: "#d1d5db" }}>
                    <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: OF_BLUE }} />
                    {f}
                  </div>
                ))}
              </div>
              <Link href={startHref} className="w-full py-4 rounded-xl text-white transition-all hover:opacity-90 text-center" style={{ background: OF_BLUE, fontSize: "15px", fontWeight: 700, display: "block" }}>
                {startPricingLabel}
              </Link>
              <p className="text-center mt-3" style={{ fontSize: "12px", color: "#4b5563" }}>No credit card. No KYC. No contracts.</p>
            </div>

            {/* Plan 2 — AI Autopilot */}
            <div className="flex flex-col p-8 rounded-2xl" style={{ background: "#0d1018", border: "2px solid rgba(255,255,255,0.08)" }}>
              <div className="inline-flex items-center gap-2 mb-5 px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#6b7280", fontSize: "11px", fontWeight: 700, width: "fit-content", letterSpacing: "0.04em" }}>
                <Bot className="w-3 h-3" /> COMING SOON
              </div>
              <div className="mb-5">
                <div className="text-white mb-2" style={{ fontSize: "22px", fontWeight: 700 }}>AI Autopilot 🤖</div>
                <div style={{ fontSize: "14px", color: "#6b7280", lineHeight: 1.6 }}>Your agency runs 24/7 — even when your chatters are offline.</div>
              </div>
              <div className="mb-2">
                <span className="text-white" style={{ fontSize: "44px", fontWeight: 800, letterSpacing: "-0.03em" }}>TBD</span>
              </div>
              <p className="mb-8" style={{ fontSize: "13px", color: "#4b5563", lineHeight: 1.7 }}>
                The AI handles fan conversations, recommends PPVs based on spending history, and sends them automatically.
              </p>
              <div className="flex flex-col gap-3 mb-8 flex-1">
                {[
                  "Everything in Free forever",
                  "AI that chats, sells, and follows up — 24/7",
                  "Picks the right PPV based on fan history",
                  "Auto tip requests timed to fan behavior",
                  "Priority support + dedicated onboarding",
                ].map((f, i) => (
                  <div key={i} className="flex items-start gap-3" style={{ fontSize: "14px", color: "#4b5563" }}>
                    <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#374151" }} />
                    {f}
                  </div>
                ))}
              </div>
              <button disabled className="w-full py-4 rounded-xl transition-all" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#6b7280", fontSize: "15px", fontWeight: 600, cursor: "not-allowed" }}>
                Join waitlist →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── INSTAGRAM TIP SECTION ── */}
      <section style={{ background: "#0d1117", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-[1200px] mx-auto px-8 py-16">
          <div className="flex items-center gap-16">
            {/* Left text */}
            <div className="flex-1">
              <div className="mb-3 inline-block px-3 py-1 rounded-full" style={{ background: "rgba(0,175,240,0.1)", border: "1px solid rgba(0,175,240,0.2)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", color: OF_BLUE, textTransform: "uppercase" }}>
                The smartest agencies know this
              </div>
              <h2 className="text-white mb-4" style={{ fontSize: "30px", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
                No links. More reach. More fans.
              </h2>
              <p className="mb-6" style={{ fontSize: "14px", color: "#8b95a8", lineHeight: 1.75, maxWidth: "480px" }}>
                Instagram suppresses profiles that put links in their bio — your posts get shown to fewer people and the account dies faster. The agencies growing the fastest write their Telegram username directly in the bio as plain text.
              </p>
              <p className="mb-6" style={{ fontSize: "14px", color: "#8b95a8", lineHeight: 1.75, maxWidth: "480px" }}>
                No clickable link means no suppression. Instagram treats the profile like any normal account — better reach, longer lifespan, more fans landing in Telegram every day. Once they&apos;re in Telegram, ppvs.io takes care of the rest.
              </p>
              <div className="flex flex-col gap-2.5">
                {[
                  "No link = no suppression from Instagram algorithm",
                  "Profile stays active longer and reaches more people",
                  "Fans land in Telegram — your chatters take it from there",
                ].map((line, i) => (
                  <div key={i} className="flex items-start gap-3" style={{ fontSize: "13px", color: "#d1d5db" }}>
                    <span style={{ color: OF_BLUE, fontWeight: 700 }}>✓</span>
                    {line}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: half-size grey image */}
            <div style={{ width: "320px", flexShrink: 0 }}>
              <GreyImageBox label="Instagram profile — bio with t3l3gram username visible" minHeight={280} />
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-28 px-8" style={{ background: "#0f1420" }}>
        <div className="max-w-[760px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-white" style={{ fontSize: "34px", fontWeight: 800, letterSpacing: "-0.02em" }}>
              Common questions 🙋
            </h2>
          </div>

          <div className="flex flex-col gap-14">
            {faqGroups.map((group, gi) => (
              <div key={gi}>
                <div className="mb-4" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", color: OF_BLUE, textTransform: "uppercase" }}>
                  {group.group}
                </div>
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                  {group.items.map((item, ii) => (
                    <FaqItem key={ii} q={item.q} a={item.a} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-28 px-8" style={{ background: "#080b12", borderTop: "1px solid rgba(0,175,240,0.1)" }}>
        <div className="max-w-[640px] mx-auto text-center">
          <h2 className="text-white mb-5" style={{ fontSize: "42px", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
            Your fans are waiting.<br />Start earning. 💸
          </h2>
          <p className="mb-10" style={{ fontSize: "17px", color: "#6b7280", lineHeight: 1.75, maxWidth: "520px", margin: "0 auto 40px" }}>
            No setup fee. No monthly cost. No KYC. Just connect your Telegram, upload your vault, and your chatters can start selling today.
          </p>
          <Link href={startHref} className="inline-flex items-center gap-2 px-9 py-4 rounded-xl text-white transition-all hover:opacity-90" style={{ background: OF_BLUE, fontSize: "16px", fontWeight: 700 }}>
            {startCtaLabel}
            <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="mt-4" style={{ fontSize: "13px", color: "#374151" }}>No credit card · No KYC · No monthly fees</p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-14 px-8" style={{ background: "#080b12", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-[1200px] mx-auto">
          <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr", gap: "48px", marginBottom: "40px" }}>
            <div>
              <div className="mb-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={LOGO_SRC} alt="ppvs.io" style={{ height: "26px", width: "auto", objectFit: "contain" }} />
              </div>
            </div>
            <div>
              <div className="text-white mb-5" style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.06em" }}>Product</div>
              <div className="flex flex-col gap-3">
                <a href="#features" className="transition-colors hover:text-white" style={{ fontSize: "14px", color: "#4b5563" }}>Features</a>
                <a href="#pricing" className="transition-colors hover:text-white" style={{ fontSize: "14px", color: "#4b5563" }}>Pricing</a>
                <a href="#faq" className="transition-colors hover:text-white" style={{ fontSize: "14px", color: "#4b5563" }}>FAQ</a>
                <Link href={loginHref} className="transition-colors hover:text-white" style={{ fontSize: "14px", color: "#4b5563" }}>{loginLabel}</Link>
              </div>
            </div>
            <div>
              <div className="text-white mb-5" style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.06em" }}>Company</div>
              <div className="flex flex-col gap-3">
                <a href={BOOK_DEMO_HREF} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white" style={{ fontSize: "14px", color: "#4b5563" }}>Contact</a>
                <a href={BOOK_DEMO_HREF} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white" style={{ fontSize: "14px", color: "#4b5563" }}>Book a demo</a>
              </div>
            </div>
          </div>
          <div className="pt-8 text-center" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: "13px", color: "#374151" }}>
            © 2026 ppvs.io. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
