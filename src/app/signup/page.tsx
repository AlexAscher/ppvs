"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoWord } from "../logo";
import { createClient } from "@/lib/supabase";

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
  const router = useRouter();
  const [role, setRole] = useState<Role>("agency");
  const [agencyName, setAgencyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          role,
          agency_name: role === "agency" ? agencyName : null,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-[var(--bg)] py-12">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(0,175,240,0.06) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 w-full max-w-[420px]">
        <Link
          href="/"
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

          <p className="text-[11px] text-[var(--text-3)] text-center mt-4" style={{ lineHeight: 1.6 }}>
            By creating an account you agree to our{" "}
            <a href="#" className="text-[var(--text-2)] hover:text-[var(--text)]">Terms</a>{" "}
            and{" "}
            <a href="#" className="text-[var(--text-2)] hover:text-[var(--text)]">Privacy Policy</a>
          </p>
        </div>

        <p className="text-center text-[13px] text-[var(--text-3)] mt-5">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--blue)] hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
