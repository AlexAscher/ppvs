import type { NextConfig } from "next";

// Baseline headers applied to every response. Cheap wins we'd otherwise
// lean on Cloudflare for.
const baseSecurityHeaders = [
  // Stop MIME sniffing (a classic XSS vector on user-uploaded media).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak full URLs (which can contain pay codes) to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Lock down powerful browser APIs we never use.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Force HTTPS for a year. Safe — the app is already served over TLS.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

// Frame protection. Dashboard / admin / chatter workspace are not meant to
// be embedded anywhere; framing them enables clickjacking on the agency's
// authenticated session. Only /pay, /tip and /mini opt out — they render
// inside Telegram's webview.
const frameDenyHeader = { key: "X-Frame-Options", value: "DENY" };

// Routes that must never be embedded — the agency's authenticated surface
// and every state-changing API. /pay, /tip, /mini are excluded on purpose
// (they render inside Telegram's webview).
const NON_FRAMEABLE = [
  "/dashboard/:path*",
  "/chatter/:path*",
  "/admin/:path*",
  "/vault/:path*",
  "/send/:path*",
  "/team/:path*",
  "/settings/:path*",
  "/login",
  "/signup",
  "/api/:path*",
];

const nextConfig: NextConfig = {
  async headers() {
    // Baseline headers apply to every route. Frame-deny stacks on top for
    // the sensitive routes only — Next.js merges headers across matching
    // sources, so listing frame-deny on specific paths gives those routes
    // baseline + DENY while /pay, /tip and /mini stay frameable.
    return [
      { source: "/:path*", headers: baseSecurityHeaders },
      ...NON_FRAMEABLE.map((source) => ({ source, headers: [frameDenyHeader] })),
    ];
  },
};

export default nextConfig;
