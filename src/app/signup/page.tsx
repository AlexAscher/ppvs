"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogoWord } from "../logo";
import { homeUrl } from "@/lib/host-routes";

type Role = "chatter" | "agency";

function RoleCard({ selected, onClick, icon, title, desc }: {
  selected: boolean; onClick: () => void; icon: string; title: string; desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 flex flex-col min-h-[132px] text-left p-[15px_14px] rounded-[10px] transition-all cursor-pointer border-none outline-none"
      style={{
        border: selected ? "1px solid var(--blue)" : "1px solid var(--border)",
        background: selected ? "rgba(0,175,240,0.06)" : "var(--bg)",
      }}
    >
      <div className="text-[22px] mb-2">{icon}</div>
      <div className="text-[13px] font-semibold mb-0.5" style={{ color: selected ? "var(--text)" : "var(--text-2)" }}>
        {title}
      </div>
      <div className="text-[11px] text-[var(--text-3)]" style={{ lineHeight: 1.5 }}>{desc}</div>
      <div
        className="mt-auto w-[16px] h-[16px] rounded-full flex items-center justify-center transition-all"
        style={{ background: selected ? "var(--blue)" : "transparent", border: selected ? "none" : "1px solid var(--border)" }}
      >
        {selected && (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M2 5l2 2L8 3" />
          </svg>
        )}
      </div>
    </button>
  );
}

export default function SignupPage() {
  const [role, setRole] = useState<Role>("agency");
  const [agencyName, setAgencyName] = useState("");
  const [agencyTelegram, setAgencyTelegram] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // v3 (temporary): signups no longer go straight into Supabase Auth. The
  // form POSTs to /api/signup-request which stores the row for a human to
  // review; the page then swaps to a confirmation screen. Once we
  // reintroduce the OTP flow the "otp" state below returns.
  const [step, setStep] = useState<"form" | "submitted">("form");
  // Same chatter-subdomain loop fix as /login — set href after hydration so
  // the link points back to the apex landing instead of looping the chatter
  // workspace's auth bounce.
  const [backHref, setBackHref] = useState("/");
  useEffect(() => { setBackHref(homeUrl()); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // v3: POST to /api/signup-request instead of creating an auth user
    // directly. Password is intentionally NOT collected during manual
    // approval — once the admin approves, we (or the user) can set it later.
    const res = await fetch("/api/signup-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        displayName,
        role,
        agencyName: role === "agency" ? agencyName : null,
        agencyTelegram: role === "agency" ? agencyTelegram : null,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(body.error || "Something went wrong. Please try again.");
      setLoading(false);
      return;
    }
    setStep("submitted");
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-[var(--bg)] py-12">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(0,175,240,0.06) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 w-full max-w-[420px]">
        <Link
          href={backHref}
          className="flex items-center gap-1.5 text-[12px] text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors mb-8"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to home
        </Link>

        <div className="flex justify-center mb-8">
          <LogoWord size={38} />
        </div>

        <div className="text-center mb-7">
          <h1 className="text-[22px] font-semibold mb-1.5" style={{ letterSpacing: "-0.02em" }}>
            Create your account
          </h1>
          <p className="text-[13px] text-[var(--text-2)]" style={{ lineHeight: 1.6 }}>
            Start selling PPV content on Telegram for free
          </p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[16px] p-7">
          {step === "submitted" ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-[rgba(0,175,240,0.12)] flex items-center justify-center text-[24px]">📨</div>
              <div className="text-[16px] font-semibold text-[var(--text)]">Your application will be processed shortly.</div>
              <div className="text-[13px] text-[var(--text-2)]" style={{ lineHeight: 1.65 }}>
                We&apos;ve received your request for <span className="text-[var(--text)] font-medium">{email}</span> and will get back to you as soon as it&apos;s reviewed. For any questions, please contact{" "}
                <a href="https://t.me/manimayn" target="_blank" rel="noreferrer" className="text-[var(--blue)] hover:underline font-medium">@manimayn</a>{" "}
                on Telegram.
              </div>
              <Link
                href="/"
                className="inline-block mt-2 text-[13px] text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
              >
                ← Back to home
              </Link>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-[8px] px-3.5 py-3 text-[13px] text-red-400">
                {error}
              </div>
            )}

            <div>
              <div className="text-[12px] text-[var(--text-2)] font-medium mb-2.5">I am a...</div>
              <div className="flex gap-2.5 items-stretch">
                <RoleCard
                  selected={role === "agency"}
                  onClick={() => setRole("agency")}
                  icon="🏢"
                  title="Agency"
                  desc="Manage chatters and creators, track all PPV performance"
                />
                <RoleCard
                  selected={role === "chatter"}
                  onClick={() => setRole("chatter")}
                  icon="💬"
                  title="Chatter"
                  desc="Work for an agency, sell PPV content to fans on Telegram"
                />
              </div>
            </div>

            {role === "agency" && (
              <>
                <div>
                  <label className="block text-[12px] text-[var(--text-2)] mb-[7px] font-medium">Agency name</label>
                  <input
                    type="text"
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    placeholder="My Agency"
                    required
                    className="w-full bg-[var(--bg)] rounded-[8px] px-3.5 py-[10px] text-[14px] text-[var(--text)] placeholder-[var(--text-3)] transition-colors outline-none"
                    style={{ border: "1px solid var(--border)" }}
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-[var(--text-2)] mb-[7px] font-medium">
                    Agency Telegram <span className="text-[var(--text-3)] font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={agencyTelegram}
                    onChange={(e) => setAgencyTelegram(e.target.value)}
                    placeholder="@myagency"
                    className="w-full bg-[var(--bg)] rounded-[8px] px-3.5 py-[10px] text-[14px] text-[var(--text)] placeholder-[var(--text-3)] transition-colors outline-none"
                    style={{ border: "1px solid var(--border)" }}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-[12px] text-[var(--text-2)] mb-[7px] font-medium">
                {role === "agency" ? "Your name" : "Your name"}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={role === "agency" ? "John Smith" : "Alex"}
                required
                className="w-full bg-[var(--bg)] rounded-[8px] px-3.5 py-[10px] text-[14px] text-[var(--text)] placeholder-[var(--text-3)] transition-colors outline-none"
                style={{ border: "1px solid var(--border)" }}
              />
            </div>

            <div>
              <label className="block text-[12px] text-[var(--text-2)] mb-[7px] font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-[var(--bg)] rounded-[8px] px-3.5 py-[10px] text-[14px] text-[var(--text)] placeholder-[var(--text-3)] transition-colors outline-none"
                style={{ border: "1px solid var(--border)" }}
              />
            </div>

            <div>
              <label className="block text-[12px] text-[var(--text-2)] mb-[7px] font-medium">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                minLength={8}
                required
                className="w-full bg-[var(--bg)] rounded-[8px] px-3.5 py-[10px] text-[14px] text-[var(--text)] placeholder-[var(--text-3)] transition-colors outline-none"
                style={{ border: "1px solid var(--border)" }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--blue)] hover:bg-[var(--blue-hover)] disabled:opacity-60 text-white rounded-[8px] py-[12px] text-[14px] font-semibold transition-colors border-none mt-1 outline-none cursor-pointer"
            >
              {loading ? "Creating..." : role === "agency" ? "Create agency account" : "Create account"}
            </button>
          </form>
          )}

          {step === "form" && (
            <p className="text-[11px] text-[var(--text-3)] text-center mt-4" style={{ lineHeight: 1.6 }}>
              By creating an account you agree to our{" "}
              <Link href="/terms" className="text-[var(--text-2)] hover:text-[var(--text)]">Terms</Link>{" "}
              and{" "}
              <Link href="/terms" className="text-[var(--text-2)] hover:text-[var(--text)]">Privacy Policy</Link>
            </p>
          )}
        </div>

        <p className="text-center text-[13px] text-[var(--text-3)] mt-5">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--blue)] hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
