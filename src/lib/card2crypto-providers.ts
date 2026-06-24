/**
 * card2crypto provider catalogue — shared by the server (validate + gross-up
 * the charged amount) and the Mini App (render the picker + price breakdown).
 *
 * Pure data, NO node imports, so it's safe to import into the client bundle.
 *
 * `min`    — provider minimum order (USD). Known ones from the plugin; others
 *            are conservative estimates. card2crypto enforces the real minimum.
 * `feePct` — ESTIMATED buyer-side markup that covers the provider fee + the
 *            card2crypto cut. card2crypto doesn't publish exact per-provider
 *            fees, so these are estimates to be refined from real payments
 *            (the webhook records what actually landed vs what we charged).
 */

export type C2cProvider = { slug: string; label: string; min: number; feePct: number };

export const C2C_PROVIDERS: C2cProvider[] = [
  { slug: "stripe", label: "Card · Stripe (US)", min: 2, feePct: 0.08 },
  { slug: "rampnetwork", label: "Ramp", min: 4, feePct: 0.08 },
  { slug: "robinhood", label: "Robinhood (US)", min: 5, feePct: 0.07 },
  { slug: "paypal", label: "PayPal (US)", min: 5, feePct: 0.09 },
  { slug: "revolut", label: "Revolut", min: 8, feePct: 0.08 },
  { slug: "bitnovo", label: "Bitnovo · card", min: 10, feePct: 0.09 },
  { slug: "sardine", label: "Sardine", min: 10, feePct: 0.09 },
  { slug: "topper", label: "Topper", min: 10, feePct: 0.09 },
  { slug: "binance", label: "Binance Pay", min: 15, feePct: 0.08 },
  { slug: "transak", label: "Transak", min: 15, feePct: 0.09 },
  { slug: "transfi", label: "TransFi", min: 15, feePct: 0.09 },
  { slug: "utorg", label: "Utorg", min: 15, feePct: 0.09 },
  { slug: "moonpay", label: "MoonPay", min: 20, feePct: 0.10 },
  { slug: "banxa", label: "Banxa", min: 20, feePct: 0.10 },
  { slug: "simplex", label: "Simplex", min: 20, feePct: 0.12 },
];

const BY_SLUG = new Map(C2C_PROVIDERS.map((p) => [p.slug, p]));

export function isC2cProvider(slug: string): boolean {
  return BY_SLUG.has(slug);
}

/**
 * Gross up the content price by a provider's estimated fee so the pool still
 * receives ~the content price after the gateway takes its cut. Returns the
 * gateway fee and the total the buyer pays (both rounded to cents).
 */
export function grossWithFee(content: number, slug: string): { fee: number; total: number } {
  const pct = BY_SLUG.get(slug)?.feePct ?? 0.1;
  const fee = Math.round(content * pct * 100) / 100;
  const total = Math.round((content + fee) * 100) / 100;
  return { fee, total };
}
