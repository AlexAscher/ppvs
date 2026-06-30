"use client";

// Landing page — rebuilt to the v2 brief: hero/sections renamed for
// "FOR AGENCY OWNERS / FOR CHATTERS / FOR PAYOUTS", categorised FAQ, single
// pricing card, new copy throughout. Keep the design contract: no clever
// refactors, just structure + copy + the three new images served from
// /public (logo, hero, built_for). Brand colour stays OF_BLUE so the rest of
// the app palette doesn't fragment.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  ChevronDown,
  Lock,
  Users,
  TrendingUp,
  Wallet as WalletIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase";

const OF_BLUE = "#00AFF0";
const LOGO_SRC = "/landing/logo.png";
const HERO_IMG = "/hero_ppvs.png";
const BUILT_IMG = "/built_for.png";
const BOOK_DEMO_HREF = "https://t.me/manimayn";

// ── Hero feature chips (4 corner-pill boxes under the headline) ──────────────
const HERO_CHIPS: { l1: string; l2: string; Icon: typeof Lock }[] = [
  { l1: "Send", l2: "PPVs", Icon: Lock },
  { l1: "Manage", l2: "Chatters", Icon: Users },
  { l1: "Agency", l2: "Dashboard", Icon: TrendingUp },
  { l1: "Crypto", l2: "Payouts", Icon: WalletIcon },
];

// ── Marquee divider items ────────────────────────────────────────────────────
const MARQUEE = [
  "PAY WITH TELEGRAM STARS",
  "CRYPTO PAYOUTS",
  "15% PLATFORM FEE",
  "WITHOUT LEAVING TELEGRAM",
  "NO MONTHLY FEES",
  "NO KYC",
  "SETUP IN MINUTES",
];

// ── "Built for agencies. Loved by chatters." — 3 feature cards ───────────────
const BUILT_CARDS = [
  {
    emoji: "🎯",
    title: "Flexible PPV Selling",
    desc: "Custom pricing per fan. Content unlocks instantly with no delays.",
  },
  {
    emoji: "📊",
    title: "Agency Dashboard",
    desc: "Creators, chatters, payouts, and analytics — all in one place.",
  },
  {
    emoji: "⭐",
    title: "Native Telegram Payments",
    desc: "Fans unlock PPVs with Telegram Stars, payments with Apple Pay, Google Pay, or card.",
  },
];

// ── Categorised FAQ ──────────────────────────────────────────────────────────
type Faq = { q: string; a: string };
const FAQ_GROUPS: { title: string; emoji: string; items: Faq[] }[] = [
  {
    title: "Payments & Payouts",
    emoji: "💸",
    items: [
      {
        q: "If a fan pays 1,000 Stars, how much do I receive?",
        a:
          "Telegram sets a fixed withdrawal rate of $0.013 USD per Star. Here's how 1,000 Stars breaks down:\n\n1,000 Stars × $0.013 = $13.00 gross value.\nStars convert to GRAM — we cover the conversion fee from our cut.\n15% platform fee = $1.95.\nYou receive ≈ $11.05 in GRAM. In full, no further deductions.\n\nThe final dollar value depends on the GRAM market price at the time of withdrawal.",
      },
      {
        q: "Why do I receive less than what fans pay for Stars?",
        a:
          "Telegram sets a fixed creator withdrawal rate of $0.013 per Star, regardless of what fans paid to purchase them. Fans buying Stars through Apple or Google Pay often pay more due to their 30% in-app purchase fee — that gap belongs to Telegram and the app stores, not to PPVS. This applies to every Telegram Stars transaction, not just on our platform.",
      },
      {
        q: "How do payouts work?",
        a:
          "As fans purchase PPVs, your Stars rewards accumulate and convert to GRAM. After a 25-day holding period, your balance becomes available to withdraw to your crypto wallet. The holding period covers Telegram's 21-day window plus a short additional buffer we keep for fraud review. Minimum withdrawal is $30.",
      },
      {
        q: "What currency are payouts in?",
        a:
          "Payouts are made in GRAM on the TON network. We handle the Stars-to-GRAM conversion on our end and cover the network fee from our 15% cut — you receive your full 85% with no additional deductions.",
      },
      {
        q: "How do fans pay?",
        a:
          "Fans pay with Telegram Stars — Telegram's native currency. Stars can be purchased directly inside Telegram using Apple Pay, Google Pay, or a card. Fans can also buy Stars in advance and use their existing balance. No separate account, no external checkout, no friction.",
      },
    ],
  },
  {
    title: "Security & Telegram",
    emoji: "🔒",
    items: [
      {
        q: "Will Telegram ban my account for using PPVS?",
        a:
          "PPVS uses MTProto — the same API Telegram itself is built on. We implement careful session management to mimic normal human behavior, and thousands of OFM agencies use MTProto-based tools daily. As with any third-party API, a small risk always exists, but we take every precaution to minimize it. To date, none of our users have had an account banned through normal use of the platform.",
      },
      {
        q: "What happens to my earnings if my Telegram account is banned?",
        a:
          "Your earnings are attributed to the PPVS bot account, not your personal Telegram account. If your creator account is ever banned or suspended, your accumulated balance is not lost — contact support with proof of account ownership and we'll process your withdrawal as normal.",
      },
      {
        q: "Is my content secure inside the vault?",
        a:
          "Content in your vault is protected with military-grade encryption. Once a fan unlocks a PPV, screenshot protection is active — they cannot capture or save the content. Unlocked content is only accessible inside that fan's chat session.",
      },
      {
        q: "Do fans need another app or an account?",
        a:
          "No. Everything happens natively inside Telegram. Fans pay with Telegram Stars and content unlocks instantly — no downloads, no accounts, no redirects.",
      },
    ],
  },
  {
    title: "Agencies & Teams",
    emoji: "🏢",
    items: [
      {
        q: "Can I manage multiple creators and chatters?",
        a:
          "Yes. PPVS is built for OFM agencies and supports multiple creators, multiple chatters, role-based permissions, and centralized management from a single dashboard.",
      },
      {
        q: "Can one chatter manage multiple models?",
        a:
          "Yes. Chatters switch between model accounts with one click from the model selector bar. Unread message counts appear per model so nothing gets missed.",
      },
      {
        q: "Can chatters set custom prices per fan?",
        a:
          "Yes. Chatters set individual prices for every fan and send content directly from the vault without leaving the conversation. Price is shown as both a Star amount and the equivalent USD value after the platform fee, so chatters always know exactly what they'll receive.",
      },
      {
        q: "Can I see what each chatter is doing?",
        a:
          "Yes. Every conversation and sale is logged and accessible to agency admins. You can view conversations, see which chatter sent each message, and access any chatter's workspace directly from your dashboard.",
      },
      {
        q: "Can I run PPVS alongside my existing OnlyFans?",
        a:
          "Yes — and most agencies do. PPVS is used as a higher-converting revenue layer inside Telegram for fans who won't subscribe on OnlyFans. Your existing funnel keeps running, and Telegram becomes an additional monetization channel, not a replacement.",
      },
    ],
  },
  {
    title: "Getting Started",
    emoji: "🚀",
    items: [
      {
        q: "How does PPVS work?",
        a:
          "PPVS lets agencies and creators sell pay-per-view content directly inside Telegram. Fans unlock content using Telegram Stars without ever leaving the chat. You manage everything — content, chatters, payouts — from your agency dashboard.",
      },
      {
        q: "How long does setup take?",
        a:
          "Connect your Telegram account, upload your first content, add your chatters, and you're ready to sell. No calls, no contracts, no approval process.",
      },
    ],
  },
];

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="inline-block px-3 py-1 rounded-full"
      style={{
        background: "rgba(0,175,240,0.1)",
        border: "1px solid rgba(0,175,240,0.3)",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.14em",
        color: OF_BLUE,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function FaqItem({ q, a }: Faq) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "#141924", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left px-5 py-4"
      >
        <span className="text-white text-[14px] font-medium">{q}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-[#9ca3af] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-5 pb-4 text-[13px] text-[#9ca3af] whitespace-pre-line leading-relaxed">
          {a}
        </div>
      )}
    </div>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((line, i) => (
        <li key={i} className="flex items-start gap-3 text-[14px] text-[#d1d5db]">
          <span style={{ color: OF_BLUE, fontWeight: 700 }}>✓</span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

export default function LandingPage() {
  // Session-aware nav: signed-in visitors see "Dashboard" instead of "Open app".
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);
  const ctaHref = authed ? "/dashboard" : "/signup";
  const navCtaLabel = authed ? "Dashboard" : "Get started";

  return (
    <div className="min-h-screen text-white" style={{ background: "#080b12", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}>
      {/* ── NAV ── */}
      <nav
        className="fixed top-0 w-full z-50"
        style={{
          background: "rgba(8,11,18,0.9)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="max-w-[1200px] mx-auto flex items-center justify-between px-6 h-[60px]">
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_SRC}
              alt="ppvs.io"
              style={{ height: "30px", width: "auto", objectFit: "contain", borderRadius: "6px" }}
            />
          </Link>
          <div className="hidden md:flex items-center gap-8 text-[13px] text-[#9ca3af]">
            <a href="#how" className="hover:text-white transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            {!authed && (
              <Link href="/login" className="text-[13px] text-[#9ca3af] hover:text-white transition-colors hidden sm:inline">
                Log in
              </Link>
            )}
            <Link
              href={ctaHref}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white"
              style={{ background: OF_BLUE }}
            >
              {navCtaLabel}
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section
        style={{
          paddingTop: "120px",
          paddingBottom: "60px",
          background:
            "radial-gradient(1100px 600px at 20% 0%, rgba(0,175,240,0.16) 0%, rgba(0,175,240,0) 60%), radial-gradient(900px 500px at 90% 30%, rgba(0,175,240,0.10) 0%, rgba(0,175,240,0) 55%), #080b12",
        }}
      >
        <div className="max-w-[1200px] mx-auto px-8 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Pill>TELEGRAM MONETIZATION PLATFORM</Pill>
            <h1
              className="mt-5 text-white"
              style={{ fontSize: "52px", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.03em" }}
            >
              Turn Telegram conversations into <span style={{ color: OF_BLUE }}>revenue</span>.
            </h1>
            <p className="mt-5 text-[16px] text-[#9ca3af]" style={{ maxWidth: 560, lineHeight: 1.6 }}>
              Sell content, manage chatters, and get paid in crypto. Fans pay with Telegram Stars
              while you keep 85% of every sale.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={ctaHref}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-semibold text-white"
                style={{ background: OF_BLUE, boxShadow: "0 10px 30px rgba(0,175,240,0.35)" }}
              >
                {authed ? "Open dashboard" : "Get started"} <ChevronRight className="w-4 h-4" />
              </Link>
              <a
                href={BOOK_DEMO_HREF}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center px-5 py-3 rounded-xl text-[14px] font-semibold text-white"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Book a demo
              </a>
            </div>
            <p className="mt-4 text-[12px] text-[#6b7280]">No monthly fees • No setup costs</p>

            <div className="grid grid-cols-4 gap-2 mt-8" style={{ maxWidth: "440px" }}>
              {HERO_CHIPS.map(({ l1, l2, Icon }, i) => (
                <div
                  key={i}
                  className="rounded-lg flex flex-col items-center justify-center text-center"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    padding: "12px 6px",
                  }}
                >
                  <Icon className="w-5 h-5 mb-1.5" style={{ color: OF_BLUE }} />
                  <div className="text-[11px] font-semibold text-white leading-tight">
                    {l1}
                    <br />
                    {l2}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={HERO_IMG}
              alt="ppvs.io hero"
              style={{ maxWidth: "100%", width: "560px", borderRadius: "18px", display: "block" }}
            />
          </div>
        </div>
      </section>

      {/* ── MARQUEE ── */}
      <section
        className="overflow-hidden"
        style={{ background: "#0b0e16", borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div className="flex gap-12 py-4 whitespace-nowrap animate-[marquee_38s_linear_infinite]">
          {[...MARQUEE, ...MARQUEE].map((item, i) => (
            <span
              key={i}
              className="text-[12px] font-bold uppercase tracking-[0.18em]"
              style={{ color: i % 2 === 0 ? "#ffffff" : OF_BLUE }}
            >
              {item} •
            </span>
          ))}
        </div>
        <style>{`@keyframes marquee {0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
      </section>

      {/* ── BUILT FOR AGENCIES. LOVED BY CHATTERS. ── */}
      <section className="py-20 px-8" style={{ background: "#0d1117" }}>
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-white mb-3" style={{ fontSize: "38px", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
              Built for agencies. Loved by chatters.
            </h2>
            <p className="text-[14px] text-[#9ca3af]" style={{ maxWidth: 600, margin: "0 auto" }}>
              Everything runs natively inside Telegram — no separate app, no extra login.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {BUILT_CARDS.map((c, i) => (
              <div
                key={i}
                className="rounded-2xl p-6"
                style={{ background: "#141924", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="text-[28px] mb-3">{c.emoji}</div>
                <div className="text-white text-[18px] font-bold mb-2">{c.title}</div>
                <div className="text-[13px] text-[#9ca3af] leading-relaxed">{c.desc}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={BUILT_IMG}
              alt="Two Telegram chats — one with a locked PPV, one unlocked after payment"
              style={{
                maxWidth: "100%",
                width: "900px",
                borderRadius: "18px",
                display: "block",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            />
            <p className="mt-4 text-[13px] text-[#6b7280]">
              Fans unlock content in one tap — all inside Telegram.
            </p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS — three alternating sections ── */}
      <section id="how" style={{ background: "#0b0e16" }}>
        {/* FOR AGENCY OWNERS */}
        <div className="max-w-[1200px] mx-auto px-8 py-20 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Pill>FOR AGENCY OWNERS</Pill>
            <h2 className="text-white mt-4" style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
              Run your agency from one dashboard.
            </h2>
            <div className="mt-6">
              <Checklist
                items={[
                  "See every chatter's conversations and sales",
                  "Track revenue per creator, per chatter, per day",
                  "Set role-based permissions for your team",
                  "Get notified the moment a PPV sells",
                ]}
              />
            </div>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ background: "#141924", border: "1px solid rgba(255,255,255,0.06)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/hero.png"
              alt="Agency dashboard"
              style={{ width: "100%", display: "block" }}
            />
          </div>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }} />

        {/* FOR CHATTERS */}
        <div className="max-w-[1200px] mx-auto px-8 py-20 grid lg:grid-cols-2 gap-12 items-center">
          <div className="rounded-2xl overflow-hidden order-2 lg:order-1" style={{ background: "#141924", border: "1px solid rgba(255,255,255,0.06)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={BUILT_IMG}
              alt="Chatter workspace"
              style={{ width: "100%", display: "block" }}
            />
          </div>
          <div className="order-1 lg:order-2">
            <Pill>FOR CHATTERS</Pill>
            <h2 className="text-white mt-4" style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
              One workspace.
              <br />
              Every model. Every fan.
            </h2>
            <div className="mt-6">
              <Checklist
                items={[
                  "Chat on multiple accounts from a single screen",
                  "Custom pricing per fan, set on the fly",
                  "Send PPVs straight from the vault",
                  "Shared content library across the team",
                ]}
              />
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }} />

        {/* FOR PAYOUTS */}
        <div className="max-w-[1200px] mx-auto px-8 py-20 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Pill>FOR PAYOUTS</Pill>
            <h2 className="text-white mt-4" style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
              Get paid directly to your wallet.
            </h2>
            <div className="mt-6">
              <Checklist
                items={[
                  "Fans pay using Telegram Stars",
                  "Rewards unlock after the holding period",
                  "Withdraw directly to your wallet",
                  "No KYC. No payment processors",
                ]}
              />
            </div>
          </div>
          <div className="rounded-2xl p-10 flex items-center justify-center" style={{ background: "#141924", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="text-center">
              <div className="text-[64px] mb-2">💎</div>
              <div className="text-white text-[18px] font-bold">85% to you</div>
              <div className="text-[13px] text-[#9ca3af] mt-1">Paid in GRAM on TON</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="py-20 px-8" style={{ background: "#0d1117" }}>
        <div className="max-w-[720px] mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-white mb-3" style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.02em" }}>
              Simple, performance-based pricing
            </h2>
            <p className="text-[14px] text-[#9ca3af]">
              Pay only when you earn. No subscriptions, no setup costs.
            </p>
          </div>

          <div
            className="rounded-2xl p-8 relative"
            style={{ background: "#141924", border: `2px solid ${OF_BLUE}` }}
          >
            <div
              style={{
                position: "absolute",
                top: "-14px",
                left: "32px",
                background: OF_BLUE,
                color: "#fff",
                fontSize: "11px",
                fontWeight: 700,
                padding: "4px 14px",
                borderRadius: "999px",
                letterSpacing: "0.06em",
              }}
            >
              AVAILABLE NOW
            </div>
            <div className="text-[13px] text-[#9ca3af] mb-1">Platform Fee</div>
            <div className="flex items-baseline gap-2">
              <span className="text-white" style={{ fontSize: "60px", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>15%</span>
              <span className="text-[14px] text-[#9ca3af]">of every sale. Nothing else.</span>
            </div>
            <p className="text-[12px] text-[#6b7280] mt-2">No tiers, no usage limits, no surprise invoices.</p>

            <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-4">
              {[
                "Agency dashboard",
                "Chatter workspace",
                "Content vault",
                "Creator management",
                "Analytics",
                "Payout in crypto",
                "Telegram Stars integration",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 text-[13px] text-[#d1d5db]">
                  <Check className="w-4 h-4 shrink-0" style={{ color: OF_BLUE }} />
                  {item}
                </div>
              ))}
            </div>

            <Link
              href={ctaHref}
              className="mt-8 w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl text-[14px] font-semibold text-white"
              style={{ background: OF_BLUE, boxShadow: "0 10px 30px rgba(0,175,240,0.3)" }}
            >
              Start Selling PPVs 💸
            </Link>
            <p className="text-center text-[11px] text-[#6b7280] mt-3">
              No monthly fees. No setup costs. No hidden charges.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ — categorised ── */}
      <section id="faq" className="py-20 px-8" style={{ background: "#0b0e16" }}>
        <div className="max-w-[860px] mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-white mb-3" style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.02em" }}>
              Frequently Asked Questions 🙋
            </h2>
            <p className="text-[13px] text-[#9ca3af]">
              Everything you need to know before you start selling.
            </p>
          </div>

          <div className="space-y-10">
            {FAQ_GROUPS.map((g) => (
              <div key={g.title}>
                <div className="text-[11px] font-bold tracking-[0.18em] text-[#6b7280] uppercase mb-3">
                  {g.emoji} {g.title}
                </div>
                <div className="space-y-2.5">
                  {g.items.map((it, i) => (
                    <FaqItem key={i} {...it} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-28 px-8" style={{ background: "#080b12", borderTop: "1px solid rgba(0,175,240,0.1)" }}>
        <div className="max-w-[760px] mx-auto text-center">
          <h2 className="text-white" style={{ fontSize: "44px", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            Start monetising your Telegram today.
          </h2>
          <p className="text-[14px] text-[#9ca3af] mt-4">
            15% only when you earn. Setup in minutes. No KYC.
          </p>
          <Link
            href={ctaHref}
            className="mt-8 inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-[14px] font-semibold text-white"
            style={{ background: OF_BLUE, boxShadow: "0 10px 30px rgba(0,175,240,0.35)" }}
          >
            {authed ? "Open dashboard" : "Get started"} <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-12 px-8" style={{ background: "#080b12", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center gap-4 justify-between">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_SRC}
              alt="ppvs.io"
              style={{ height: "26px", width: "auto", objectFit: "contain", borderRadius: "6px" }}
            />
          </Link>
          <div className="flex items-center gap-5 text-[12px] text-[#6b7280]">
            <a href={BOOK_DEMO_HREF} target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Contact</a>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/dmca" className="hover:text-white transition-colors">DMCA</Link>
            <Link href="/content-policy" className="hover:text-white transition-colors">Content policy</Link>
          </div>
        </div>
        <div className="max-w-[1200px] mx-auto mt-6 text-[11px] text-[#4b5563] text-center">
          © {new Date().getFullYear()} ppvs.io
        </div>
      </footer>
    </div>
  );
}
