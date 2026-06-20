import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { createMalumPayment } from "@/lib/malum";
import { consume, getClientIp, tooManyRequests } from "@/lib/rate-limit";

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

type Body = { code?: string; email?: string; source?: string };

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
    // The Mini App navigates its OWN webview to the checkout (stays inside
    // Telegram), so it needs Malum to return the buyer back into /mini rather
    // than the web /pay success page. The web flow leaves `source` unset.
    const fromMini = body?.source === "mini";

    if (!code || code.length < 6 || code.length > 16 || !/^[a-z0-9]+$/.test(code)) {
      return Response.json({ error: "Invalid code" }, { status: 400 });
    }
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return Response.json({ error: "Enter a valid email" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    if (!baseUrl) {
      return Response.json(
        { error: "Server misconfigured: NEXT_PUBLIC_APP_URL missing" },
        { status: 500 },
      );
    }

    // Resolve the code against PPV sends first, then tips. Both kinds flow
    // through one Malum checkout; the webhook resolves them the same way on
    // COMPLETED (metadata = code). PPV adds the platform surcharge; tips are
    // charged at face value (no service fee).
    const { data: sendRaw, error: sendErr } = await admin
      .from("ppv_sends")
      .select("id, total_price, status, caption, expires_at")
      .eq("code", code)
      .maybeSingle();
    if (sendErr) return Response.json({ error: `DB: ${sendErr.message}` }, { status: 500 });

    let amount: number;
    let productTitle: string;
    let productDescription: string | undefined;
    // Only PPV sends persist the txn/email back (tips resolve via metadata).
    let persist: (txn: string) => Promise<void> = async () => {};

    if (sendRaw) {
      const send = sendRaw as {
        id: string;
        total_price: number | string;
        status: string;
        caption: string | null;
        expires_at: string | null;
      };
      if (send.status === "paid" || send.status === "delivered") {
        return Response.json({ error: "This order is already paid" }, { status: 409 });
      }
      if (send.expires_at && Date.now() > new Date(send.expires_at).getTime()) {
        return Response.json({ error: "This offer has expired." }, { status: 410 });
      }
      const basePrice = Number(send.total_price ?? 0);
      if (!Number.isFinite(basePrice) || basePrice <= 0) {
        return Response.json({ error: "Invalid order amount" }, { status: 400 });
      }
      // Buyer is charged the chatter's base price; Malum adds its gateway fee
      // on top at checkout (buyer_pays_fees). The platform's 12% margin comes
      // from the agency deduct (agencyNet on the base), so there is NO buyer-
      // facing surcharge here anymore — that would double-charge the gateway.
      amount = Math.round(basePrice * 100) / 100;
      productTitle = `PPV unlock · ${code}`;
      productDescription = send.caption ?? undefined;
      persist = async (txn: string) => {
        await admin
          .from("ppv_sends")
          .update({ malum_txn: txn, customer_email: email })
          .eq("id", send.id);
      };
    } else {
      const { data: tipRaw, error: tipErr } = await admin
        .from("tips")
        .select("id, amount, status")
        .eq("code", code)
        .maybeSingle();
      if (tipErr) return Response.json({ error: `DB: ${tipErr.message}` }, { status: 500 });
      if (!tipRaw) return Response.json({ error: "Not found" }, { status: 404 });
      const tip = tipRaw as { id: string; amount: number | string; status: string };
      if (tip.status === "paid") {
        return Response.json({ error: "This tip is already paid" }, { status: 409 });
      }
      // Tips carry no platform surcharge — the fan pays exactly the tip amount.
      amount = Math.round(Number(tip.amount ?? 0) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0) {
        return Response.json({ error: "Invalid tip amount" }, { status: 400 });
      }
      productTitle = `Tip · ${code}`;
    }

    if (amount < 0.5) {
      return Response.json(
        { error: "Amount is below the gateway minimum ($0.50)" },
        { status: 400 },
      );
    }

    let payment;
    try {
      payment = await createMalumPayment({
        amount,
        currency: "USD",
        customer_email: email,
        webhook_url: `${baseUrl}/api/webhooks/malum`,
        // Mini App returns into /mini (with ?paid=1 so the app polls for the
        // webhook to flip the order to delivered); web flow uses /pay success.
        success_url: fromMini
          ? `${baseUrl}/mini?code=${encodeURIComponent(code)}&paid=1`
          : `${baseUrl}/pay/${encodeURIComponent(code)}/success`,
        cancel_url: fromMini
          ? `${baseUrl}/mini?code=${encodeURIComponent(code)}`
          : `${baseUrl}/pay/${encodeURIComponent(code)}`,
        // Buyer covers the gateway fee on top of the base price (shown as a
        // separate line on the Malum checkout). Mutually exclusive with
        // merchant_pays_gw_fees.
        buyer_pays_fees: true,
        // The pay code is the authoritative key the webhook resolves on.
        metadata: code.slice(0, 254),
        product_title: productTitle,
        product_description: productDescription,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Malum request failed";
      console.error("[malum/create] gateway error:", msg);
      return Response.json({ error: msg }, { status: 502 });
    }

    try {
      await persist(payment.transaction_id);
    } catch (e: unknown) {
      // Non-fatal — the webhook still resolves via metadata (code).
      console.error("[malum/create] persist txn failed:", e instanceof Error ? e.message : e);
    }

    return Response.json({ url: payment.link, txn: payment.transaction_id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    console.error("[malum/create] error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
