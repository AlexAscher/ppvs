import Link from "next/link";
import { LogoWord } from "../../logo";

export default function ConfirmEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-[var(--bg)]">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(0,175,240,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 w-full max-w-[420px] text-center">
        <div className="flex justify-center mb-8">
          <LogoWord size={38} />
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[16px] p-8">
          <div className="w-[52px] h-[52px] rounded-full bg-[#00AFF010] border border-[#00AFF030] flex items-center justify-center mx-auto mb-5">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--blue)"
              strokeWidth="1.8"
            >
              <path
                d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
                strokeLinecap="round"
              />
              <path
                d="M22 6l-10 7L2 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1
            className="text-[20px] font-semibold text-[var(--text)] mb-2"
            style={{ letterSpacing: "-0.02em" }}
          >
            Check your email
          </h1>
          <p className="text-[14px] text-[var(--text-2)] leading-[1.6]">
            We sent a confirmation link to your email address. Click the link to
            verify your account and get access to your dashboard.
          </p>

          <div className="mt-5 bg-[var(--bg)] border border-[var(--border)] rounded-[10px] px-4 py-3 text-[12px] text-[var(--text-3)] leading-[1.6]">
            Didn&apos;t receive the email? Check your spam folder or{" "}
            <Link href="/signup" className="text-[var(--blue)] hover:underline">
              try again
            </Link>
            .
          </div>
        </div>

        <p className="text-center text-[13px] text-[var(--text-3)] mt-5">
          Already confirmed?{" "}
          <Link
            href="/login"
            className="text-[var(--blue)] hover:underline font-medium"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
