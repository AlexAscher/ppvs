import type { NextConfig } from "next";

// Security headers applied to every response. These are the cheap wins we'd
// otherwise lean on Cloudflare for. Intentionally NO X-Frame-Options / CSP
// frame-ancestors: the /pay + Mini App pages are embedded inside Telegram's
// webview, and a framing restriction would blank them out. A full
// Content-Security-Policy is deferred — the app uses many inline styles and
// the Telegram WebApp SDK, so a strict CSP needs dedicated testing before it
// can ship without white-screening the app.
const securityHeaders = [
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

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
