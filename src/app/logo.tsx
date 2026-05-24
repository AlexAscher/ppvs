import Link from "next/link";

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-[8px] relative overflow-hidden"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #00AFF0 0%, #0089BE 100%)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.15) inset, 0 4px 14px rgba(0,175,240,0.25)",
      }}
    >
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M4.5 11.5L19.5 5L13 19.5L10.5 13.5L4.5 11.5Z"
          fill="rgba(255,255,255,0.4)"
          stroke="#fff"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <rect
          x="13"
          y="13"
          width="7.5"
          height="7.5"
          rx="1.5"
          fill="rgba(0,0,0,0.3)"
          stroke="#fff"
          strokeWidth="1.3"
        />
        <path
          d="M15 16v-0.8a1.25 1.25 0 0 1 2.5 0V16"
          stroke="#fff"
          strokeWidth="1.1"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

export function LogoWord({ size = 32 }: { size?: number }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 select-none">
      <Logo size={size} />
      <span className="text-[17px] font-semibold tracking-tight">
        ppvs<span className="text-[var(--blue)]">.io</span>
      </span>
    </Link>
  );
}
