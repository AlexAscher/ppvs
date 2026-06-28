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
type BusinessConnection = {
  id: string;
  user?: { id?: number };
  user_chat_id?: number;
  rights?: Record<string, unknown> | null;
  can_reply?: boolean;
  is_enabled?: boolean;
};
type PurchasedPaidMedia = {
  from?: { id?: number };
  paid_media_payload?: string;
};
type Update = {
  pre_checkout_query?: PreCheckoutQuery;
  message?: { successful_payment?: SuccessfulPayment };
  business_connection?: BusinessConnection;
  purchased_paid_media?: PurchasedPaidMedia;
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

  // ── business_connection: model connected/updated our bot via Chat Automation
  // Store it so the PPV send path can sendPaidMedia on her behalf. Keyed by the
  // model's Telegram user id (resolved at send time via gramJS getMe).
  if (update.business_connection) {
    const bc = update.business_connection;
    try {
      const rights = bc.rights ?? null;
      const canReply =
        bc.can_reply ?? (rights ? Boolean((rights as { can_reply?: boolean }).can_reply) : false);
      await admin.from("business_connections").upsert(
        {
          connection_id: bc.id,
          tg_user_id: String(bc.user?.id ?? ""),
          user_chat_id: bc.user_chat_id != null ? String(bc.user_chat_id) : null,
          can_reply: canReply,
          rights,
          is_enabled: bc.is_enabled ?? true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "connection_id" },
      );
      console.log(
        `[webhooks/telegram] business_connection id=${bc.id} user=${bc.user?.id} enabled=${bc.is_enabled} canReply=${canReply}`,
      );
    } catch (e) {
      console.error("[webhooks/telegram] business_connection store failed:", e instanceof Error ? e.message : e);
    }
    return Response.json({ ok: true });
  }

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

  // ── purchased_paid_media: fan unlocked native Paid Media we sent ──────────
  // Telegram has already revealed the media on the fan's end. We just record
  // the sale (mark paid + bump fan total + sales alert). skipDelivery=true so
  // we don't re-push the originals via gramJS.
  if (update.purchased_paid_media) {
    const code = (update.purchased_paid_media.paid_media_payload ?? "").trim();
    if (!CODE_RE.test(code)) return Response.json({ ok: true });
    try {
      const { data: sendRaw } = await admin
        .from("ppv_sends")
        .select("id, code, model_id, peer_id, peer_access_hash, peer_username, caption, status, total_price, malum_txn")
        .eq("code", code)
        .maybeSingle();
      if (sendRaw) {
        await fulfillPpvPaid(
          admin,
          sendRaw as Parameters<typeof fulfillPpvPaid>[1],
          null,
          { skipDelivery: true },
        );
      } else {
        console.warn("[webhooks/telegram] purchased_paid_media: no ppv_send for code=", code);
      }
    } catch (e) {
      console.error("[webhooks/telegram] purchased_paid_media failed:", e instanceof Error ? e.message : e);
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
