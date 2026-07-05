import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getCachedAuthUser } from "@/lib/auth-cache";
import { PLATFORM_FEE_PCT } from "@/lib/platform";
import { computeAgencyBalances, MIN_WITHDRAWAL_USD } from "@/lib/payouts-balance";

// Serialize payout requests per agency. Without this two concurrent POSTs
// can both read `available` before either insert lands, both pass the
// `amount <= available` check, and the agency withdraws more than its
// cleared balance. Single-instance in-memory is enough for the current
// deploy; a multi-node prod would replace this with a Postgres advisory
// lock or a Redis mutex.
declare global {
  var __ppvs_payout_locks__: Map<string, Promise<unknown>> | undefined;
}
const payoutLocks: Map<string, Promise<unknown>> =
  globalThis.__ppvs_payout_locks__ ?? new Map();
globalThis.__ppvs_payout_locks__ = payoutLocks;

async function withAgencyLock<T>(agencyId: string, fn: () => Promise<T>): Promise<T> {
  const prev = payoutLocks.get(agencyId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  payoutLocks.set(agencyId, next.finally(() => {
    if (payoutLocks.get(agencyId) === next) payoutLocks.delete(agencyId);
  }));
  return next;
}

/**
 * Agency payout requests.
 *   GET  → list this agency's payouts (newest first) + balance header:
 *           available (cleared the 30-day hold), pending (still held),
 *           nextRelease*, net/fee/gross lifetime totals.
 *   POST → request a withdrawal { amount, address, currency?, network? }.
 *           Min $20. Can only request what has cleared the hold.
 *
 * Agency-scoped via the SSR session; the admin client does the writes.
 */

export { MIN_WITHDRAWAL_USD };

export type PayoutRow = {
  id: string;
  amount: number;
  address: string | null;
  currency: string | null;
  network: string | null;
  status: string;
  created_at: string;
  paid_at: string | null;
};

export async function GET() {
  try {
    const user = await getCachedAuthUser();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const admin = createAdminSupabaseClient();
    const [listRes, bal] = await Promise.all([
      admin
        .from("payouts")
        .select("id, amount, address, currency, network, status, created_at, paid_at")
        .eq("agency_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      computeAgencyBalances(admin, user.id),
    ]);
    if (listRes.error) return Response.json({ error: listRes.error.message }, { status: 500 });

    return Response.json({
      payouts: (listRes.data ?? []) as PayoutRow[],
      availableBalance: bal.available,
      pendingBalance: bal.pending,
      nextReleaseAt: bal.nextReleaseAt,
      nextReleaseAmount: bal.nextReleaseAmount,
      netSalesTotal: bal.netLifetime,
      platformFeeTotal: bal.feeLifetime,
      grossSalesTotal: bal.grossLifetime,
      platformFeePct: PLATFORM_FEE_PCT,
      minWithdrawal: MIN_WITHDRAWAL_USD,
    });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCachedAuthUser();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as {
      amount?: number;
      address?: string;
      currency?: string;
      network?: string;
    } | null;
    const amount = Math.floor(Number(body?.amount ?? 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: "Enter a valid amount" }, { status: 400 });
    }
    if (amount < MIN_WITHDRAWAL_USD) {
      return Response.json(
        { error: `Minimum withdrawal is $${MIN_WITHDRAWAL_USD}.` },
        { status: 400 },
      );
    }
    const address = (body?.address ?? "").trim() || null;
    const currency = (body?.currency ?? "").trim().toUpperCase() || null;
    const network = (body?.network ?? "").trim().toUpperCase() || null;

    // Serialize concurrent payout requests from the same agency so the
    // balance check + insert form an atomic block. Without this two POSTs
    // can each pass `amount <= bal.available` before either row lands, and
    // the agency withdraws more than its cleared balance.
    return await withAgencyLock(user.id, async () => {
      const admin = createAdminSupabaseClient();
      const bal = await computeAgencyBalances(admin, user.id);
      if (amount > bal.available) {
        return Response.json(
          { error: `Amount exceeds available balance ($${bal.available.toFixed(2)}).` },
          { status: 400 },
        );
      }

      const { data, error } = await admin
        .from("payouts")
        .insert({ agency_user_id: user.id, amount, address, currency, network, status: "pending" })
        .select("id, amount, address, currency, network, status, created_at, paid_at")
        .single();
      if (error) return Response.json({ error: error.message }, { status: 500 });

      const after = await computeAgencyBalances(admin, user.id);
      return Response.json({ payout: data as PayoutRow, availableBalance: after.available });
    });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
