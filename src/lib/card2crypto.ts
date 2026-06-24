import { createHmac } from "node:crypto";

/**
 * card2crypto.org payment-gateway client.
 *
 * card2crypto is a CryptAPI-style card→crypto forwarder (no API key). Flow:
 *   1. (optional) convert.php — convert a non-USD amount to USD.
 *   2. wallet.php?address={POOL}&callback={cb} — mint a one-time forwarding
 *      address (`address_in`) that pays out to our pool wallet, and registers
 *      our callback. Returns address_in / polygon_address_in / ipn_token.
 *   3. Redirect the buyer to pay.card2crypto.org/pay.php?address={address_in}…
 *      — the on-ramp converts their card payment to USDC and sends it to
 *      address_in, which forwards to the pool wallet.
 *   4. card2crypto GETs our callback (the URL from step 2) with extra params
 *      txid_out / value_coin / coin when the payment lands.
 *
 * There is NO HMAC signature on the callback. We embed a per-order `nonce`
 * (HMAC of the pay code) in the callback URL and re-derive+compare it on
 * receipt so a stranger can't spoof "paid" by guessing the code.
 *
 * IMPORTANT: card2crypto forwards 100% to ONE wallet — it can't split. The
 * 90/10 agency/platform split is done by us afterwards (see lib/payout-chain).
 */

const API_BASE = "https://api.card2crypto.org/control";
// Default hosted checkout host (the plugin's default custom domain).
const PAY_BASE = "https://pay.card2crypto.org";

export function poolAddress(): string {
  const a = process.env.CARD2CRYPTO_POOL_ADDRESS;
  if (!a) throw new Error("CARD2CRYPTO_POOL_ADDRESS not configured");
  return a;
}

/** HMAC(code) — embedded in the callback URL and verified on receipt. */
export function card2cryptoNonce(code: string): string {
  const secret = process.env.CARD2CRYPTO_CALLBACK_SECRET;
  if (!secret) throw new Error("CARD2CRYPTO_CALLBACK_SECRET not configured");
  return createHmac("sha256", secret).update(code).digest("hex");
}

export function verifyCard2cryptoNonce(code: string, nonce: string): boolean {
  if (!code || !nonce) return false;
  const expected = card2cryptoNonce(code);
  // Constant-time-ish compare (lengths equal: both 64-hex).
  return expected.length === nonce.length && expected === nonce.toLowerCase();
}

/**
 * Convert `value` in `currency` to USD via card2crypto. Returns the USD value
 * (Number). USD passes through unchanged (no network call).
 */
export async function convertToUsd(value: number, currency: string): Promise<number> {
  if (currency.toUpperCase() === "USD") return value;
  const url = `${API_BASE}/convert.php?value=${encodeURIComponent(value)}&from=${encodeURIComponent(currency.toLowerCase())}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json().catch(() => null)) as
    | { status?: string; value_coin?: string | number }
    | null;
  const v = data?.value_coin != null ? Number(data.value_coin) : NaN;
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error("card2crypto: currency conversion failed");
  }
  return v;
}

export type ForwardingAddress = {
  /** Token to pass to pay.php as ?address= (already URL-encoded by the API). */
  addressIn: string;
  /** The on-chain Polygon deposit address (informational). */
  polygonAddressIn: string | null;
  ipnToken: string | null;
};

/**
 * Mint a one-time forwarding address that pays out to the pool wallet and
 * registers `callbackUrl`. `callbackUrl` must already contain our ?code & nonce.
 */
export async function createForwardingAddress(
  callbackUrl: string,
): Promise<ForwardingAddress> {
  const url = `${API_BASE}/wallet.php?address=${encodeURIComponent(poolAddress())}&callback=${encodeURIComponent(callbackUrl)}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json().catch(() => null)) as
    | { address_in?: string; polygon_address_in?: string; ipn_token?: string }
    | null;
  if (!data?.address_in) {
    throw new Error("card2crypto: could not create payment address");
  }
  return {
    addressIn: data.address_in,
    polygonAddressIn: data.polygon_address_in ?? null,
    ipnToken: data.ipn_token ?? null,
  };
}

/**
 * Hosted checkout URL to redirect the buyer to. We build the string by hand
 * (not URLSearchParams) because `addressIn` is already URL-encoded by the API
 * and must be preserved verbatim.
 */
export function buildPayUrl(params: {
  addressIn: string;
  amountUsd: number;
  email: string;
}): string {
  return (
    `${PAY_BASE}/pay.php?address=${params.addressIn}` +
    `&amount=${encodeURIComponent(params.amountUsd)}` +
    `&email=${encodeURIComponent(params.email)}` +
    `&currency=USD`
  );
}

/**
 * Callback query shape card2crypto appends to our callback URL.
 * `coin` examples: usdc / usdt / polygon_pol / eth / bep20_bnb.
 * `value_coin` is the amount received (for stablecoins it's ~USD).
 */
export type Card2cryptoCallback = {
  code: string;
  nonce: string;
  txid_out?: string;
  value_coin?: string;
  coin?: string;
};
