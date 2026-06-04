import { createHash } from "node:crypto";

/**
 * Malum payment-gateway client.
 *
 * Reference: https://malum.co/docs/
 *
 * Auth: single `MALUM: {mid}:{private_key}` header. The private key is read
 * from env (`MALUM_SECRET_KEY`); never expose it client-side. Sandbox keys
 * are prefixed `sec_sandbox_` / `whs_sandbox_` and route to the test
 * environment — payouts/statistics are excluded, but webhooks still fire,
 * which is exactly what we need to validate the integration end-to-end.
 *
 * Endpoints used by ppvs.io today:
 *   POST /api/v2/payment/create   — open a hosted checkout for a PPV unlock
 *
 * Webhook verification: every event payload carries `signature` = MD5 of
 * `txn|timestamp|webhook_key`. We compute the same hash on receipt and bail
 * out on mismatch (avoids a malicious actor flipping `ppv_sends.status` by
 * spoofing a webhook).
 */

const MALUM_BASE = "https://malum.co";

export type MalumCreatePaymentParams = {
  /** Amount in `currency`. Min $0.50, max $10,500 USD-equivalent. */
  amount: number;
  /** ISO-4217 3-letter code (USD, EUR, …). */
  currency: string;
  /** Deliverable buyer email — required by Malum. */
  customer_email: string;
  /** Absolute webhook URL on our domain. */
  webhook_url: string;
  /** Where the buyer lands after a successful checkout. */
  success_url: string;
  /** Where the buyer lands if they hit cancel. */
  cancel_url: string;
  /** Surface gateway fees on the buyer-facing checkout. Mutually exclusive
   *  with `merchant_pays_gw_fees`. */
  buyer_pays_fees?: boolean;
  /** Merchant absorbs the gateway fee — buyer sees one clean price. We
   *  use this so the platform's 10% surcharge already covers Malum's cut
   *  and the buyer doesn't get a confusing "Gateway fee" line item. */
  merchant_pays_gw_fees?: boolean;
  /** Free-text, max 254 chars. We stuff the PPV `code` here so the webhook
   *  can look up the send without trusting the txn id alone. */
  metadata?: string;
  product_title?: string;
  product_description?: string;
  product_image?: string;
  product_link?: string;
};

export type MalumCreatePaymentResponse = {
  status: "success" | string;
  transaction_id: string;
  /** Hosted checkout URL — redirect the buyer here. */
  link: string;
  bpf?: boolean;
  mgf?: boolean;
  timestamp?: number;
  error?: string;
};

/**
 * Webhook payload shape per the docs. All numeric-looking fields ship as
 * JSON numbers; we keep them loose here so we can defensively coerce.
 */
export type MalumWebhookEvent = {
  status: "CREATED" | "PROCESSING" | "COMPLETED" | "EXPIRED" | "CANCELLED" | string;
  txn: string;
  requested_amount?: number | string;
  requested_currency?: string;
  cid?: string;
  checkout?: number | string;
  metadata?: string;
  buyer_pays_fees?: number | boolean;
  sandbox?: boolean;
  timestamp: number | string;
  signature: string;
};

function authHeader(): string {
  const mid = process.env.MALUM_MID;
  const key = process.env.MALUM_SECRET_KEY;
  if (!mid || !key) {
    throw new Error("Malum is not configured (MALUM_MID / MALUM_SECRET_KEY missing)");
  }
  return `${mid}:${key}`;
}

/**
 * POST /api/v2/payment/create. Throws on non-success — the caller decides
 * how to surface the error to the buyer (we return 502 on the route).
 */
export async function createMalumPayment(
  params: MalumCreatePaymentParams,
): Promise<MalumCreatePaymentResponse> {
  const res = await fetch(`${MALUM_BASE}/api/v2/payment/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      MALUM: authHeader(),
    },
    body: JSON.stringify(params),
    cache: "no-store",
  });

  let data: MalumCreatePaymentResponse;
  try {
    data = (await res.json()) as MalumCreatePaymentResponse;
  } catch {
    throw new Error(`Malum: non-JSON response (HTTP ${res.status})`);
  }
  if (!res.ok || data.status !== "success" || !data.link) {
    throw new Error(data.error || `Malum: HTTP ${res.status}`);
  }
  return data;
}

/**
 * MD5(txn|timestamp|webhook_key). Returns true if the payload is genuinely
 * from Malum. We compare lowercase hex on both sides.
 */
export function verifyMalumWebhookSignature(event: MalumWebhookEvent): boolean {
  const key = process.env.MALUM_WEBHOOK_KEY;
  if (!key) return false;
  if (!event?.txn || event?.timestamp === undefined || !event?.signature) return false;
  const expected = createHash("md5")
    .update(`${event.txn}|${event.timestamp}|${key}`)
    .digest("hex")
    .toLowerCase();
  return expected === String(event.signature).toLowerCase();
}
