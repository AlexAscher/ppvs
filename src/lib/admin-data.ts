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
      date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      ts: d.getTime(),
      value: 0,
    });
  }
  return buckets;
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
