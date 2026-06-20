"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LogoWord } from "../logo";
import { createClient } from "@/lib/supabase";
import { homeUrl } from "@/lib/host-routes";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // "Back to home" needs an absolute URL when we're on chatter.ppvs.io —
  // otherwise <Link href="/"> resolves to chatter.ppvs.io/ which Caddy
  // rewrites to /chatter, auth-bouncing back to /login (infinite loop).
  // Set after hydration so SSR/CSR markup matches.
  const [backHref, setBackHref] = useState("/");
  useEffect(() => { setBackHref(homeUrl()); }, []);
  const supabase = createClient();

  // If we land on /login while a session already exists, forward straight to
  // the dashboard (or the `?next=` target). Fixes the "I went back, then
  // clicked Login again, why does it ask for the password" complaint —
  // Supabase's cookie was still valid.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session) return;
      const next = searchParams.get("next") ?? "/dashboard";
      router.replace(next);
    });
    return () => { cancelled = true; };
  }, [router, searchParams, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const next = searchParams.get("next") ?? "/dashboard";
    router.push(next);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-[var(--bg)]">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(0,175,240,0.06) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 w-full max-w-[380px]">
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
            Welcome back
          </h1>
          <p className="text-[13px] text-[var(--text-2)]" style={{ lineHeight: 1.6 }}>
            Sign in to your ppvs.io account
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
              <label className="block text-[12px] text-[var(--text-2)] mb-[7px] font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-[8px] px-3.5 py-[10px] text-[14px] text-[var(--text)] placeholder-[var(--text-3)] transition-colors focus:border-[var(--blue)] outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-[7px]">
                <label className="text-[12px] text-[var(--text-2)] font-medium">Password</label>
                <a href="#" className="text-[12px] text-[var(--blue)] hover:underline">Forgot password?</a>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-[8px] px-3.5 py-[10px] text-[14px] text-[var(--text)] placeholder-[var(--text-3)] transition-colors focus:border-[var(--blue)] outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--blue)] hover:bg-[var(--blue-hover)] disabled:opacity-60 text-white rounded-[8px] py-[12px] text-[14px] font-semibold transition-colors border-none mt-2 outline-none cursor-pointer"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

        </div>

        <p className="text-center text-[13px] text-[var(--text-3)] mt-5">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-[var(--blue)] hover:underline font-medium">Create one free</Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
