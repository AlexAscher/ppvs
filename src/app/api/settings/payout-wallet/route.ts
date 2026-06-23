import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * POST /api/settings/payout-wallet { address }
 *
 * Saves the agency's payout wallet (USDC on Polygon) to
 * user_metadata.payout_address. This is the address card2crypto forwards the
 * agency's 90% to (and the default for Malum withdrawals). Only the agency can
 * set its own wallet.
 *
 * Validation: must be an EVM 0x address (40 hex). We reject the USDC token
 * CONTRACT address — a common mistake that would burn funds — same guard the
 * official card2crypto WooCommerce plugin uses.
 */

// Polygon USDC token contract — NOT a wallet. Rejecting it avoids a costly
// paste mistake.
const USDC_POLYGON_CONTRACT = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359";
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export async function POST(req: NextRequest) {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const role = (user.user_metadata?.role as "agency" | "chatter") ?? "chatter";
  if (role !== "agency") {
    return Response.json({ error: "Only the agency can set its payout wallet" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { address?: string } | null;
  const address = (body?.address ?? "").trim();
  if (!EVM_ADDRESS_RE.test(address)) {
    return Response.json(
      { error: "Enter a valid USDC (Polygon) wallet address — it should start with 0x." },
      { status: 400 },
    );
  }
  if (address.toLowerCase() === USDC_POLYGON_CONTRACT) {
    return Response.json(
      { error: "That's the USDC token contract, not your wallet. Paste your own wallet address." },
      { status: 400 },
    );
  }

  const admin = createAdminSupabaseClient();
  try {
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...(user.user_metadata ?? {}), payout_address: address },
    });
  } catch (e) {
    console.error("[settings/payout-wallet] updateUserById failed:", e);
    return Response.json({ error: "Could not save wallet" }, { status: 500 });
  }

  return Response.json({ ok: true, address });
}
