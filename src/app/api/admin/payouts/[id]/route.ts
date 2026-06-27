import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * POST /api/admin/payouts/:id  { action: "paid" | "rejected", txHash?, note? }
 *
 * Operator processing of a by-request payout: after withdrawing Stars→TON on
 * Fragment and sending the agency its USDT-TON, mark it paid and paste the tx
 * hash; or reject (releases the held amount back into the agency's available
 * balance, since rejected payouts are not counted as committed).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    action?: string;
    txHash?: string;
    note?: string;
  } | null;
  const action = body?.action;
  if (action !== "paid" && action !== "rejected") {
    return Response.json({ error: "action must be 'paid' or 'rejected'" }, { status: 400 });
  }

  const update: Record<string, unknown> = { status: action };
  if (action === "paid") update.paid_at = new Date().toISOString();
  const txHash = (body?.txHash ?? "").trim();
  if (txHash) update.tx_hash = txHash;
  const note = (body?.note ?? "").trim();
  if (note) update.note = note;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("payouts")
    .update(update)
    .eq("id", id)
    .select("id, amount, status, created_at, paid_at, address, tx_hash")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ payout: data });
}
