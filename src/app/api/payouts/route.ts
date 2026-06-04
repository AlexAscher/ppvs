import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getCachedAuthUser } from "@/lib/auth-cache";

/**
 * Agency payout requests.
 *   GET  → list this agency's payouts (newest first)
 *   POST → request a withdrawal { amount, address }. Validates against the
 *          live available balance (all-time net − non-rejected payouts).
 *
 * Agency-scoped via the SSR session; the admin client does the writes.
 */

export type PayoutRow = {
  id: string;
  amount: number;
  address: string | null;
  status: string;
  created_at: string;
  paid_at: string | null;
};

const PAID = new Set(["paid", "delivered"]);

async function availableBalance(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  agencyUserId: string,
): Promise<number> {
  const { data: models } = await admin
    .from("models")
    .select("id")
    .eq("agency_user_id", agencyUserId);
  const modelIds = (models ?? []).map((m: { id: string }) => m.id);
  if (modelIds.length === 0) return 0;

  const { data: sends } = await admin
    .from("ppv_sends")
    .select("total_price, status")
    .in("model_id", modelIds);
  const net = ((sends ?? []) as { total_price: number; status: string }[])
    .filter((s) => PAID.has(s.status))
    .reduce((sum, s) => sum + Number(s.total_price ?? 0), 0);

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
      .select("id, amount, address, status, created_at, paid_at")
      .eq("agency_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const balance = await availableBalance(admin, user.id);
    return Response.json({ payouts: (data ?? []) as PayoutRow[], availableBalance: balance });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCachedAuthUser();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { amount?: number; address?: string } | null;
    const amount = Number(body?.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: "Enter a valid amount" }, { status: 400 });
    }
    const address = (body?.address ?? "").trim() || null;

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
      .insert({ agency_user_id: user.id, amount, address, status: "pending" })
      .select("id, amount, address, status, created_at, paid_at")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const newBalance = await availableBalance(admin, user.id);
    return Response.json({ payout: data as PayoutRow, availableBalance: newBalance });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
