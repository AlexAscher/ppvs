import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET /api/admin/payouts?status=pending|all
 *
 * Cross-agency feed of payout requests for the admin Payouts tab. Joins each
 * payout with its agency's display name + saved TON address (user_metadata).
 * Default status=pending so the queue surfaces what the admin actually needs
 * to process.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const status = new URL(req.url).searchParams.get("status") ?? "pending";

  const admin = createAdminSupabaseClient();
  let q = admin
    .from("payouts")
    .select("id, agency_user_id, amount, address, currency, network, status, created_at, paid_at, tx_hash")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status !== "all") q = q.eq("status", status);
  const { data: rows, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Resolve agency name + saved TON wallet address (the one they set in
  // Dashboard → Wallet; we surface it as a sanity-check next to the address
  // the request itself was filed with — they should match).
  const agencyIds = Array.from(new Set((rows ?? []).map((r) => r.agency_user_id as string)));
  const agencyMeta = new Map<string, { name: string; savedAddress: string | null }>();
  await Promise.all(
    agencyIds.map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id);
        const u = data?.user;
        const name =
          (u?.user_metadata?.full_name as string) ||
          (u?.user_metadata?.display_name as string) ||
          u?.email?.split("@")[0] ||
          "Agency";
        const savedAddress = (u?.user_metadata?.payout_address as string) ?? null;
        agencyMeta.set(id, { name, savedAddress });
      } catch {
        agencyMeta.set(id, { name: "Agency", savedAddress: null });
      }
    }),
  );

  const payouts = (rows ?? []).map((r) => {
    const m = agencyMeta.get(r.agency_user_id as string) ?? { name: "Agency", savedAddress: null };
    return {
      id: r.id as string,
      agencyId: r.agency_user_id as string,
      agencyName: m.name,
      savedAddress: m.savedAddress,
      amount: Number(r.amount ?? 0),
      address: (r.address as string) ?? null,
      currency: (r.currency as string) ?? null,
      network: (r.network as string) ?? null,
      status: r.status as string,
      createdAt: r.created_at as string,
      paidAt: (r.paid_at as string) ?? null,
      txHash: (r.tx_hash as string) ?? null,
    };
  });
  return Response.json({ payouts });
}
