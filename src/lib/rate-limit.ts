/**
 * In-memory sliding-window rate-limit. Defense-in-depth — good for single-
 * instance dev/serverful prod. For multi-instance prod, swap the store for
 * Upstash/Redis using the same `consume()` API.
 *
 *   if (!consume(ip, "deliver", 10, 60_000)) → 429
 */

declare global {
  var __ppvs_rate_buckets__: Map<string, number[]> | undefined;
}
const buckets: Map<string, number[]> =
  globalThis.__ppvs_rate_buckets__ ?? new Map();
globalThis.__ppvs_rate_buckets__ = buckets;

/**
 * @param key       Stable identifier (e.g. `${ip}|${routeId}`).
 * @param limit     Max events allowed in the window.
 * @param windowMs  Window length in ms.
 * @returns true if allowed (and counted), false if over-budget.
 */
export function consume(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const arr = buckets.get(key) ?? [];
  // Drop events outside the window.
  let i = 0;
  while (i < arr.length && arr[i] < cutoff) i++;
  const trimmed = i > 0 ? arr.slice(i) : arr;
  if (trimmed.length >= limit) {
    buckets.set(key, trimmed);
    return false;
  }
  trimmed.push(now);
  buckets.set(key, trimmed);
  return true;
}

/**
 * Client IP from the trusted reverse proxy.
 *
 * We deploy behind Caddy on ppvs.io, which appends the real peer IP to the
 * RIGHT of X-Forwarded-For (and sets X-Real-IP). Reading the LEFTMOST XFF
 * value would let a client spoof the IP simply by sending its own XFF header
 * — the rate-limit buckets are then infinite. Instead we prefer headers set
 * by trusted upstream (cf-connecting-ip / x-real-ip) and, for XFF, take the
 * RIGHTMOST entry, which is the one Caddy just added.
 */
export function getClientIp(req: { headers: Headers }): string {
  const h = req.headers;
  const trusted =
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("fly-client-ip");
  if (trusted) return trusted.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}

/** 429 response with retry hint. */
export function tooManyRequests(retryAfterSec = 60): Response {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(retryAfterSec),
    },
  });
}
