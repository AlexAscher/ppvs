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
  Check,
  ChevronRight,
  Bot,
  ChevronDown,
  Lock,
  Users,
  TrendingUp,
  Wallet as WalletIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase";

const OF_BLUE = "#00AFF0";
const LOGO_SRC = "/landing/logo.png";
// Telegram contact for "Book a demo" + footer Contact link.
const BOOK_DEMO_HREF = "https://t.me/manimayn";

const agencyFeatures = [
  {
    id: "agency-dashboard",
    emoji: "📊",
    label: "Agency Dashboard",
    tagline: "Track your entire operation.",
    desc: "Monitor revenue, creator performance, chatter performance, and conversion rates in real time from a single dashboard.",
  },
  {
    id: "agency-vault",
    emoji: "🔒",
    label: "Vault",
    tagline: "Organize content once. Sell it forever.",
    desc: "Upload photos, videos, and bundles, then tag everything by creator and content type so your team can find and send the right content instantly.",
  },
  {
    id: "agency-creators",
    emoji: "🎭",
    label: "Creators",
    tagline: "Manage every creator in one place.",
    desc: "Connect Telegram accounts, organize content, and switch between creators without constantly logging in and out of different accounts.",
  },
  {
    id: "agency-chatters",
    emoji: "💬",
    label: "Chatters",
    tagline: "Give chatters everything they need to sell.",
    desc: "View live Telegram conversations, send PPVs, request tips, and manage fan information without leaving the platform.",
  },
  {
    id: "agency-wallet",
    emoji: "💰",
    label: "Wallet",
    tagline: "Get paid instantly.",
    desc: "Revenue appears in your balance after every sale. Withdraw to USDT, BTC, or ETH anytime with no KYC and a low minimum withdrawal.",
  },
];

const chatterFeatures = [
  {
    id: "chatter-workspace",
    emoji: "💬",
    label: "Sales Workspace",
    tagline: "Everything your chatter needs to get sales.",
    desc: "Chat with fans in real time, access vault, request tips, manage fan information, and switch between models.",
  },
  {
    id: "chatter-vault",
    emoji: "💸",
    label: "Sell PPVs",
    tagline: "Send paid content in seconds.",
    desc: "Filter content by tag, bundle multiple items together, and let pricing calculate automatically before sending.",
  },
  {
    id: "chatter-tips",
    emoji: "🎁",
    label: "Request Tips",
    tagline: "Ask for tips with one click.",
    desc: "Send custom tip requests and personal messages directly into Telegram chats.",
  },
  {
    id: "chatter-notes",
    emoji: "📋",
    label: "Fan Information",
    tagline: "Know who's worth your attention.",
    desc: "View spending history, leave notes, and tag fans so every chatter has context before starting a conversation.",
  },
  {
    id: "chatter-dashboard",
    emoji: "📊",
    label: "Chatter Dashboard",
    tagline: "See performance in real time.",
    desc: "View personal sales, conversion metrics, and earnings.",
  },
];

const faqGroups = [
  {
    group: "Payments & Payouts",
    items: [
      { q: "How do fans pay?", a: "Fans pay by card (Visa, Mastercard, Apple Pay) or crypto. No account creation needed — they click the link, pay, and the content unlocks instantly." },
      { q: "How do I get paid?", a: "Revenue lands in your ppvs.io balance after each transaction. Withdraw anytime to USDT, BTC, or ETH. Minimum withdrawal is $20. No KYC required to withdraw." },
      { q: "What is the 12% fee exactly?", a: "We take 12% of every transaction that goes through the platform. This covers payment processing, hosting, and our platform fee. There are no other fees — no monthly cost, no setup fee, no per-seat pricing." },
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

// Brand marks for the payment-method marquee. Kept as compact inline SVGs so
// there are no extra image assets to host. Crypto coins use their official
// colours + symbol glyph; card networks use their real marks/wordmarks.
function PayIcon({ name }: { name: string }) {
  const S = 18;
  switch (name) {
    case "Visa":
      return (
        <svg width="34" height="12" viewBox="0 0 48 16" aria-hidden>
          <text x="0" y="13" fontFamily="Arial, Helvetica, sans-serif" fontSize="15" fontStyle="italic" fontWeight="800" fill="#2563eb" letterSpacing="0.5">VISA</text>
        </svg>
      );
    case "Mastercard":
      return (
        <svg width={S} height={S} viewBox="0 0 24 24" aria-hidden>
          <circle cx="9" cy="12" r="6.2" fill="#EB001B" />
          <circle cx="15" cy="12" r="6.2" fill="#F79E1B" fillOpacity="0.95" />
          <path d="M12 7.1a6.2 6.2 0 0 1 0 9.8 6.2 6.2 0 0 1 0-9.8z" fill="#FF5F00" />
        </svg>
      );
    case "Apple Pay":
      return (
        <svg width={S} height={S} viewBox="0 0 24 24" fill="#e5e7eb" aria-hidden>
          <path d="M17.05 12.9c-.03-2.6 2.13-3.85 2.22-3.91-1.21-1.77-3.1-2.02-3.77-2.05-1.6-.16-3.13.94-3.94.94-.81 0-2.07-.92-3.4-.9-1.75.03-3.36 1.02-4.26 2.58-1.82 3.15-.46 7.8 1.3 10.36.86 1.25 1.88 2.66 3.22 2.6 1.3-.05 1.78-.84 3.35-.84 1.56 0 2 .84 3.37.82 1.39-.03 2.27-1.27 3.12-2.53.98-1.45 1.39-2.85 1.41-2.92-.03-.01-2.71-1.04-2.74-4.12zM14.6 5.3c.72-.87 1.2-2.08 1.07-3.3-1.03.04-2.29.69-3.03 1.56-.66.77-1.24 2-1.08 3.18 1.15.09 2.33-.58 3.04-1.44z" />
        </svg>
      );
    case "Google Pay":
      return (
        <svg width={S} height={S} viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M21.6 12.2c0-.6-.05-1.2-.16-1.8H12v3.4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.1z" />
          <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
          <path fill="#FBBC04" d="M6.4 14a6 6 0 0 1 0-4V7.4H3.1a10 10 0 0 0 0 9.2z" />
          <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1z" />
        </svg>
      );
    case "Bitcoin":
      return (
        <svg width={S} height={S} viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="12" fill="#F7931A" />
          <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff">₿</text>
        </svg>
      );
    case "USDT":
      return (
        <svg width={S} height={S} viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="12" fill="#26A17B" />
          <text x="12" y="17" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">₮</text>
        </svg>
      );
    case "Ethereum":
      return (
        <svg width={S} height={S} viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="12" fill="#627EEA" />
          <g fill="#fff">
            <path d="M12 4v5.9l5 2.2z" fillOpacity="0.6" />
            <path d="M12 4 7 12.1l5-2.2z" />
            <path d="M12 16.9V21l5-7z" fillOpacity="0.6" />
            <path d="M12 21v-4.1L7 14z" />
            <path d="M12 15.9l5-2.9-5-2.2z" fillOpacity="0.2" />
            <path d="M7 13l5 2.9v-5.1z" fillOpacity="0.6" />
          </g>
        </svg>
      );
    case "USDC":
      return (
        <svg width={S} height={S} viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="12" fill="#2775CA" />
          <text x="12" y="17" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">$</text>
        </svg>
      );
    case "Litecoin":
      return (
        <svg width={S} height={S} viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="12" fill="#345D9D" />
          <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff">Ł</text>
        </svg>
      );
    case "Monero":
      return (
        <svg width={S} height={S} viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="12" fill="#FF6600" />
          <text x="12" y="17" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">ɱ</text>
        </svg>
      );
    case "Binance Pay":
      return (
        <svg width={S} height={S} viewBox="0 0 126 126" fill="#F0B90B" aria-hidden>
          <path d="M38.7 53.2 63 28.9l24.3 24.3 14.1-14.1L63 .7 24.6 39.1zM.7 63l14.1-14.1L28.9 63 14.8 77.1zM38.7 72.8 63 97.1l24.3-24.3 14.1 14L63 125.3 24.6 86.9zM97.1 63l14.1-14.1L125.3 63l-14.1 14.1zM77.3 63 63 48.6 52.4 59.2l-1.2 1.2-2.5 2.5L63 77.4z" />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * CSS-only illustration for the «Your money. Your wallet» section.
 * PPV Sale + Tip Received cards on the left feed into the central
 * Available Balance card, which feeds a USDT Withdrawal Complete card on
 * the right. No PNG — scales crisply, theme-aware.
 */
function PayoutFlowIllustration() {
  return (
    <div style={{ background: "#0a0d14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "20px", padding: "32px 24px", minHeight: 360 }}>
      <div className="grid grid-cols-[1fr_1.2fr_1fr] items-center gap-3 w-full">
        {/* Left — two incoming cards */}
        <div className="flex flex-col gap-3">
          {[
            { label: "PPV Sale", amount: "+$24.99" },
            { label: "Tip Received", amount: "+$75.00" },
          ].map((c, i) => (
            <div key={i} style={{ background: "#11151c", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "14px 14px" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <div style={{ width: 22, height: 22, borderRadius: "6px", background: OF_BLUE, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4Z" stroke="white" strokeWidth="2" fill="none" strokeLinejoin="round"/></svg>
                </div>
                <span style={{ fontSize: "12px", color: "#9aa6b8" }}>{c.label}</span>
              </div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#fff" }}>{c.amount}</div>
            </div>
          ))}
        </div>

        {/* Centre — Available Balance card with glow */}
        <div className="relative" style={{ background: "#0d1117", border: `1.5px solid ${OF_BLUE}`, borderRadius: "16px", padding: "22px 18px", boxShadow: `0 0 38px rgba(0,175,240,0.18)` }}>
          <div style={{ width: 34, height: 34, borderRadius: "8px", background: OF_BLUE, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <span style={{ color: "white", fontWeight: 800, fontSize: 18 }}>$</span>
          </div>
          <div style={{ fontSize: "12px", color: "#9aa6b8", marginBottom: 4 }}>Available Balance</div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "white", letterSpacing: "-0.02em", marginBottom: 12 }}>$12,842.51</div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 12 }} />
          <div style={{ background: OF_BLUE, color: "white", textAlign: "center", padding: "10px", borderRadius: "10px", fontWeight: 700, fontSize: "13px" }}>
            ⛁ Withdraw Funds
          </div>
        </div>

        {/* Right — withdrawal complete */}
        <div style={{ background: "#11151c", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "14px 14px" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#26A17B", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
            <span style={{ color: "white", fontWeight: 800, fontSize: 14 }}>₮</span>
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <span style={{ fontSize: "11px", color: "#9aa6b8" }}>Withdrawal Complete</span>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: "50%", background: "#22c55e", color: "white", fontSize: 10, fontWeight: 800 }}>✓</span>
          </div>
          <div className="flex items-center gap-1.5 mb-2">
            <span style={{ fontSize: "16px", fontWeight: 800, color: "white" }}>USDT</span>
            <span style={{ fontSize: "10px", fontWeight: 700, color: "#9aa6b8", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: "999px" }}>TRC-20</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1.5 rounded-md" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: "11px", color: "#cbd5e1", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }}>0xA7b3…9F2d</span>
          </div>
        </div>
      </div>
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

  // The landing must ALWAYS look logged-out. /login + /signup already
  // forward to /dashboard when a session exists, so a logged-in visitor
  // who clicks "Get Started" still lands in the right place.
  void authed; // keep the hook for future use without flipping labels
  const loginHref = "/login";
  const loginLabel = "Login";
  const startHref = "/signup";
  const startNavLabel = "Get Started";
  const startHeroLabel = "Start Selling PPVs 💸";
  const startPricingLabel = "Start Selling PPVs 💸";
  const startCtaLabel = "Start Selling PPVs 💸";

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

      {/* ── HERO — text+CTA+feature chips left, phone right (pic 3) ── */}
      <section className="px-8" style={{ background: "#080b12", paddingTop: "120px", paddingBottom: "60px" }}>
        <div className="max-w-[1200px] mx-auto w-full grid items-center gap-12" style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)" }}>
          {/* Left */}
          <div>
            <h1 className="text-white mb-6" style={{ fontSize: "56px", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em" }}>
              Turn Telegram<br />
              chats into<br />
              <span style={{ color: OF_BLUE }}>revenue</span>.
            </h1>
            <p className="mb-8" style={{ fontSize: "16px", color: "#8b95a8", maxWidth: "520px", lineHeight: 1.7 }}>
              Sell PPVs, manage chatters, and get paid instantly.<br />
              No monthly fees — just a 12% platform fee.
            </p>
            <div className="flex flex-col items-start gap-3">
              <Link href={startHref} className="px-8 py-3.5 rounded-xl text-white transition-all hover:opacity-90 active:scale-95" style={{ background: OF_BLUE, fontSize: "15px", fontWeight: 700, display: "inline-block" }}>
                {startHeroLabel}
              </Link>
              <p style={{ fontSize: "13px", color: "#4b5563" }}>No subscriptions · No contracts · No KYC</p>
            </div>
          </div>

          {/* Right — phone preview */}
          <div className="flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/hero.png"
              alt="ppvs.io product preview"
              style={{ width: "100%", maxWidth: "420px", height: "auto", objectFit: "contain" }}
            />
          </div>
        </div>
      </section>

      {/* ── 4 feature chips under the hero (pic 2 reference) ── */}
      <section className="px-8" style={{ background: "#080b12", paddingBottom: "80px" }}>
        <div className="max-w-[720px] mx-auto grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Send PPVs\n& Tips", Icon: Lock },
            { label: "Manage\nChatters", Icon: Users },
            { label: "Track\nRevenue", Icon: TrendingUp },
            { label: "Withdraw\nin Crypto", Icon: WalletIcon },
          ].map(({ label, Icon }, i) => (
            <div key={i} className="rounded-2xl flex flex-col items-center justify-center text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "18px 14px" }}>
              <Icon className="w-7 h-7 mb-2.5" style={{ color: OF_BLUE }} />
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#e2e8f0", lineHeight: 1.35, whiteSpace: "pre-line" }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HIGHLIGHTS MARQUEE — selling points strip under the hero ── */}
      <div style={{ background: "#0d1117", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", overflow: "hidden", padding: "14px 0" }}>
        <style>{`
          @keyframes ppv-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
          .ppv-marquee { display: flex; width: max-content; animation: ppv-marquee 40s linear infinite; }
          .ppv-marquee:hover { animation-play-state: paused; }
        `}</style>
        <div className="ppv-marquee">
          {Array.from({ length: 3 }).flatMap((_, dup) =>
            [
              "NO MONTHLY FEES",
              "NO KYC REQUIRED",
              "OPEN IN 5 MINUTES",
              "INSTANT CRYPTO WITHDRAWALS",
              "12% PLATFORM FEE",
              "WITHOUT LEAVING TELEGRAM",
            ].map((label, i) => (
              <div key={`${dup}-${i}`} className="flex items-center gap-3 mx-6" style={{ whiteSpace: "nowrap" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.18em" }}>{label}</span>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#374151" }} />
              </div>
            )),
          )}
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section id="features" className="py-16 px-8" style={{ background: "#0f1420" }}>
        <div className="max-w-[1200px] mx-auto">
          <div className="mb-8">
            <h2 className="text-white mb-3" style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.02em" }}>
              Everything you need to run a Telegram OFM agency. 📈
            </h2>
            <p style={{ fontSize: "16px", color: "#6b7280" }}>Manage creators, chatters, content, sales, and payouts from one dashboard.</p>
          </div>

          {/* Interactive feature selector */}
          <div className="flex gap-8" style={{ minHeight: "300px" }}>
            {/* Left: feature list */}
            <div className="flex flex-col gap-8 shrink-0" style={{ width: "260px" }}>
              <div>
                <div className="mb-3" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", color: "#4b5563", textTransform: "uppercase" }}>For Agency Owners</div>
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
                        <span className="flex items-center gap-2">
                          <span style={{ fontSize: "15px" }}>{f.emoji}</span>
                          {f.label}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="mb-3" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", color: "#4b5563", textTransform: "uppercase" }}>For Chatters</div>
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
                        <span className="flex items-center gap-2">
                          <span style={{ fontSize: "15px" }}>{f.emoji}</span>
                          {f.label}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right: image + feature info */}
            <div className="flex-1 rounded-2xl flex flex-col overflow-hidden" style={{ background: "#141924", border: `1px solid rgba(0,175,240,0.2)` }}>
              <div className="flex-1 flex items-center justify-center px-8 py-8 text-center" style={{ background: "#181d28" }}>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(0,175,240,0.12)", border: "1px solid rgba(0,175,240,0.25)", fontSize: "26px" }}>
                    {currentFeature.emoji}
                  </div>
                  <div className="text-white" style={{ fontSize: "22px", fontWeight: 700 }}>{currentFeature.label}</div>
                  <div className="text-white" style={{ fontSize: "15px", fontWeight: 600 }}>{currentFeature.tagline}</div>
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
              <div className="flex flex-col gap-3">
                {[
                  "Your chatter sends a PPV offer.",
                  "The fan pays by card or crypto.",
                  "Content unlocks automatically.",
                  "Your chatter gets notified instantly.",
                  "No manual follow-up required.",
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
            {/* CSS illustration — PPV/Tip incomings → balance → withdrawal complete */}
            <div className="flex-1">
              <PayoutFlowIllustration />
            </div>
            {/* Text */}
            <div className="flex-1">
              <div className="mb-4 inline-block px-3 py-1 rounded-full" style={{ background: "rgba(0,175,240,0.1)", border: "1px solid rgba(0,175,240,0.2)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", color: OF_BLUE, textTransform: "uppercase" }}>
                How payouts work
              </div>
              <h2 className="text-white mb-5" style={{ fontSize: "38px", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
                Your money. Your wallet.<br />No middlemen.
              </h2>
              <div className="flex flex-col gap-3">
                {[
                  "Get paid instantly.",
                  "Withdraw straight to your crypto wallet.",
                  "No payout schedules.",
                  "No waiting periods.",
                  "No middlemen.",
                ].map((line, i) => (
                  <div key={i} className="flex items-center gap-3" style={{ fontSize: "14px", color: "#d1d5db" }}>
                    <span style={{ color: OF_BLUE, fontWeight: 700 }}>✓</span>
                    {line}
                  </div>
                ))}
              </div>

              {/* Withdrawal currencies — only USDT + USDC, inline after the text. */}
              <div className="mt-7 flex items-center flex-wrap gap-2">
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#9ca3af" }}>Withdraw in:</span>
                {[
                  { name: "USDT", label: "USDT" },
                  { name: "USDC", label: "USDC" },
                ].map((c) => (
                  <div key={c.label} className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <span className="flex items-center justify-center shrink-0"><PayIcon name={c.name} /></span>
                    <span style={{ fontSize: "12px", fontWeight: 500, color: "#9ca3af" }}>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="py-20 px-8" style={{ background: "#0f1420" }}>
        <div className="max-w-[880px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-white mb-4" style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.02em" }}>
              Keep more. Pay less. 💎
            </h2>
            <p style={{ fontSize: "16px", color: "#6b7280", maxWidth: "520px", margin: "0 auto", lineHeight: 1.7 }}>
              Our platform fee is just 12% — about half the industry standard. No subscriptions, no setup fees, and no contracts.
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
                <div style={{ fontSize: "14px", color: "#6b7280", lineHeight: 1.6 }}>We only make money when you make money.</div>
              </div>
              <div className="mb-8 flex items-baseline gap-2">
                <span className="text-white" style={{ fontSize: "44px", fontWeight: 800, letterSpacing: "-0.03em" }}>12%</span>
                <span style={{ fontSize: "14px", color: "#6b7280" }}>of sales</span>
              </div>
              <div className="flex flex-col gap-3 mb-8 flex-1">
                {[
                  "Unlimited creators & chatters",
                  "Full agency dashboard with per-model stats",
                  "Content vault with tagging",
                  "Real-time revenue tracking",
                  "Telegram native integration",
                  "Crypto & card payments",
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

            {/* Plan 2 — AI Autopilot (mirrors Free forever's positioning:
                floating ribbon, header, big stat, list, button at bottom). */}
            <div className="flex flex-col p-8 rounded-2xl" style={{ background: "#0d1018", border: "2px solid rgba(255,255,255,0.08)", position: "relative" }}>
              <div style={{ position: "absolute", top: "-14px", left: "32px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", color: "#9ca3af", fontSize: "11px", fontWeight: 700, padding: "4px 14px", borderRadius: "999px", letterSpacing: "0.04em", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <Bot className="w-3 h-3" /> COMING SOON
              </div>
              <div className="mb-5">
                <div className="text-white mb-2" style={{ fontSize: "22px", fontWeight: 700 }}>AI Autopilot 🤖</div>
                <div style={{ fontSize: "14px", color: "#6b7280", lineHeight: 1.6 }}>Your agency runs 24/7 — even when your chatters are offline.</div>
              </div>
              <div className="mb-8 flex items-baseline gap-2">
                <span className="text-white" style={{ fontSize: "44px", fontWeight: 800, letterSpacing: "-0.03em" }}>TBD</span>
                <span style={{ fontSize: "14px", color: "#6b7280" }}>pricing</span>
              </div>
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
              <button disabled className="w-full py-4 rounded-xl text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#6b7280", fontSize: "15px", fontWeight: 700, cursor: "not-allowed", display: "block" }}>
                Join waitlist →
              </button>
              <p className="text-center mt-3" style={{ fontSize: "12px", color: "#4b5563" }}>Coming soon · We&apos;ll let you know.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-16 px-8" style={{ background: "#0f1420" }}>
        <div className="max-w-[760px] mx-auto">
          <div className="text-center mb-10">
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
            Ready to start selling inside Telegram?
          </h2>
          <p className="mb-10" style={{ fontSize: "17px", color: "#6b7280", lineHeight: 1.75, maxWidth: "520px", margin: "0 auto 40px" }}>
            Join the agencies using ppvs.io to handle PPV sales, manage chatters, and grow revenue.
          </p>
          <Link href={startHref} className="inline-flex items-center gap-2 px-9 py-4 rounded-xl text-white transition-all hover:opacity-90" style={{ background: OF_BLUE, fontSize: "16px", fontWeight: 700 }}>
            {startCtaLabel}
          </Link>
          <p className="mt-4" style={{ fontSize: "13px", color: "#374151" }}>No credit card · No KYC · No monthly fees</p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-14 px-8" style={{ background: "#080b12", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-[1200px] mx-auto">
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: "48px", marginBottom: "40px" }}>
            <div>
              <div className="mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={LOGO_SRC} alt="ppvs.io" style={{ height: "26px", width: "auto", objectFit: "contain" }} />
              </div>
              <p style={{ fontSize: "13px", color: "#4b5563", lineHeight: 1.7, maxWidth: "300px" }}>
                A software that lets OFM agencies<br />
                sell PPVs inside Telegram.
              </p>
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
            <div>
              <div className="text-white mb-5" style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.06em" }}>Legal</div>
              <div className="flex flex-col gap-3">
                <Link href="/terms" className="transition-colors hover:text-white" style={{ fontSize: "14px", color: "#4b5563" }}>Terms of Service</Link>
                <Link href="/privacy" className="transition-colors hover:text-white" style={{ fontSize: "14px", color: "#4b5563" }}>Privacy Policy</Link>
                <Link href="/acceptable-use" className="transition-colors hover:text-white" style={{ fontSize: "14px", color: "#4b5563" }}>Acceptable Use Policy</Link>
                <Link href="/content-policy" className="transition-colors hover:text-white" style={{ fontSize: "14px", color: "#4b5563" }}>Content Policy</Link>
                <Link href="/dmca" className="transition-colors hover:text-white" style={{ fontSize: "14px", color: "#4b5563" }}>Copyright & Takedowns</Link>
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
