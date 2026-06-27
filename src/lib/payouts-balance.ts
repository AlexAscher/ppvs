import { agencyNet, platformFee } from "@/lib/platform";
import type { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * Agency balance with the Telegram-Stars clearing hold.
 *
 * Telegram itself holds Stars ~21 days before they can be withdrawn; we hold
 * each sale 30 days before the agency can request its share — a buffer against
 * refund abuse (a fan can refund within the window; if we'd already paid the
 * agency we'd be out of pocket). A sale only counts toward `available` once its
 * `paid_at` is older than HOLD_DAYS; until then it sits in `pending`.
 *
 * Shared by /api/payouts (authoritative) and /api/dashboard/stats so the number
 * the agency sees is identical everywhere.
 */

type Admin = ReturnType<typeof createAdminSupabaseClient>;

export const HOLD_DAYS = 30;
export const MIN_WITHDRAWAL_USD = 20;

const PAID_SEND = new Set(["paid", "delivered"]);
const DAY_MS = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type AgencyBalances = {
  grossLifetime: number;
  netLifetime: number;
  feeLifetime: number;
  /** Cleared funds (sale older than the hold), net of fee, minus committed payouts. */
  available: number;
  /** Funds still inside the 30-day hold, net of fee. */
  pending: number;
  /** Sum of non-rejected payout requests (requested or already paid). */
  committed: number;
  /** When the oldest pending sale clears, ISO; null if nothing is pending. */
  nextReleaseAt: string | null;
  /** Net amount releasing on nextReleaseAt. */
  nextReleaseAmount: number;
};

const EMPTY: AgencyBalances = {
  grossLifetime: 0, netLifetime: 0, feeLifetime: 0,
  available: 0, pending: 0, committed: 0,
  nextReleaseAt: null, nextReleaseAmount: 0,
};

export async function computeAgencyBalances(
  admin: Admin,
  agencyUserId: string,
): Promise<AgencyBalances> {
  const { data: models } = await admin
    .from("models")
    .select("id")
    .eq("agency_user_id", agencyUserId);
  const modelIds = (models ?? []).map((m: { id: string }) => m.id);
  if (modelIds.length === 0) return EMPTY;

  const cutoff = Date.now() - HOLD_DAYS * DAY_MS;
  const [sendsRes, tipsRes, payoutsRes] = await Promise.all([
    admin.from("ppv_sends").select("total_price, status, paid_at").in("model_id", modelIds),
    admin.from("tips").select("amount, status, paid_at").in("model_id", modelIds),
    admin.from("payouts").select("amount, status").eq("agency_user_id", agencyUserId),
  ]);

  let grossCleared = 0, grossPending = 0;
  let nextReleaseMs: number | null = null;
  let nextReleaseGross = 0;

  const consider = (amount: number, paidAt: string | null) => {
    const a = Number(amount ?? 0);
    if (!(a > 0)) return;
    const t = paidAt ? Date.parse(paidAt) : NaN;
    // Unknown/old paid_at (legacy rows) → treat as already cleared.
    if (!Number.isFinite(t) || t <= cutoff) { grossCleared += a; return; }
    grossPending += a;
    const release = t + HOLD_DAYS * DAY_MS;
    if (nextReleaseMs == null || release < nextReleaseMs) { nextReleaseMs = release; nextReleaseGross = a; }
    else if (release === nextReleaseMs) nextReleaseGross += a;
  };

  for (const s of (sendsRes.data ?? []) as { total_price: number; status: string; paid_at: string | null }[]) {
    if (PAID_SEND.has(s.status)) consider(s.total_price, s.paid_at);
  }
  for (const t of (tipsRes.data ?? []) as { amount: number; status: string; paid_at: string | null }[]) {
    if (t.status === "paid") consider(t.amount, t.paid_at);
  }

  const committed = ((payoutsRes.data ?? []) as { amount: number; status: string }[])
    .filter((p) => p.status !== "rejected")
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  const grossLifetime = grossCleared + grossPending;
  return {
    grossLifetime: round2(grossLifetime),
    netLifetime: round2(agencyNet(grossLifetime)),
    feeLifetime: round2(platformFee(grossLifetime)),
    available: round2(Math.max(0, agencyNet(grossCleared) - committed)),
    pending: round2(agencyNet(grossPending)),
    committed: round2(committed),
    nextReleaseAt: nextReleaseMs != null ? new Date(nextReleaseMs).toISOString() : null,
    nextReleaseAmount: round2(agencyNet(nextReleaseGross)),
  };
}
