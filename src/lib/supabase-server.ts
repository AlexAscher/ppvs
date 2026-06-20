import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

/**
 * Compute the cookie domain from the incoming Host header so a login on
 * ppvs.io is also valid on chatter.ppvs.io (and any future subdomain).
 * Dev hosts (localhost, raw IPs, nip.io) keep host-scoped cookies — they
 * don't have the subdomain split.
 */
function cookieDomainFromHost(host: string | null): string | undefined {
  const h = (host ?? "").toLowerCase().split(":")[0];
  if (h === "ppvs.io" || h.endsWith(".ppvs.io")) return ".ppvs.io";
  return undefined;
}

export async function createSupabaseServerClient() {
  const [cookieStore, headersList] = await Promise.all([cookies(), headers()]);
  const domain = cookieDomainFromHost(headersList.get("host"));
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(domain ? { cookieOptions: { domain } } : {}),
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const opts = domain ? { ...options, domain } : options;
              cookieStore.set(name, value, opts);
            });
          } catch {
            // Called from Server Component — cookies can't be set; middleware handles this
          }
        },
      },
    }
  );
}

export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
