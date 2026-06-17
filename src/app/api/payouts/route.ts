import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getCachedAuthUser } from "@/lib/auth-cache";
import { agencyNet, platformFee, PLATFORM_FEE_PCT } from "@/lib/platform";

/**
 * Agency payout requests.
 *   GET  → list this agency's payouts (newest first), plus header totals:
 *           availableBalance, netSalesTotal, platformFeeTotal.
 *   POST → request a withdrawal { amount, address, currency?, network? }.
 *           Min withdrawal: $30. SLA: completed within 7 days.
 *
 * Agency-scoped via the SSR session; the admin client does the writes.
 */

export const MIN_WITHDRAWAL_USD = 30;

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

const PAID = new Set(["paid", "delivered"]);

type GrossNet = { gross: number; net: number; fee: number };

async function grossAndNet(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  agencyUserId: string,
): Promise<GrossNet> {
  const { data: models } = await admin
    .from("models")
    .select("id")
    .eq("agency_user_id", agencyUserId);
  const modelIds = (models ?? []).map((m: { id: string }) => m.id);
  if (modelIds.length === 0) return { gross: 0, net: 0, fee: 0 };

  // PPV sends + tips, both contribute. agencyNet = (1 − PLATFORM_FEE_PCT) × gross.
  const [sendsRes, tipsRes] = await Promise.all([
    admin.from("ppv_sends").select("total_price, status").in("model_id", modelIds),
    admin.from("tips").select("amount, status").in("model_id", modelIds),
  ]);
  let gross = 0;
  for (const s of (sendsRes.data ?? []) as { total_price: number; status: string }[]) {
    if (PAID.has(s.status)) gross += Number(s.total_price ?? 0);
  }
  for (const t of (tipsRes.data ?? []) as { amount: number; status: string }[]) {
    if (t.status === "paid") gross += Number(t.amount ?? 0);
  }
  const net = agencyNet(gross);
  const fee = platformFee(gross);
  return { gross, net, fee };
}

async function availableBalance(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  agencyUserId: string,
  precomputedNet?: number,
): Promise<number> {
  const net = precomputedNet ?? (await grossAndNet(admin, agencyUserId)).net;
  const { data: payouts } = await admin
    .from("payouts")
    .select("amount, status")
    .eq("agency_user_id", agencyUserId);
  const withdrawn = ((payouts ?? []) as { amount: number; status: string }[])
    .filter((p) => p.status !== "rejected")
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  return Math.max(0, net - withdrawn);
}

export async function GET() {
  try {
    const user = await getCachedAuthUser();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("payouts")
      .select("id, amount, address, currency, network, status, created_at, paid_at")
      .eq("agency_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const totals = await grossAndNet(admin, user.id);
    const balance = await availableBalance(admin, user.id, totals.net);
    return Response.json({
      payouts: (data ?? []) as PayoutRow[],
      availableBalance: Math.round(balance * 100) / 100,
      netSalesTotal: Math.round(totals.net * 100) / 100,
      platformFeeTotal: Math.round(totals.fee * 100) / 100,
      grossSalesTotal: Math.round(totals.gross * 100) / 100,
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

    const admin = createAdminSupabaseClient();
    const balance = await availableBalance(admin, user.id);
    if (amount > balance) {
      return Response.json(
        { error: `Amount exceeds available balance ($${balance.toFixed(2)}).` },
        { status: 400 },
      );
    }

    const { data, error } = await admin
      .from("payouts")
      .insert({ agency_user_id: user.id, amount, address, currency, network, status: "pending" })
      .select("id, amount, address, currency, network, status, created_at, paid_at")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const newBalance = await availableBalance(admin, user.id);
    return Response.json({ payout: data as PayoutRow, availableBalance: newBalance });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
