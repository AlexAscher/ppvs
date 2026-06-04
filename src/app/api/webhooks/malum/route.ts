import { NextRequest, after } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { verifyMalumWebhookSignature, type MalumWebhookEvent } from "@/lib/malum";
import { withTelegramClient } from "@/lib/telegram-pool";
import { sendOriginalsAlbum } from "@/lib/ppv-delivery";

export const maxDuration = 300;

/**
 * Malum webhook endpoint.
 *
 * Lifecycle from the docs:
 *   CREATED → PROCESSING → COMPLETED   (or EXPIRED / CANCELLED)
 *
 * We act on COMPLETED only. Anything else is acked with 200 but ignored —
 * Malum retries on non-2xx, and we don't want to ping-pong on terminal-
 * but-not-success states.
 *
 * Security:
 *   - MD5(txn|timestamp|webhook_key) signature check on every payload.
 *   - Idempotent: if the send is already in `paid` or `delivered`, we skip
 *     the deliver path (no duplicate Telegram albums to the fan).
 *   - The send is resolved by `metadata` (our pay code) first, falling back
 *     to `malum_txn` we persisted at create time. Either alone is enough.
 */

type SendRow = {
  id: string;
  code: string;
  model_id: string;
  peer_id: string;
  peer_access_hash: string | null;
  peer_username: string | null;
  caption: string | null;
  status: string;
  total_price: number;
  malum_txn: string | null;
};

type ModelRow = {
  session_string: string;
  api_id: number;
  api_hash: string;
};

type ItemRowRaw = {
  ordinal: number;
  ppvs:
    | { id: string; name: string; media_url: string | null; tg_file_id: string | null }
    | { id: string; name: string; media_url: string | null; tg_file_id: string | null }[]
    | null;
};

export async function POST(req: NextRequest) {
  let event: MalumWebhookEvent;
  try {
    event = (await req.json()) as MalumWebhookEvent;
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }

  if (!verifyMalumWebhookSignature(event)) {
    console.warn("[malum/webhook] bad signature for txn=", event?.txn);
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Non-terminal / non-success states: ack and move on. Malum won't retry
  // a 200, which is what we want — these are informational.
  if (event.status !== "COMPLETED") {
    return Response.json({ ok: true, ignored: event.status });
  }

  try {
    const admin = createAdminSupabaseClient();

    // Resolve the send: metadata is the pay code (we put it there in
    // /api/payments/malum/create). Fall back to malum_txn if for some
    // reason metadata is empty.
    const code = (event.metadata ?? "").trim();
    let sendRaw: SendRow | null = null;
    if (code && /^[a-z0-9]{6,16}$/i.test(code)) {
      const { data } = await admin
        .from("ppv_sends")
        .select(
          "id, code, model_id, peer_id, peer_access_hash, peer_username, caption, status, total_price, malum_txn",
        )
        .eq("code", code)
        .maybeSingle();
      sendRaw = (data as SendRow | null) ?? null;
    }
    if (!sendRaw && event.txn) {
      const { data } = await admin
        .from("ppv_sends")
        .select(
          "id, code, model_id, peer_id, peer_access_hash, peer_username, caption, status, total_price, malum_txn",
        )
        .eq("malum_txn", event.txn)
        .maybeSingle();
      sendRaw = (data as SendRow | null) ?? null;
    }
    if (!sendRaw) {
      console.warn(
        "[malum/webhook] no matching send for txn=",
        event.txn,
        "metadata=",
        event.metadata,
      );
      // 200 so Malum doesn't retry forever — but the lookup mismatch is
      // logged for manual investigation.
      return Response.json({ ok: true, matched: false });
    }
    const send = sendRaw;

    // Idempotency: a duplicate COMPLETED webhook should be a no-op.
    if (send.status === "paid" || send.status === "delivered") {
      return Response.json({ ok: true, alreadyHandled: true });
    }

    // Mark paid synchronously — the success page reads this to decide
    // whether to reveal originals or show "processing".
    const now = new Date().toISOString();
    const { error: updErr } = await admin
      .from("ppv_sends")
      .update({
        status: "paid",
        paid_at: now,
        // If we didn't get the txn at create time (e.g. network blip), bind
        // it now from the webhook itself.
        malum_txn: send.malum_txn ?? event.txn,
      })
      .eq("id", send.id);
    if (updErr) {
      console.error("[malum/webhook] mark-paid failed:", updErr.message);
      // 500 so Malum retries — we genuinely failed to record the payment.
      return Response.json({ error: "DB write failed" }, { status: 500 });
    }

    // Increment fans.total_spent in the background — not on the critical
    // path of the webhook ack. Same pattern as /api/ppv/deliver.
    after(async () => {
      try {
        const { data: existing } = await admin
          .from("fans")
          .select("id, total_spent")
          .eq("model_id", send.model_id)
          .eq("peer_id", send.peer_id)
          .maybeSingle();
        const prev = Number((existing as { total_spent: number } | null)?.total_spent ?? 0);
        const next = prev + Number(send.total_price ?? 0);
        await admin.from("fans").upsert(
          {
            model_id: send.model_id,
            peer_id: send.peer_id,
            telegram_username: send.peer_username,
            total_spent: next,
            last_seen_at: now,
          },
          { onConflict: "model_id,peer_id" },
        );
      } catch (e: unknown) {
        console.error(
          "[malum/webhook] fans.total_spent update failed:",
          e instanceof Error ? e.message : e,
        );
      }
    });

    // Telegram push — same logic as /api/ppv/deliver, kept in this route so
    // the webhook is the single source of truth for "payment landed".
    const { data: itemsRaw } = await admin
      .from("ppv_send_items")
      .select("ordinal, ppvs(id, name, media_url, tg_file_id)")
      .eq("send_id", send.id)
      .order("ordinal", { ascending: true });

    type JoinRow = { ppvId: string; name: string; mediaUrl: string; cachedFileId: string | null };
    const joined: JoinRow[] = ((itemsRaw ?? []) as unknown as ItemRowRaw[])
      .map((it) => {
        const ppv = Array.isArray(it.ppvs) ? it.ppvs[0] ?? null : it.ppvs;
        return {
          ppvId: ppv?.id ?? "",
          name: ppv?.name ?? "Item",
          mediaUrl: ppv?.media_url ?? "",
          cachedFileId: ppv?.tg_file_id ?? null,
        };
      })
      .filter((it) => !!it.mediaUrl && !!it.ppvId);

    if (joined.length > 0) {
      const { data: modelRow, error: modelErr } = await admin
        .from("models")
        .select("session_string, api_id, api_hash")
        .eq("id", send.model_id)
        .single();

      if (modelErr || !modelRow) {
        console.error(
          "[malum/webhook] model lookup failed — skipping Telegram push:",
          modelErr,
        );
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
          originals: joined.map((j) => ({
            ppvId: j.ppvId,
            mediaUrl: j.mediaUrl,
            cachedFileId: j.cachedFileId,
          })),
        };

        after(async () => {
          try {
            const deliveryResult = await withTelegramClient(
              ctx.modelId,
              ctx.session_string,
              ctx.api_id,
              ctx.api_hash,
              async (tg) => {
                return await sendOriginalsAlbum(
                  tg,
                  ctx.peerId,
                  ctx.accessHash,
                  ctx.originals,
                  ctx.caption,
                  async (ppvId, serialized) => {
                    try {
                      await admin
                        .from("ppvs")
                        .update({ tg_file_id: serialized })
                        .eq("id", ppvId);
                    } catch (e: unknown) {
                      console.error(
                        `[malum/webhook] file_id cache write failed for ppv=${ppvId}:`,
                        e instanceof Error ? e.message : e,
                      );
                    }
                  },
                );
              },
              300_000,
            );
            const partial =
              deliveryResult.failed > 0
                ? `Telegram: delivered ${deliveryResult.delivered}/${deliveryResult.total} (rest available on web)`
                : null;
            await admin
              .from("ppv_sends")
              .update({
                status: "delivered",
                delivered_at: new Date().toISOString(),
                error: partial,
              })
              .eq("id", ctx.sendId);
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : "Failed";
            console.error("[malum/webhook background] telegram push failed:", message);
            await admin
              .from("ppv_sends")
              .update({ error: `Telegram push failed: ${message}` })
              .eq("id", ctx.sendId);
          }
        });
      }
    }

    return Response.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    console.error("[malum/webhook] error:", msg);
    // 500 → Malum will retry. That's desirable for transient DB blips.
    return Response.json({ error: msg }, { status: 500 });
  }
}
