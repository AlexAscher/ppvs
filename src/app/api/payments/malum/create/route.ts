import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { createMalumPayment } from "@/lib/malum";
import { consume, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { PLATFORM_FEE_PCT } from "@/lib/platform";

export const maxDuration = 30;

/**
 * Public endpoint hit by /pay/{code} when the fan clicks "Pay".
 *
 *   1. Validate the code + email shape (no auth — the only proof of
 *      authorization is possession of the random pay code).
 *   2. Look up the send. If it's already paid/delivered, short-circuit:
 *      send back the existing checkout link (or a 409 if there isn't one),
 *      because re-charging the buyer would be a bug.
 *   3. Ask Malum to open a hosted checkout. Store the returned txn id +
 *      buyer email on the send row so the webhook can correlate later.
 *
 * Returns `{ url }` — the client redirects the browser to it.
 */

type Body = { code?: string; email?: string };

type SendRow = {
  id: string;
  code: string;
  total_price: number | string;
  status: string;
  caption: string | null;
  malum_txn: string | null;
  expires_at: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    // Same shape as /api/ppv/deliver — cheap defense against someone
    // hammering Malum's API on our dime by spinning up checkouts.
    if (!consume(`malum-create|${ip}`, 20, 60_000)) return tooManyRequests(60);

    const body = (await req.json().catch(() => null)) as Body | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!code || code.length < 6 || code.length > 16 || !/^[a-z0-9]+$/.test(code)) {
      return Response.json({ error: "Invalid code" }, { status: 400 });
    }
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return Response.json({ error: "Enter a valid email" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { data: sendRaw, error: sendErr } = await admin
      .from("ppv_sends")
      .select("id, code, total_price, status, caption, malum_txn, expires_at")
      .eq("code", code)
      .maybeSingle();
    if (sendErr) return Response.json({ error: `DB: ${sendErr.message}` }, { status: 500 });
    if (!sendRaw) return Response.json({ error: "Not found" }, { status: 404 });
    const send = sendRaw as SendRow;

    if (send.status === "paid" || send.status === "delivered") {
      return Response.json({ error: "This order is already paid" }, { status: 409 });
    }

    // Urgency timer: refuse to open a checkout for an expired offer.
    if (send.expires_at && Date.now() > new Date(send.expires_at).getTime()) {
      return Response.json({ error: "This offer has expired." }, { status: 410 });
    }

    // The chatter's price is what the agency expects to receive ($5 = $5
    // gross to the agency). We charge the buyer an extra `PLATFORM_FEE_PCT`
    // on top that covers (a) the platform's commission and (b) the
    // gateway's processing fee — see `merchant_pays_gw_fees` below. Rounded
    // to whole cents so Malum's checkout doesn't show a fractional total.
    const basePrice = Number(send.total_price ?? 0);
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return Response.json({ error: "Invalid order amount" }, { status: 400 });
    }
    const amount = Math.round(basePrice * (1 + PLATFORM_FEE_PCT) * 100) / 100;
    if (amount < 0.5) {
      return Response.json(
        { error: "Order amount is below the gateway minimum ($0.50)" },
        { status: 400 },
      );
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    if (!baseUrl) {
      return Response.json(
        { error: "Server misconfigured: NEXT_PUBLIC_APP_URL missing" },
        { status: 500 },
      );
    }

    let payment;
    try {
      payment = await createMalumPayment({
        amount,
        currency: "USD",
        customer_email: email,
        webhook_url: `${baseUrl}/api/webhooks/malum`,
        success_url: `${baseUrl}/pay/${encodeURIComponent(code)}/success`,
        cancel_url: `${baseUrl}/pay/${encodeURIComponent(code)}`,
        // Buyer sees a single clean total (our base + 10% service fee).
        // Malum's processing cut comes out of that 10%, so we never expose
        // a "Gateway fee" line item on the checkout.
        merchant_pays_gw_fees: true,
        // Stash the pay code in metadata — that's the authoritative key we
        // use to resolve the send from the webhook, since two sandbox txns
        // could collide in development.
        metadata: code.slice(0, 254),
        product_title: `PPV unlock · ${code}`,
        product_description: send.caption ?? undefined,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Malum request failed";
      console.error("[malum/create] gateway error:", msg);
      return Response.json({ error: msg }, { status: 502 });
    }

    // Persist the txn id + buyer email so the webhook can correlate and the
    // dashboard can show who bought what. We don't change `status` yet —
    // Malum will tell us when the buyer actually pays.
    const { error: updErr } = await admin
      .from("ppv_sends")
      .update({
        malum_txn: payment.transaction_id,
        customer_email: email,
      })
      .eq("id", send.id);
    if (updErr) {
      // Non-fatal — the buyer can still complete payment, the webhook will
      // resolve via metadata. Just log it.
      console.error("[malum/create] failed to persist txn id:", updErr.message);
    }

    return Response.json({ url: payment.link, txn: payment.transaction_id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    console.error("[malum/create] error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
