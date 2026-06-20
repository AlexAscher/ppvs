import { createBrowserClient } from "@supabase/ssr";

/**
 * Compute the cookie domain so a login on ppvs.io is also valid on
 * chatter.ppvs.io (and any future subdomain). Setting `.ppvs.io` tells the
 * browser to send the auth cookie to every host under the apex. Dev hosts
 * (localhost, raw IPs, nip.io fallback) keep host-scoped cookies — those
 * envs don't have a subdomain split anyway.
 */
function getCookieDomain(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const h = window.location.hostname.toLowerCase();
  if (h === "ppvs.io" || h.endsWith(".ppvs.io")) return ".ppvs.io";
  return undefined;
}

export function createClient() {
  const domain = getCookieDomain();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    domain ? { cookieOptions: { domain } } : undefined,
  );
}
