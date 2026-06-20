/**
 * Cross-subdomain navigation helpers for the ppvs.io / chatter.ppvs.io split.
 *
 * Routing model (per user spec):
 *   - Landing + marketing                   → ppvs.io
 *   - Agency dashboard, vault, settings…    → ppvs.io
 *   - Chatter workspace (everyone using it) → chatter.ppvs.io
 *   - Chatter's OWN dashboard (chatter role's /dashboard view) → chatter.ppvs.io
 *
 * Why client helpers, not Next <Link>: cross-subdomain navigation needs an
 * absolute URL (different origin), which Next routes via full page nav. We
 * compute the URL at call time from window.location so the same code works
 * in dev (localhost — single host, paths) and prod (subdomain split).
 *
 * Server-side rendering note: these helpers fall back to a relative path
 * when `window` is undefined, so the first SSR render uses safe defaults
 * and the client effect upgrades them after hydration.
 */

const CHATTER_PREFIX = "chatter.";

/** True iff the page is currently being viewed on a `chatter.*` subdomain. */
export function isOnChatterHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname.toLowerCase().startsWith(CHATTER_PREFIX);
}

/** Apex host of the current page (strips a single `chatter.` prefix if any). */
function apexOfCurrentHost(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname.toLowerCase();
  return h.startsWith(CHATTER_PREFIX) ? h.slice(CHATTER_PREFIX.length) : h;
}

/**
 * URL to the chatter workspace (the live messaging UI).
 *
 *   - Already on chatter.*       → relative "/" (Caddy rewrites / → /chatter)
 *   - On ppvs.io (apex)          → https://chatter.ppvs.io/
 *   - Localhost / dev / IP host  → "/chatter" (no subdomain split in dev)
 *
 * `query` is appended (without a leading `?`) when present, useful for the
 * deep-link inbox jump (`?modelId=…&peerId=…`).
 */
export function chatterWorkspaceUrl(query?: string): string {
  const tail = query ? `?${query}` : "";
  if (typeof window === "undefined") return `/chatter${tail}`;
  if (isOnChatterHost()) return `/${tail}`;
  const apex = apexOfCurrentHost();
  // Only hop to a `chatter.` subdomain when the apex is one we actually
  // serve there (currently *.ppvs.io). Anywhere else (localhost, IP) stays
  // on the same host with the path form.
  if (apex.endsWith("ppvs.io")) {
    return `${window.location.protocol}//${CHATTER_PREFIX}${apex}/${tail}`;
  }
  return `/chatter${tail}`;
}

/**
 * URL to /dashboard, routed by the caller's role:
 *
 *   - role="chatter": always chatter.ppvs.io/dashboard (chatters live on the
 *     chatter subdomain even for their own dashboard view).
 *   - role="agency" (default): always ppvs.io/dashboard.
 *
 * Falls back to a same-host relative path off the apex in dev.
 */
export function dashboardUrl(role: "agency" | "chatter" = "agency"): string {
  if (typeof window === "undefined") return "/dashboard";
  const apex = apexOfCurrentHost();
  const onChatter = isOnChatterHost();
  if (role === "chatter") {
    if (onChatter) return "/dashboard";
    if (apex.endsWith("ppvs.io")) {
      return `${window.location.protocol}//${CHATTER_PREFIX}${apex}/dashboard`;
    }
    return "/dashboard";
  }
  // agency
  if (!onChatter) return "/dashboard";
  if (apex.endsWith("ppvs.io")) {
    return `${window.location.protocol}//${apex}/dashboard`;
  }
  return "/dashboard";
}

/**
 * URL to the public landing page. From a `chatter.*` subdomain, hops to the
 * apex; from the apex (or dev), returns "/" as a relative path. Used by the
 * "Back to home" link on the login / signup / 404 screens — the bug was
 * that `<Link href="/">` on `chatter.ppvs.io/login` resolves to
 * `chatter.ppvs.io/` which Caddy rewrites to `/chatter` → auth bounce →
 * back to /login (infinite loop).
 */
export function homeUrl(): string {
  if (typeof window === "undefined") return "/";
  if (!isOnChatterHost()) return "/";
  const apex = apexOfCurrentHost();
  return `${window.location.protocol}//${apex}/`;
}
