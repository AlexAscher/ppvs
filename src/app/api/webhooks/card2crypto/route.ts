import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { verifyCard2cryptoNonce } from "@/lib/card2crypto";
import { fulfillPpvPaid, fulfillTipPaid } from "@/lib/fulfillment";
import { sendUsdc, poolKeyMatchesAddress } from "@/lib/payout-chain";

export const maxDuration = 300;

/**
 * card2crypto callback (GET). card2crypto appends txid_out / value_coin / coin
 * to the callback URL we registered (which already carries ?code & nonce).
 *
 *   1. Verify the nonce (HMAC of the code) — our only auth (no HMAC from c2c).
 *   2. Tolerance check + mark paid + deliver (shared lib/fulfillment).
 *   3. Auto-send 90% of the received USDC to the agency wallet (idempotent via
 *      agency_auto_payouts UNIQUE(kind, code)); keep 10% in the pool.
 *
 * Returns "*" on success (CryptAPI-style ack so c2c stops retrying).
 */

// Accept if at least 90% of the expected USD landed (covers gateway slippage;
// blocks a buyer who tampered the amount down at checkout).
const TOLERANCE = 0.9;
const AGENCY_PCT = 0.9;

async function autoForward(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  kind: "ppv" | "tip",
  code: string,
  modelId: string,
  receivedUsd: number,
  coin: string,
) {
  // Idempotency: claim the (kind, code) row first. If it already exists, a
  // previous callback handled the payout — stop here.
  const { error: insErr } = await admin
    .from("agency_auto_payouts")
    .insert({ kind, code, model_id: modelId, status: "pending" });
  if (insErr) {
    // 23505 = unique_violation = already claimed → no-op.
    if ((insErr as { code?: string }).code === "23505") return;
    console.error("[card2crypto/webhook] payout claim failed:", insErr.message);
    return;
  }

  const finish = (status: string, fields: Record<string, unknown>) =>
    admin.from("agency_auto_payouts").update({ status, ...fields }).eq("kind", kind).eq("code", code);

  // Resolve the agency's payout wallet.
  let agencyId: string | null = null;
  let wallet = "";
  try {
    const { data: m } = await admin.from("models").select("agency_user_id").eq("id", modelId).maybeSingle();
    agencyId = (m as { agency_user_id?: string } | null)?.agency_user_id ?? null;
    if (agencyId) {
      const { data: u } = await admin.auth.admin.getUserById(agencyId);
      wallet = (u?.user?.user_metadata?.payout_address as string) ?? "";
    }
  } catch { /* handled below */ }

  const amount = Math.round(receivedUsd * AGENCY_PCT * 1e6) / 1e6; // 90%, 6dp
  const isStable = coin === "" || coin.includes("usdc") || coin.includes("usdt");

  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet) || !agencyId) {
    await finish("manual", { agency_id: agencyId, amount_usdc: amount, note: "agency wallet missing" });
    return;
  }
  if (!isStable || !poolKeyMatchesAddress()) {
    await finish("manual", {
      agency_id: agencyId, to_address: wallet, amount_usdc: amount,
      note: !isStable ? `received ${coin}, not USDC — pay manually` : "pool key not configured",
    });
    return;
  }

  try {
    const tx = await sendUsdc(wallet, amount);
    await finish("sent", { agency_id: agencyId, to_address: wallet, amount_usdc: amount, tx_hash: tx });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "send failed";
    console.error("[card2crypto/webhook] auto-send failed:", msg);
    await finish("manual", { agency_id: agencyId, to_address: wallet, amount_usdc: amount, note: msg });
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  const nonce = (url.searchParams.get("nonce") ?? "").trim();
  const coin = (url.searchParams.get("coin") ?? "").toLowerCase();
  const received = Number(url.searchParams.get("value_coin") ?? "0");
  const txidOut = url.searchParams.get("txid_out") ?? null;

  if (!verifyCard2cryptoNonce(code, nonce)) {
    console.warn("[card2crypto/webhook] bad nonce for code=", code);
    return new Response("bad nonce", { status: 403 });
  }

  try {
    const admin = createAdminSupabaseClient();

    // PPV first.
    const { data: sendRaw } = await admin
      .from("ppv_sends")
      .select("id, code, model_id, peer_id, peer_access_hash, peer_username, caption, status, total_price, malum_txn")
      .eq("code", code)
      .maybeSingle();

    if (sendRaw) {
      const send = sendRaw as {
        id: string; code: string; model_id: string; peer_id: string; peer_access_hash: string | null;
        peer_username: string | null; caption: string | null; status: string;
        total_price: number | string; malum_txn: string | null;
      };
      const expected = Number(send.total_price ?? 0);
      if (received > 0 && expected > 0 && received < expected * TOLERANCE) {
        console.warn(`[card2crypto/webhook] underpaid ppv ${code}: got ${received} < ${expected}`);
        return new Response("*"); // ack, but don't deliver an underpaid order
      }
      await fulfillPpvPaid(admin, send, txidOut);
      await autoForward(admin, "ppv", code, send.model_id, received || expected, coin);
      return new Response("*");
    }

    // Tip.
    const { data: tipRaw } = await admin
      .from("tips")
      .select("id, model_id, peer_id, peer_username, amount, message, status, chatter_id")
      .eq("code", code)
      .maybeSingle();
    if (tipRaw) {
      const tip = tipRaw as {
        id: string; model_id: string; peer_id: string; peer_username: string | null;
        amount: number | string; message: string | null; status: string; chatter_id: string | null;
      };
      const expected = Number(tip.amount ?? 0);
      if (received > 0 && expected > 0 && received < expected * TOLERANCE) {
        console.warn(`[card2crypto/webhook] underpaid tip ${code}`);
        return new Response("*");
      }
      await fulfillTipPaid(admin, tip);
      await autoForward(admin, "tip", code, tip.model_id, received || expected, coin);
      return new Response("*");
    }

    console.warn("[card2crypto/webhook] no send/tip for code=", code);
    return new Response("*"); // ack so c2c stops retrying a code we don't have
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    console.error("[card2crypto/webhook] error:", msg);
    return new Response("error", { status: 500 }); // non-"*" → c2c retries
  }
}
