import type { SupabaseClient } from "@supabase/supabase-js";
import { withTimeout } from "@/lib/with-timeout";

/**
 * Shared building blocks for the admin aggregation routes. Everything is
 * computed live from existing tables (no precomputed stats); the admin client
 * (service role) bypasses RLS, and access is gated upstream by requireAdmin().
 */

// A sale counts toward revenue once it's been paid or delivered.
export const PAID = new Set(["paid", "delivered"]);

// Paginated loaders. The platform-wide tables (ppv_sends, fans) can be large,
// and on a slow connection a single unbounded SELECT times out and 503s the
// whole route. We page in chunks so each request is small; if one page
// fails/times out we return what we have plus `partial: true`.
const PAGE = 1000;
const PAGE_TIMEOUT_MS = 12_000;
const MAX_PAGES = 200; // 200k-row safety cap

export type SendLite = {
  id: string;
  model_id: string;
  chatter_id: string | null;
  total_price: number | string;
  status: string;
  created_at: string;
};
export type FanLite = {
  peer_id: string;
  model_id: string;
  telegram_username: string | null;
  telegram_name: string | null;
  total_spent: number | string;
  last_seen_at: string | null;
};

export async function loadSends(
  admin: SupabaseClient,
  modelIds?: string[],
): Promise<{ rows: SendLite[]; partial: boolean }> {
  if (modelIds && modelIds.length === 0) return { rows: [], partial: false };
  const rows: SendLite[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    // Filters (.in) must precede transforms (.order/.range) for the types to line up.
    let f = admin.from("ppv_sends").select("id, model_id, chatter_id, total_price, status, created_at");
    if (modelIds) f = f.in("model_id", modelIds);
    const q = f.order("id", { ascending: true }).range(from, from + PAGE - 1);
    try {
      const { data, error } = await withTimeout(Promise.resolve(q), PAGE_TIMEOUT_MS, `loadSends p${page}`);
      if (error) return { rows, partial: true };
      const batch = (data ?? []) as SendLite[];
      rows.push(...batch);
      if (batch.length < PAGE) return { rows, partial: false };
    } catch {
      return { rows, partial: true };
    }
  }
  return { rows, partial: true };
}

export async function loadFans(
  admin: SupabaseClient,
  modelIds?: string[],
): Promise<{ rows: FanLite[]; partial: boolean }> {
  if (modelIds && modelIds.length === 0) return { rows: [], partial: false };
  const rows: FanLite[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    let f = admin
      .from("fans")
      .select("peer_id, model_id, telegram_username, telegram_name, total_spent, last_seen_at");
    if (modelIds) f = f.in("model_id", modelIds);
    const q = f.order("id", { ascending: true }).range(from, from + PAGE - 1);
    try {
      const { data, error } = await withTimeout(Promise.resolve(q), PAGE_TIMEOUT_MS, `loadFans p${page}`);
      if (error) return { rows, partial: true };
      const batch = (data ?? []) as FanLite[];
      rows.push(...batch);
      if (batch.length < PAGE) return { rows, partial: false };
    } catch {
      return { rows, partial: true };
    }
  }
  return { rows, partial: true };
}

export type AgencyInfo = {
  id: string;
  name: string;
  email: string;
  payoutAddress: string | null;
};

export function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Build `days` daily buckets ending today (oldest → newest). */
export function makeChartBuckets(days: number): { date: string; ts: number; value: number }[] {
  const todayStart = startOfDay(new Date());
  const buckets: { date: string; ts: number; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayStart - i * 86_400_000);
    buckets.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      ts: d.getTime(),
      value: 0,
    });
  }
  return buckets;
}

export type ChartPeriod = "1d" | "7d" | "30d" | "all";
export type ChartBucket = { date: string; ts: number; value: number };

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** Hard cap on All Time bucket count so a project running for a decade
 *  doesn't ship a 520-point series to the browser. */
const MAX_WEEKLY_BUCKETS = 156; // ~3 years

function startOfHour(ts: number): number {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

/** Monday 00:00 of the week containing `ts`. ISO week start. */
function startOfWeek(ts: number): number {
  const d = new Date(ts);
  // getDay(): 0=Sun..6=Sat. We want Mon=0..Sun=6.
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Build an empty bucket series for a selected period. The granularity is
 * picked to make the chart legible — hours for 1d, days for 7/30d, weeks
 * for all-time — and the count is capped so the browser doesn't have to
 * render thousands of points.
 *
 *   1d   → 24 hourly buckets ending at the current hour
 *   7d   → 7 daily buckets ending today
 *   30d  → 30 daily buckets ending today
 *   all  → weekly buckets from week of `earliestTs` to this week
 */
export function buildChartBuckets(period: ChartPeriod, earliestTs?: number): ChartBucket[] {
  const now = Date.now();
  const buckets: ChartBucket[] = [];

  if (period === "1d") {
    const endHour = startOfHour(now);
    for (let i = 23; i >= 0; i--) {
      const t = endHour - i * HOUR_MS;
      const d = new Date(t);
      buckets.push({
        date: `${String(d.getHours()).padStart(2, "0")}:00`,
        ts: t,
        value: 0,
      });
    }
    return buckets;
  }

  if (period === "7d" || period === "30d") {
    const days = period === "7d" ? 7 : 30;
    const todayStart = startOfDay(new Date(now));
    for (let i = days - 1; i >= 0; i--) {
      const t = todayStart - i * DAY_MS;
      const d = new Date(t);
      buckets.push({
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        ts: t,
        value: 0,
      });
    }
    return buckets;
  }

  // period === "all"
  // Fall back to "last 4 weeks of zeros" if we have no sales yet, so the
  // chart still has something to draw on an empty dashboard.
  const seedTs = earliestTs ?? now - 4 * WEEK_MS;
  const first = startOfWeek(seedTs);
  const last = startOfWeek(now);
  for (let t = first; t <= last; t += WEEK_MS) {
    const d = new Date(t);
    buckets.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      ts: t,
      value: 0,
    });
  }
  if (buckets.length > MAX_WEEKLY_BUCKETS) {
    // Drop oldest buckets — the user cares about recent trend, and the
    // overflowed range can be inspected via shorter periods.
    return buckets.slice(buckets.length - MAX_WEEKLY_BUCKETS);
  }
  return buckets;
}

/** Pick the bucket that contains `ts`, or undefined if it's outside the
 *  window. Bucket width is implied by `period`. */
export function bucketFor(
  buckets: ChartBucket[],
  ts: number,
  period: ChartPeriod,
): ChartBucket | undefined {
  const width = period === "1d" ? HOUR_MS : period === "all" ? WEEK_MS : DAY_MS;
  // Linear scan is fine — N is at most ~156 for "all" and otherwise ≤ 30.
  return buckets.find((b) => ts >= b.ts && ts < b.ts + width);
}

/** Validate + normalize the `period` query string. */
export function parseChartPeriod(raw: string | null | undefined): ChartPeriod {
  if (raw === "1d" || raw === "30d" || raw === "all") return raw;
  return "7d";
}

/**
 * Every agency on the platform = an auth user whose user_metadata.role is
 * "agency". Paged through admin.auth.admin.listUsers (perPage max 1000).
 */
export async function listAgencies(admin: SupabaseClient): Promise<Map<string, AgencyInfo>> {
  const map = new Map<string, AgencyInfo>();
  const perPage = 1000;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data) break;
    for (const u of data.users) {
      const role = (u.user_metadata?.role as string) ?? "";
      if (role !== "agency") continue;
      const name =
        (u.user_metadata?.agency_name as string) ||
        (u.user_metadata?.full_name as string) ||
        (u.user_metadata?.display_name as string) ||
        u.email?.split("@")[0] ||
        "Agency";
      map.set(u.id, {
        id: u.id,
        name,
        email: u.email ?? "",
        payoutAddress: (u.user_metadata?.payout_address as string) ?? null,
      });
    }
    if (data.users.length < perPage) break;
  }
  return map;
}

/** Best-effort display name for a chatter/agency user id. */
export async function resolveUserName(admin: SupabaseClient, id: string): Promise<string> {
  try {
    const { data } = await admin.auth.admin.getUserById(id);
    const u = data?.user;
    return (
      (u?.user_metadata?.full_name as string) ||
      (u?.user_metadata?.display_name as string) ||
      (u?.user_metadata?.agency_name as string) ||
      u?.email?.split("@")[0] ||
      "User"
    );
  } catch {
    return "User";
  }
}
