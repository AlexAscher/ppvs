import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// `@supabase/ssr` is imported lazily INSIDE the page-auth branch — keeping it
// out of the per-request module graph for /api/* CSRF checks (which are the
// hot path) shaves dev-mode overhead per polling request.

/**
 * Two jobs:
 *   1. Same-origin enforcement (CSRF) on mutating /api/* requests. Cookie-
 *      authed POSTs from another origin are rejected with 403. SameSite=lax
 *      on the Supabase cookie already blocks most of this; the Origin/Referer
 *      check is a belt-and-suspenders defense.
 *   2. Page auth + role gating. Some pages require an "agency" role; chatters
 *      hitting them bounce to /dashboard instead of seeing data their role
 *      isn't supposed to touch.
 *
 * /admin gates itself server-side (ADMIN_EMAILS) and is not listed here, so
 * non-admins can't even reach the role check on it.
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Page paths that need auth, with optional role requirement.
const PAGE_RULES: { prefix: string; role?: "agency" | "chatter" }[] = [
  { prefix: "/dashboard" },
  { prefix: "/chatter" },
  { prefix: "/vault", role: "agency" },
  { prefix: "/send", role: "agency" },
  { prefix: "/team", role: "agency" },
];

function matchesPage(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // ── 0. Subdomain → section rewrite ────────────────────────────────────────
  // chatter.ppvs.io serves the chatter workspace; the Telegram mini-app is
  // hosted on its own domain ppvs.tech (kept off the main marketing domain
  // both for branding and as a fallback if .io gets blocked in any region).
  // Only the bare root is remapped so deep paths (/api, /_next, /login,
  // static assets) still resolve normally on each host.
  // No auth gating needed here: the chatter page self-guards (redirects to
  // /login when there's no session) and the mini-app authenticates via
  // Telegram initData.
  if (pathname === "/") {
    const host = (request.headers.get("host") ?? "").toLowerCase();
    // Strip any :port suffix so dev (localhost:3000) + prod match consistently.
    const hostname = host.split(":")[0];
    if (hostname.startsWith("chatter.")) {
      const url = request.nextUrl.clone();
      url.pathname = "/chatter";
      return NextResponse.rewrite(url);
    }
    // Mini-app lives on ppvs.tech (apex) and the legacy mini. subdomain.
    if (hostname === "ppvs.tech" || hostname.startsWith("mini.")) {
      const url = request.nextUrl.clone();
      url.pathname = "/mini";
      return NextResponse.rewrite(url);
    }
  }

  // ── 1. CSRF: same-origin only for mutating /api/* calls ───────────────────
  if (pathname.startsWith("/api/") && MUTATING.has(method)) {
    const host = request.headers.get("host");
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");

    const sameOrigin = (() => {
      const target = origin ?? referer;
      if (!target) return false;
      try {
        return new URL(target).host === host;
      } catch {
        return false;
      }
    })();

    if (!sameOrigin) {
      return new NextResponse(
        JSON.stringify({ error: "Cross-origin request rejected" }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    }
    return NextResponse.next();
  }

  // ── 2. Page auth + role gating ────────────────────────────────────────────
  const rule = PAGE_RULES.find((r) => matchesPage(pathname, r.prefix));
  if (!rule) return NextResponse.next();

  let response = NextResponse.next({ request });
  const { createServerClient } = await import("@supabase/ssr");
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (rule.role) {
    const role = (user.user_metadata?.role as string) ?? "chatter";
    if (role !== rule.role) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Root is matched so the chatter./mini. subdomain rewrite can fire.
    "/",
    "/dashboard/:path*",
    "/chatter/:path*",
    "/vault/:path*",
    "/send/:path*",
    "/team/:path*",
    "/api/:path*",
  ],
};
