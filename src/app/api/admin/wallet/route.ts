import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getPoolBalances, poolKeyMatchesAddress, sendUsdc } from "@/lib/payout-chain";

export const maxDuration = 60;

/**
 * Admin Wallet (platform pool).
 *   GET  → pool address, on-chain USDC (sweepable) + POL (gas) balances,
 *          low-gas flag, whether the pool key is configured & matches, and the
 *          admin's own payout (cold) wallet.
 *   POST { action: "set", address }   → save the admin's payout wallet.
 *   POST { action: "sweep", amount }  → send `amount` USDC from the pool to the
 *          admin's payout wallet.
 *
 * Pool USDC = the platform's accumulated 10% (card2crypto already auto-sent the
 * agencies' 90%). Malum earnings live in Malum's own balance, not here.
 */

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const USDC_CONTRACT = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359";
const LOW_GAS_POL = 0.5;

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

async function adminWalletOf(admin: AdminClient, userId: string): Promise<string> {
  const { data } = await admin.auth.admin.getUserById(userId);
  return (data?.user?.user_metadata?.payout_address as string) ?? "";
}

export async function GET() {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const admin = createAdminSupabaseClient();
  const adminWallet = await adminWalletOf(admin, auth.user.id);
  const poolAddress = process.env.CARD2CRYPTO_POOL_ADDRESS ?? null;
  const keyConfigured = !!process.env.POOL_WALLET_PRIVATE_KEY;

  let poolUsdc: number | null = null;
  let poolPol: number | null = null;
  let rpcError: string | null = null;
  try {
    const b = await getPoolBalances();
    poolUsdc = b.usdc;
    poolPol = b.pol;
  } catch (e) {
    rpcError = e instanceof Error ? e.message : "RPC error";
  }

  return Response.json({
    poolAddress,
    adminWallet,
    keyConfigured,
    keyMatches: keyConfigured && poolKeyMatchesAddress(),
    poolUsdc,
    poolPol,
    lowGas: poolPol != null ? poolPol < LOW_GAS_POL : false,
    rpcError,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;
  const admin = createAdminSupabaseClient();
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    address?: string;
    amount?: number;
  };

  if (body.action === "set") {
    const address = (body.address ?? "").trim();
    if (!EVM_RE.test(address)) {
      return Response.json({ error: "Enter a valid 0x wallet address" }, { status: 400 });
    }
    if (address.toLowerCase() === USDC_CONTRACT) {
      return Response.json({ error: "That's the USDC contract, not a wallet" }, { status: 400 });
    }
    const { data: u } = await admin.auth.admin.getUserById(auth.user.id);
    await admin.auth.admin.updateUserById(auth.user.id, {
      user_metadata: { ...(u?.user?.user_metadata ?? {}), payout_address: address },
    });
    return Response.json({ ok: true, adminWallet: address });
  }

  if (body.action === "sweep") {
    const adminWallet = await adminWalletOf(admin, auth.user.id);
    if (!EVM_RE.test(adminWallet)) {
      return Response.json({ error: "Set your payout wallet first" }, { status: 400 });
    }
    if (!poolKeyMatchesAddress()) {
      return Response.json(
        { error: "Pool private key is not set or doesn't match the pool address" },
        { status: 400 },
      );
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: "Enter a valid amount" }, { status: 400 });
    }
    try {
      const tx = await sendUsdc(adminWallet, amount);
      return Response.json({ ok: true, tx });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Sweep failed" },
        { status: 502 },
      );
    }
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
