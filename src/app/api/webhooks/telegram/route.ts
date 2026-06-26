import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { answerPreCheckout, verifyWebhookSecret } from "@/lib/stars";
import { fulfillPpvPaid, fulfillTipPaid } from "@/lib/fulfillment";

export const maxDuration = 300;

/**
 * Telegram pay-bot webhook (Stars). Set via setWebhook with a secret token;
 * Telegram echoes it in `X-Telegram-Bot-Api-Secret-Token`, which we verify.
 *
 *   pre_checkout_query   → approve if the order exists and isn't paid yet.
 *   message.successful_payment → resolve the order by invoice_payload (our pay
 *     code) and fulfil it (mark paid + deliver the content from the model's
 *     account). Idempotent via the row's status check.
 *
 * Always 200 so Telegram doesn't retry-storm; real failures are logged.
 */

type PreCheckoutQuery = { id: string; invoice_payload?: string };
type SuccessfulPayment = {
  currency?: string;
  total_amount?: number;
  invoice_payload?: string;
  telegram_payment_charge_id?: string;
};
type Update = {
  pre_checkout_query?: PreCheckoutQuery;
  message?: { successful_payment?: SuccessfulPayment };
};

const CODE_RE = /^[a-z0-9]{6,16}$/i;

export async function POST(req: NextRequest) {
  if (!verifyWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("forbidden", { status: 403 });
  }

  let update: Update;
  try {
    update = (await req.json()) as Update;
  } catch {
    return Response.json({ ok: true });
  }

  const admin = createAdminSupabaseClient();

  // ── pre_checkout_query: approve quickly (≤10s) ────────────────────────────
  if (update.pre_checkout_query) {
    const pcq = update.pre_checkout_query;
    const code = (pcq.invoice_payload ?? "").trim();
    try {
      let okToPay = CODE_RE.test(code);
      if (okToPay) {
        const { data: s } = await admin.from("ppv_sends").select("status").eq("code", code).maybeSingle();
        if (s) {
          okToPay = s.status !== "paid" && s.status !== "delivered";
        } else {
          const { data: t } = await admin.from("tips").select("status").eq("code", code).maybeSingle();
          okToPay = !!t && t.status !== "paid";
        }
      }
      await answerPreCheckout(pcq.id, okToPay, okToPay ? undefined : "This order is no longer available.");
    } catch (e) {
      console.error("[webhooks/telegram] pre_checkout failed:", e instanceof Error ? e.message : e);
      try { await answerPreCheckout(pcq.id, false, "Temporary error, please try again."); } catch {}
    }
    return Response.json({ ok: true });
  }

  // ── successful_payment: fulfil ────────────────────────────────────────────
  const sp = update.message?.successful_payment;
  if (sp && sp.currency === "XTR") {
    const code = (sp.invoice_payload ?? "").trim();
    const charge = sp.telegram_payment_charge_id ?? null;
    if (!CODE_RE.test(code)) return Response.json({ ok: true });
    try {
      const { data: sendRaw } = await admin
        .from("ppv_sends")
        .select("id, code, model_id, peer_id, peer_access_hash, peer_username, caption, status, total_price, malum_txn")
        .eq("code", code)
        .maybeSingle();
      if (sendRaw) {
        await fulfillPpvPaid(admin, sendRaw as Parameters<typeof fulfillPpvPaid>[1], charge);
        return Response.json({ ok: true });
      }
      const { data: tipRaw } = await admin
        .from("tips")
        .select("id, model_id, peer_id, peer_username, amount, message, status, chatter_id")
        .eq("code", code)
        .maybeSingle();
      if (tipRaw) {
        await fulfillTipPaid(admin, tipRaw as Parameters<typeof fulfillTipPaid>[1]);
        return Response.json({ ok: true });
      }
      console.warn("[webhooks/telegram] no order for code=", code);
    } catch (e) {
      console.error("[webhooks/telegram] fulfil failed:", e instanceof Error ? e.message : e);
    }
    return Response.json({ ok: true });
  }

  return Response.json({ ok: true });
}
