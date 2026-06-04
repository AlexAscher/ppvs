import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Cached `supabase.auth.getUser()` for API routes.
 *
 * Why: a bare `await supabase.auth.getUser()` can hang for 30–70s on a flaky
 * uplink to Supabase, and every polling endpoint will then 401 after the
 * timeout. We do the same trick as `telegram-authorize.getUserIdFromCookies`:
 *   - 8s hard timeout on the call;
 *   - cookie-keyed cache with a 60s TTL — same logged-in browser = same key;
 *   - on timeout / transient error, keep serving the cached value for up to
 *     5min so one DB blip doesn't lock the user out.
 *
 * Returns both id and email (admin routes need email to compare allowlist).
 */

export type CachedAuthUser = { id: string; email: string | null };

declare global {
  var __ppvs_auth_user_cache_v2__:
    | Map<string, { user: CachedAuthUser; ts: number }>
    | undefined;
}
const cache: Map<string, { user: CachedAuthUser; ts: number }> =
  globalThis.__ppvs_auth_user_cache_v2__ ?? new Map();
globalThis.__ppvs_auth_user_cache_v2__ = cache;

const TTL_MS = 60_000;
const STALE_MS = 5 * 60_000;
const TIMEOUT_MS = 8_000;

function runWithTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} TIMEOUT after ${ms}ms`));
    }, ms);
    p.then(
      (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function getCachedAuthUser(): Promise<CachedAuthUser | null> {
  const cookieStore = await cookies();
  const all = cookieStore.getAll();
  const tokenCookie = all.find(
    (c) =>
      c.name.startsWith("sb-") &&
      (c.name.endsWith("-auth-token") || c.name.endsWith("-auth-token.0")),
  );
  const key = tokenCookie ? `${tokenCookie.name}=${tokenCookie.value}` : "no-token";

  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.user;

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await runWithTimeout(
      supabase.auth.getUser(),
      TIMEOUT_MS,
      "auth.getUser",
    );
    const u = data?.user;
    if (!u) {
      cache.delete(key);
      return null;
    }
    const value: CachedAuthUser = { id: u.id, email: u.email ?? null };
    cache.set(key, { user: value, ts: Date.now() });
    return value;
  } catch (e) {
    console.error(
      "[auth-cache] getUser failed:",
      e instanceof Error ? e.message : e,
    );
    if (hit && Date.now() - hit.ts < STALE_MS) return hit.user;
    return null;
  }
}
