import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// `@supabase/ssr` is imported lazily INSIDE the page-auth branch — keeping it
// out of the per-request module graph for /api/* CSRF checks (which are the
// hot path) shaves dev-mode overhead per polling request.

/**
 * Three jobs:
 *   1. Same-origin enforcement (CSRF) on mutating /api/* requests. Cookie-
 *      authed POSTs from another origin are rejected with 403. SameSite=lax
 *      on the Supabase cookie already blocks most of this; the Origin/Referer
 *      check is a belt-and-suspenders defense.
 *   2. Page auth: if unauthenticated, redirect to /login (same host).
 *   3. Role-aware canonical host: agency users live on ppvs.io for the
 *      dashboard and on chatter.ppvs.io for the chat workspace. Chatter
 *      users live entirely on chatter.ppvs.io. If a logged-in user lands on
 *      the wrong host, redirect them to the canonical one — this keeps URLs
 *      consistent even when someone hand-types or shares a link.
 *
 * Subdomain → path rewriting (chatter.ppvs.io/ → /chatter) is done by Caddy
 * BEFORE the request reaches Next, so we don't repeat it here.
 *
 * /admin gates itself server-side (ADMIN_EMAILS) and is not listed below.
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const PAGE_RULES: { prefix: string; role?: "agency" | "chatter" }[] = [
  { prefix: "/dashboard" },
  { prefix: "/chatter" },
  { prefix: "/vault", role: "agency" },
  { prefix: "/send", role: "agency" },
  { prefix: "/team", role: "agency" },
];

// Routes the middleware looks at WITHOUT auth-gating: it needs to inspect the
// session to decide canonical-host redirects, but unauthenticated visitors are
// allowed through (the page itself decides what to render).
const PUBLIC_HOST_AWARE: string[] = ["/login"];

function matchesPage(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

const CHATTER_PREFIX = "chatter.";

function hostnameOf(request: NextRequest): string {
  return (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
}

function cookieDomainFor(hostname: string): string | undefined {
  if (hostname === "ppvs.io" || hostname.endsWith(".ppvs.io")) return ".ppvs.io";
  return undefined;
}

/**
 * For a given role + current host, return the canonical absolute URL the user
 * SHOULD be on for `pathname`, or null if they're already in the right place.
 *
 *   agency  + /dashboard*       → ppvs.io
 *   agency  + /chatter*         → chatter.ppvs.io
 *   chatter + (/dashboard | /chatter)*  → chatter.ppvs.io  (chatters live there)
 *
 * Only fires on prod-style ppvs.io hosts; localhost / nip.io / IP hosts have no
 * subdomain split and stay where they are.
 */
function canonicalHostUrl(
  request: NextRequest,
  role: "agency" | "chatter",
  pathname: string,
): string | null {
  const host = hostnameOf(request);
  if (host !== "ppvs.io" && !host.endsWith(".ppvs.io")) return null;
  const onChatter = host.startsWith(CHATTER_PREFIX);
  const apex = onChatter ? host.slice(CHATTER_PREFIX.length) : host;

  const wantsChatterHost =
    role === "chatter" ||
    (role === "agency" && pathname.startsWith("/chatter"));

  if (wantsChatterHost && !onChatter) {
    // /chatter on the apex shouldn't carry the path — Caddy rewrites bare /
    // on the chatter subdomain back to /chatter, so the user-facing URL is just /.
    const targetPath = pathname === "/chatter" ? "/" : pathname;
    return `https://${CHATTER_PREFIX}${apex}${targetPath}${request.nextUrl.search}`;
  }
  if (!wantsChatterHost && onChatter) {
    return `https://${apex}${pathname}${request.nextUrl.search}`;
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // ── 1. CSRF: same-origin only for mutating /api/* calls ───────────────────
  // EXCEPT inbound webhooks (Malum etc.) — they're server-to-server, have no
  // Origin/Referer matching us, and are authenticated by HMAC signature in
  // the route handler. Blocking them here would silently drop real payment
  // notifications.
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/webhooks/") &&
    MUTATING.has(method)
  ) {
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

  // ── 2. /login canonicalisation ───────────────────────────────────────────
  // Login form is canonicalised to the apex; chatter.ppvs.io/login → ppvs.io/login.
  // The check is cheap (host string) and runs even without a session so a
  // bookmarked chatter.*/login on a logged-out browser still ends up at the
  // right URL.
  const hostnameEarly = hostnameOf(request);
  const onChatterEarly =
    hostnameEarly.startsWith(CHATTER_PREFIX) && hostnameEarly.endsWith("ppvs.io");
  if (pathname === "/login" && onChatterEarly) {
    const apex = hostnameEarly.slice(CHATTER_PREFIX.length);
    return NextResponse.redirect(
      `https://${apex}/login${request.nextUrl.search}`,
    );
  }

  // /login on the apex still needs the session check (logged-in users get
  // hopped to their role's dashboard). Short-circuit when there's no Supabase
  // cookie so anonymous /login hits don't pay the auth round-trip.
  const publicHostAware = PUBLIC_HOST_AWARE.includes(pathname);
  const rule = PAGE_RULES.find((r) => matchesPage(pathname, r.prefix));
  if (!rule && !publicHostAware) return NextResponse.next();

  const hasSupabaseCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));
  if (publicHostAware && !rule && !hasSupabaseCookie) {
    // Anonymous on a public host-aware route → nothing to do.
    return NextResponse.next();
  }

  const hostname = hostnameOf(request);
  const cookieDomain = cookieDomainFor(hostname);

  let response = NextResponse.next({ request });
  const { createServerClient } = await import("@supabase/ssr");
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(cookieDomain ? { cookieOptions: { domain: cookieDomain } } : {}),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            const opts = cookieDomain ? { ...options, domain: cookieDomain } : options;
            response.cookies.set(name, value, opts);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public host-aware path with no session (e.g. landing on apex while logged
  // out, after the cookie expired): just serve the page.
  if (!user) {
    if (publicHostAware && !rule) return response;
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = ((user.user_metadata?.role as string) ?? "chatter") as
    | "agency"
    | "chatter";

  // /login for any logged-in user goes to the role's dashboard on the
  // canonical host (agency → apex, chatter → chatter subdomain). Landing (/)
  // is intentionally left alone — both roles see the marketing page when they
  // visit the apex, and the role-redirect only fires when they click Login.
  if (publicHostAware && !rule) {
    if (pathname === "/login") {
      const target = canonicalHostUrl(request, role, "/dashboard");
      return NextResponse.redirect(
        target ?? new URL("/dashboard", request.url),
      );
    }
    return response;
  }

  // Role gate (some pages are agency-only). Send a chatter to their dashboard
  // on the chatter subdomain rather than dumping them on a permissions error.
  if (!rule) return response;
  if (rule.role && role !== rule.role) {
    const fallback = canonicalHostUrl(request, role, "/dashboard");
    return NextResponse.redirect(fallback ?? new URL("/dashboard", request.url));
  }

  const canonical = canonicalHostUrl(request, role, pathname);
  if (canonical) return NextResponse.redirect(canonical);

  return response;
}

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/chatter/:path*",
    "/vault/:path*",
    "/send/:path*",
    "/team/:path*",
    "/api/:path*",
  ],
};
