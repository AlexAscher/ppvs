import Link from "next/link";

/**
 * Brand mark — blue P-key from /public/landing/logo.png. The PNG already
 * contains the "PPVS.IO" wordmark next to the icon, so the sidebar/header
 * gets a single self-contained logo block with no extra <span>.
 */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/landing/logo.png"
      alt="ppvs.io"
      style={{ height: size, width: "auto", objectFit: "contain", display: "block", borderRadius: "6px" }}
    />
  );
}

export function LogoWord({ size = 30 }: { size?: number }) {
  return (
    <Link href="/" className="flex items-center select-none">
      <Logo size={size} />
    </Link>
  );
}
