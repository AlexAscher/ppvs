import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withTelegramClient } from "@/lib/telegram-pool";
import { sendOriginalsAlbum } from "@/lib/ppv-delivery";
import { sendSalesAlert } from "@/lib/sales-alerts";
import { agencyNet } from "@/lib/platform";

/**
 * Shared "payment landed" fulfillment for a paid PPV send or tip:
 *   mark paid → bump fans.total_spent → sales alert → (PPV) Telegram album push.
 *
 * Gateway-agnostic. Used by the Telegram Stars webhook (the only payment path
 * after the card2crypto/Malum removal). `externalTxn` = the gateway's charge id
 * (Stars: telegram_payment_charge_id) stored on the row for refunds/audit.
 *
 * The content itself is delivered from the MODEL's gramJS session (not the pay
 * bot) — `withTelegramClient(modelId, …)` — exactly as before.
 */

type PpvSendRow = {
  id: string;
  code: string;
  model_id: string;
  peer_id: string;
  peer_access_hash: string | null;
  peer_username: string | null;
  caption: string | null;
  status: string;
  total_price: number | string;
  malum_txn: string | null;
};

type TipRow = {
  id: string;
  model_id: string;
  peer_id: string;
  peer_username: string | null;
  amount: number | string;
  message: string | null;
  status: string;
  chatter_id: string | null;
};

type ItemRowRaw = {
  ordinal: number;
  ppvs:
    | { id: string; name: string; media_url: string | null; tg_file_id: string | null }
    | { id: string; name: string; media_url: string | null; tg_file_id: string | null }[]
    | null;
};

type ModelRow = { session_string: string; api_id: number; api_hash: string };

/** Mark a PPV send paid (idempotent) + deliver.
 *
 *   skipDelivery=true → Telegram has already unlocked the media on the fan's
 *   end (native Paid Media path); we only record the sale + alerts and DON'T
 *   re-push originals from the model's gramJS session.
 *
 * Returns false if already paid. */
export async function fulfillPpvPaid(
  admin: SupabaseClient,
  send: PpvSendRow,
  externalTxn: string | null,
  options?: { skipDelivery?: boolean },
): Promise<boolean> {
  if (send.status === "paid" || send.status === "delivered") return false;

  const now = new Date().toISOString();
  // Compare-and-swap: only flip to paid if the row is still in an unpaid
  // state. Telegram retries webhooks aggressively so two concurrent
  // successful_payment deliveries can hit us; without CAS both would fire
  // fans.total_spent bumps and sales alerts. Using .neq("status","paid")
  // makes the update no-op on a second concurrent call.
  const { data: updated, error: updErr } = await admin
    .from("ppv_sends")
    .update({ status: "paid", paid_at: now, malum_txn: send.malum_txn ?? externalTxn })
    .eq("id", send.id)
    .not("status", "in", "(paid,delivered)")
    .select("id");
  if (updErr) throw new Error(`mark-paid failed: ${updErr.message}`);
  if (!updated || updated.length === 0) {
    // Another concurrent webhook won the race and already marked the send
    // paid — treat as "already fulfilled" so we don't double-count.
    return false;
  }

  after(async () => {
    try {
      const { data: existing } = await admin
        .from("fans")
        .select("id, total_spent")
        .eq("model_id", send.model_id)
        .eq("peer_id", send.peer_id)
        .maybeSingle();
      const prev = Number((existing as { total_spent: number } | null)?.total_spent ?? 0);
      await admin.from("fans").upsert(
        {
          model_id: send.model_id,
          peer_id: send.peer_id,
          telegram_username: send.peer_username,
          total_spent: prev + Number(send.total_price ?? 0),
          last_seen_at: now,
        },
        { onConflict: "model_id,peer_id" },
      );
    } catch (e) {
      console.error("[fulfillment] ppv fans.total_spent failed:", e instanceof Error ? e.message : e);
    }
  });

  after(async () => {
    try {
      const { data: modelRow } = await admin
        .from("models")
        .select("name, agency_user_id")
        .eq("id", send.model_id)
        .maybeSingle();
      const agencyUserId = (modelRow as { agency_user_id?: string } | null)?.agency_user_id;
      if (!agencyUserId) return;
      const { data: itemsRaw } = await admin
        .from("ppv_send_items")
        .select("ppvs(name)")
        .eq("send_id", send.id)
        .order("ordinal", { ascending: true })
        .limit(2);
      type ItemJoin = { ppvs: { name: string } | { name: string }[] | null };
      const items = (itemsRaw ?? []) as ItemJoin[];
      const firstName = items[0]
        ? (Array.isArray(items[0].ppvs) ? items[0].ppvs[0]?.name : items[0].ppvs?.name) ?? "item"
        : "item";
      const itemName = items.length > 1 ? `${firstName} +${items.length - 1} more` : firstName;
      sendSalesAlert({
        type: "ppv",
        agencyUserId,
        modelId: send.model_id,
        modelName: (modelRow as { name?: string } | null)?.name ?? undefined,
        fanDisplay: send.peer_username ? `@${send.peer_username}` : "Fan",
        // Report what the agency actually receives (gross minus 15% platform
        // fee) so the Telegram notification matches the dashboard Net cards.
        amount: agencyNet(Number(send.total_price ?? 0)),
        itemName,
      });
    } catch (e) {
      console.error("[fulfillment] ppv sales-alert failed:", e instanceof Error ? e.message : e);
    }
  });

  const { data: itemsRaw } = await admin
    .from("ppv_send_items")
    .select("ordinal, ppvs(id, name, media_url, tg_file_id)")
    .eq("send_id", send.id)
    .order("ordinal", { ascending: true });
  const joined = ((itemsRaw ?? []) as unknown as ItemRowRaw[])
    .map((it) => {
      const ppv = Array.isArray(it.ppvs) ? it.ppvs[0] ?? null : it.ppvs;
      return { ppvId: ppv?.id ?? "", mediaUrl: ppv?.media_url ?? "", cachedFileId: ppv?.tg_file_id ?? null };
    })
    .filter((it) => !!it.mediaUrl && !!it.ppvId);

  if (options?.skipDelivery) {
    // Native Paid Media: Telegram unlocks on its own. Just close out the row.
    await admin
      .from("ppv_sends")
      .update({ status: "delivered", delivered_at: new Date().toISOString(), error: null })
      .eq("id", send.id);
    return true;
  }

  if (joined.length > 0) {
    const { data: modelRow, error: modelErr } = await admin
      .from("models")
      .select("session_string, api_id, api_hash")
      .eq("id", send.model_id)
      .single();
    if (modelErr || !modelRow) {
      console.error("[fulfillment] model lookup failed — skipping Telegram push:", modelErr);
    } else {
      const model = modelRow as ModelRow;
      const ctx = {
        sendId: send.id,
        modelId: send.model_id,
        peerId: send.peer_id,
        accessHash: send.peer_access_hash,
        caption: send.caption ?? "",
        session_string: model.session_string,
        api_id: model.api_id,
        api_hash: model.api_hash,
        originals: joined.map((j) => ({ ppvId: j.ppvId, mediaUrl: j.mediaUrl, cachedFileId: j.cachedFileId })),
      };
      after(async () => {
        try {
          const deliveryResult = await withTelegramClient(
            ctx.modelId,
            ctx.session_string,
            ctx.api_id,
            ctx.api_hash,
            async (tg) =>
              sendOriginalsAlbum(
                tg,
                ctx.peerId,
                ctx.accessHash,
                ctx.originals,
                ctx.caption,
                async (ppvId, serialized) => {
                  try {
                    await admin.from("ppvs").update({ tg_file_id: serialized }).eq("id", ppvId);
                  } catch (e) {
                    console.error("[fulfillment] file_id cache write failed:", e instanceof Error ? e.message : e);
                  }
                },
              ),
            300_000,
          );
          const partial =
            deliveryResult.failed > 0
              ? `Telegram: delivered ${deliveryResult.delivered}/${deliveryResult.total} (rest available on web)`
              : null;
          await admin
            .from("ppv_sends")
            .update({ status: "delivered", delivered_at: new Date().toISOString(), error: partial })
            .eq("id", ctx.sendId);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed";
          console.error("[fulfillment background] telegram push failed:", message);
          await admin.from("ppv_sends").update({ error: `Telegram push failed: ${message}` }).eq("id", ctx.sendId);
        }
      });
    }
  }
  return true;
}

/** Mark a tip paid (idempotent) + fans bump + chat event + sales alert. */
export async function fulfillTipPaid(admin: SupabaseClient, tip: TipRow): Promise<boolean> {
  if (tip.status === "paid") return false;
  const tnow = new Date().toISOString();
  // Compare-and-swap: only flip to paid if the tip is still pending. See
  // fulfillPpvPaid for the concurrent-webhook rationale.
  const { data: tUpdated, error: tErr } = await admin
    .from("tips")
    .update({ status: "paid", paid_at: tnow })
    .eq("id", tip.id)
    .neq("status", "paid")
    .select("id");
  if (tErr) throw new Error(`tip mark-paid failed: ${tErr.message}`);
  if (!tUpdated || tUpdated.length === 0) return false;

  after(async () => {
    try {
      const { data: existing } = await admin
        .from("fans").select("id, total_spent")
        .eq("model_id", tip.model_id).eq("peer_id", tip.peer_id).maybeSingle();
      const prev = Number((existing as { total_spent?: number } | null)?.total_spent ?? 0);
      await admin.from("fans").upsert(
        { model_id: tip.model_id, peer_id: tip.peer_id, telegram_username: tip.peer_username,
          total_spent: prev + Number(tip.amount ?? 0), last_seen_at: tnow },
        { onConflict: "model_id,peer_id" },
      );
    } catch (e) { console.error("[fulfillment] tip total_spent failed:", e instanceof Error ? e.message : e); }
  });

  after(async () => {
    try {
      await admin.from("chat_system_events").insert({
        model_id: tip.model_id, peer_id: tip.peer_id, kind: "tip_paid",
        amount: Number(tip.amount ?? 0),
        body: `Customer sent a tip of $${Number(tip.amount ?? 0).toFixed(2)}`,
      });
    } catch (e) { console.error("[fulfillment] tip chat-event failed:", e instanceof Error ? e.message : e); }
  });

  after(async () => {
    try {
      const { data: m } = await admin.from("models").select("name, agency_user_id").eq("id", tip.model_id).maybeSingle();
      const agencyUserId = (m as { agency_user_id?: string } | null)?.agency_user_id;
      if (!agencyUserId) return;
      sendSalesAlert({
        type: "tip", agencyUserId, modelId: tip.model_id,
        modelName: (m as { name?: string } | null)?.name ?? undefined,
        fanDisplay: tip.peer_username ? `@${tip.peer_username}` : "Fan",
        amount: agencyNet(Number(tip.amount ?? 0)), message: tip.message, chatterId: tip.chatter_id ?? null,
      });
    } catch (e) { console.error("[fulfillment] tip sales-alert failed:", e instanceof Error ? e.message : e); }
  });
  return true;
}
