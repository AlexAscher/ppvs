import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * POST /api/admin/seed-sale  { agencyId, amount, daysAgo? }
 *
 * Inserts a synthetic paid ppv_sends row for the agency's first model so the
 * payout flow can be exercised end-to-end without a real Stars payment.
 *
 *   daysAgo unset OR < 30  → counts toward `pending` (still in clearing hold).
 *   daysAgo ≥ 30           → counts toward `available` (already cleared).
 *
 * Test rows are tagged with malum_txn='SEED' so they're easy to find + clean.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const body = (await req.json().catch(() => null)) as {
    agencyId?: string;
    amount?: number;
    daysAgo?: number;
  } | null;
  const agencyId = (body?.agencyId ?? "").trim();
  const amount = Number(body?.amount ?? 0);
  const daysAgo = Math.max(0, Math.floor(Number(body?.daysAgo ?? 0)));
  if (!agencyId) return Response.json({ error: "agencyId required" }, { status: 400 });
  if (!(amount > 0)) return Response.json({ error: "amount must be > 0" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data: model, error: mErr } = await admin
    .from("models")
    .select("id")
    .eq("agency_user_id", agencyId)
    .limit(1)
    .maybeSingle();
  if (mErr) return Response.json({ error: mErr.message }, { status: 500 });
  if (!model) return Response.json({ error: "agency has no model" }, { status: 400 });

  const paidAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const code = `seed_${Math.random().toString(36).slice(2, 10)}`;
  const { data, error } = await admin
    .from("ppv_sends")
    .insert({
      model_id: model.id,
      peer_id: "0",
      code,
      total_price: amount,
      status: "paid",
      paid_at: paidAt,
      created_at: paidAt,
      malum_txn: "SEED",
    })
    .select("id, total_price, paid_at, status")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ sale: data });
}
