// Platform economics. The platform keeps a commission on every paid sale;
// agencies keep the remainder. Configurable via the PLATFORM_FEE_PCT env var
// (a fraction, e.g. 0.10 for 10%). Defaults to 10%.
//
// This is currently a *reporting* number surfaced in the admin panel — it does
// NOT yet change what an agency can withdraw in its Wallet. If/when we want the
// agency's available balance to be net of commission, reuse `agencyNet()` there.

const RAW = Number(process.env.PLATFORM_FEE_PCT);
export const PLATFORM_FEE_PCT =
  Number.isFinite(RAW) && RAW >= 0 && RAW < 1 ? RAW : 0.12;

/** Platform's cut of a gross sales figure. */
export function platformFee(gross: number): number {
  return gross * PLATFORM_FEE_PCT;
}

/** What the agency keeps from a gross sales figure (gross − fee). */
export function agencyNet(gross: number): number {
  return gross * (1 - PLATFORM_FEE_PCT);
}
