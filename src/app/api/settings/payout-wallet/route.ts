import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * POST /api/settings/payout-wallet { address }
 *
 * Saves the agency's payout wallet (USDT on TON) to
 * user_metadata.payout_address. After the Stars migration this is where the
 * server auto-sends the agency's 85% share. Only the agency can set its own
 * wallet.
 *
 * Validation: must be a TON address in user-friendly base64url form — starts
 * with `EQ` (bounceable, default for wallets) or `UQ` (non-bounceable),
 * 48 characters total. We accept either; the TON SDK normalises both.
 */

// TON address in user-friendly base64url form. EQ/UQ + 46 base64url chars.
const TON_ADDRESS_RE = /^[EU]Q[A-Za-z0-9_-]{46}$/;

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
  if (!TON_ADDRESS_RE.test(address)) {
    return Response.json(
      { error: "Enter a valid TON wallet address — it should start with EQ or UQ (48 characters)." },
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
