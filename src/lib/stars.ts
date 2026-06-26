/**
 * Telegram Stars (XTR) payment helpers — the only pay-in path after the
 * card2crypto/Malum removal.
 *
 * Flow: /api/payments/stars/create builds an invoice LINK via the Bot API
 * (`createInvoiceLink`, currency XTR). The Mini App opens it with
 * `Telegram.WebApp.openInvoice(link)`. On payment Telegram sends the bot a
 * `successful_payment` update → /api/webhooks/telegram fulfils + delivers.
 *
 * The chatter prices in USD; we convert to an integer Star count. Telegram has
 * no fixed USD peg for invoices, but the withdrawal value is ~$0.013/Star
 * (1000 Stars ≈ $13 via Fragment). STARS_PER_USD (env) lets us tune this from
 * real withdrawal data without a redeploy.
 */

const API = "https://api.telegram.org";

function botToken(): string {
  const t = process.env.TELEGRAM_PAY_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_PAY_BOT_TOKEN not configured");
  return t;
}

/** Integer Stars for a USD price. Default 77 Stars/USD (~$0.013/Star). */
export function usdToStars(usd: number): number {
  const rate = Number(process.env.STARS_PER_USD);
  const perUsd = Number.isFinite(rate) && rate > 0 ? rate : 77;
  return Math.max(1, Math.round(usd * perUsd));
}

async function botCall<T = unknown>(method: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!data?.ok) throw new Error(`Telegram ${method}: ${data?.description ?? `HTTP ${res.status}`}`);
  return data.result as T;
}

/**
 * Create a Stars invoice link. `payload` is our pay code — it comes back
 * verbatim in `successful_payment.invoice_payload` so the webhook resolves the
 * order without trusting anything client-side.
 */
export async function createStarsInvoiceLink(params: {
  title: string;
  description: string;
  payload: string;
  stars: number;
}): Promise<string> {
  return botCall<string>("createInvoiceLink", {
    title: params.title.slice(0, 32),
    description: params.description.slice(0, 255),
    payload: params.payload,
    currency: "XTR",
    prices: [{ label: params.title.slice(0, 32), amount: params.stars }],
  });
}

/** Approve (or reject) a pre_checkout_query — must answer within ~10s. */
export async function answerPreCheckout(id: string, ok: boolean, errorMessage?: string): Promise<void> {
  await botCall("answerPreCheckoutQuery", {
    pre_checkout_query_id: id,
    ok,
    ...(ok ? {} : { error_message: errorMessage ?? "Payment could not be processed." }),
  });
}

/** Constant-time-ish check of the webhook secret Telegram echoes back. */
export function verifyWebhookSecret(headerValue: string | null): boolean {
  const expected = process.env.TELEGRAM_PAY_BOT_SECRET;
  if (!expected) return false;
  return !!headerValue && headerValue === expected;
}
