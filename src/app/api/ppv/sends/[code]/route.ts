import { NextRequest } from "next/server";
import { Api } from "telegram";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getCachedAuthUser } from "@/lib/auth-cache";
import { withTelegramClient } from "@/lib/telegram-pool";
import { buildPeer } from "@/lib/telegram-peer";
import { decryptIfNeeded } from "@/lib/crypto";
import {
  deleteBusinessMessages,
  editBusinessMessageCaption,
  findActiveBusinessConnection,
} from "@/lib/business-bot";

/**
 * DELETE /api/ppv/sends/{code}       → remove the PPV bubble (DB + Telegram)
 * PATCH  /api/ppv/sends/{code}       { caption } → edit caption (Telegram + DB)
 *
 * Auth: agency owner of the send's model, OR the chatter who made the send,
 * OR a chatter assigned to that model. Chatters can act on their own or on
 * an unclaimed (chatter_id NULL — auto-reply) bubble.
 *
 * Two send channels (see 20260710_ppv_sends_msg_ids.sql):
 *   'business' → bot API deleteBusinessMessages / editMessageCaption via
 *                the model's active business connection.
 *   'mtproto'  → gramJS deleteMessages / editMessage on the model account's
 *                own outbox (works for free albums we sent from the model
 *                account, and also for paid-media sent by the bot which
 *                appear in the model's outbox from Telegram's POV).
 *
 * Pre-migration sends have no telegram_msg_ids → DELETE removes only our DB
 * row (the virtual bubble disappears from the chatter UI immediately), and
 * PATCH returns 400 with a message that edit isn't available for legacy
 * bubbles. This matches the user's picked "best-effort delete" option.
 */

type Ppv = {
  id: string;
  model_id: string;
  chatter_id: string | null;
  peer_id: string;
  peer_access_hash: string | null;
  caption: string | null;
  telegram_msg_ids: number[] | null;
  send_channel: "business" | "mtproto" | null;
};

async function loadSend(admin: ReturnType<typeof createAdminSupabaseClient>, code: string) {
  const { data } = await admin
    .from("ppv_sends")
    .select("id, model_id, chatter_id, peer_id, peer_access_hash, caption, telegram_msg_ids, send_channel")
    .eq("code", code)
    .maybeSingle();
  return data as Ppv | null;
}

async function loadModelForSend(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  modelId: string,
) {
  const { data } = await admin
    .from("models")
    .select("agency_user_id, session_string, api_id, api_hash, tg_user_id")
    .eq("id", modelId)
    .maybeSingle();
  return data as {
    agency_user_id: string;
    session_string: string | null;
    api_id: number | null;
    api_hash: string | null;
    tg_user_id: string | null;
  } | null;
}

async function authorize(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  send: Ppv,
  userId: string,
): Promise<{ ok: true; model: NonNullable<Awaited<ReturnType<typeof loadModelForSend>>> } | { ok: false; res: Response }> {
  const model = await loadModelForSend(admin, send.model_id);
  if (!model) {
    return { ok: false, res: Response.json({ error: "Model not found" }, { status: 404 }) };
  }
  // Agency owner always allowed.
  if (model.agency_user_id === userId) return { ok: true, model };
  // Chatter assigned to this model, or the chatter who made the send.
  const { data: link } = await admin
    .from("agency_chatters")
    .select("id")
    .eq("chatter_id", userId)
    .eq("model_id", send.model_id)
    .maybeSingle();
  if (link) return { ok: true, model };
  return { ok: false, res: Response.json({ error: "Forbidden" }, { status: 403 }) };
}

async function deleteViaMtproto(
  send: Ppv,
  model: NonNullable<Awaited<ReturnType<typeof loadModelForSend>>>,
): Promise<void> {
  if (!model.session_string || !model.api_id || !model.api_hash) {
    throw new Error("Model session unavailable");
  }
  const sess = decryptIfNeeded(model.session_string);
  const hash = decryptIfNeeded(model.api_hash);
  if (!sess || !hash) throw new Error("Model secret decrypt failed");
  await withTelegramClient(
    send.model_id,
    sess,
    model.api_id,
    hash,
    async (tg) => {
      const peer = buildPeer(send.peer_id, send.peer_access_hash);
      const ids = (send.telegram_msg_ids ?? []).map((n) => Number(n)).filter((n) => Number.isFinite(n));
      if (ids.length === 0) return;
      await tg.deleteMessages(peer, ids, { revoke: true });
    },
    30_000,
  );
}

async function deleteViaBusiness(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  send: Ppv,
  model: NonNullable<Awaited<ReturnType<typeof loadModelForSend>>>,
): Promise<void> {
  if (!model.tg_user_id) throw new Error("Model has no tg_user_id — reconnect the bot");
  const conn = await findActiveBusinessConnection(admin, model.tg_user_id);
  if (!conn) throw new Error("No active business connection — reconnect the bot");
  const ids = (send.telegram_msg_ids ?? []).map((n) => Number(n)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) return;
  const out = await deleteBusinessMessages({ connectionId: conn.connectionId, messageIds: ids });
  if (!out.ok) {
    // "message to delete not found" is idempotent-OK — the message already
    // vanished (fan deleted, or a previous partial delete succeeded).
    if (out.description && /not found/i.test(out.description)) return;
    throw new Error(out.description || "deleteBusinessMessages failed");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const user = await getCachedAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminSupabaseClient();
    const send = await loadSend(admin, code);
    if (!send) return Response.json({ error: "Send not found" }, { status: 404 });

    const auth = await authorize(admin, send, user.id);
    if (!auth.ok) return auth.res;

    // Reach into Telegram if we captured msg ids at send time. If we didn't
    // (pre-migration send), skip and just drop our DB row — the chatter UI's
    // virtual bubble disappears immediately, Telegram messages remain in
    // the fan's chat. This is the "best-effort delete" option the user picked.
    let telegramDropped = false;
    if (
      send.telegram_msg_ids &&
      send.telegram_msg_ids.length > 0 &&
      send.send_channel
    ) {
      try {
        if (send.send_channel === "mtproto") {
          await deleteViaMtproto(send, auth.model);
        } else {
          await deleteViaBusiness(admin, send, auth.model);
        }
        telegramDropped = true;
      } catch (e) {
        console.error(
          `[ppv/sends DELETE] Telegram removal failed for code=${code}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    // Drop the ppv_sends row (junction ppv_send_items cascades via FK).
    // Regardless of Telegram outcome so the chatter's virtual bubble always
    // clears.
    const { error: delErr } = await admin.from("ppv_sends").delete().eq("id", send.id);
    if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

    return Response.json({ ok: true, telegramDropped });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const body = (await req.json().catch(() => null)) as { caption?: string } | null;
    const nextCaption = (body?.caption ?? "").toString();
    if (nextCaption.length > 1024) {
      return Response.json({ error: "Caption too long (max 1024)" }, { status: 400 });
    }

    const user = await getCachedAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminSupabaseClient();
    const send = await loadSend(admin, code);
    if (!send) return Response.json({ error: "Send not found" }, { status: 404 });

    const auth = await authorize(admin, send, user.id);
    if (!auth.ok) return auth.res;

    // Editing REQUIRES message ids (Telegram protocol; we don't fake it).
    // Pre-migration sends never captured them → tell the client to disable
    // the Edit option client-side. Client already hides Edit for these rows,
    // this is just server-side belt.
    if (!send.telegram_msg_ids || send.telegram_msg_ids.length === 0 || !send.send_channel) {
      return Response.json(
        { error: "This bubble was sent before edit was available. Delete + resend instead." },
        { status: 400 },
      );
    }

    const leaderId = send.telegram_msg_ids[0];
    try {
      if (send.send_channel === "mtproto") {
        if (!auth.model.session_string || !auth.model.api_id || !auth.model.api_hash) {
          throw new Error("Model session unavailable");
        }
        const sess = decryptIfNeeded(auth.model.session_string);
        const hash = decryptIfNeeded(auth.model.api_hash);
        if (!sess || !hash) throw new Error("Model secret decrypt failed");
        await withTelegramClient(
          send.model_id,
          sess,
          auth.model.api_id,
          hash,
          async (tg) => {
            const peer = buildPeer(send.peer_id, send.peer_access_hash);
            await tg.invoke(
              new Api.messages.EditMessage({
                peer,
                id: leaderId,
                message: nextCaption,
                noWebpage: true,
              }),
            );
          },
          30_000,
        );
      } else {
        // Business channel — bot API edit via the model's active connection.
        if (!auth.model.tg_user_id) throw new Error("Model has no tg_user_id");
        const conn = await findActiveBusinessConnection(admin, auth.model.tg_user_id);
        if (!conn) throw new Error("No active business connection");
        const out = await editBusinessMessageCaption({
          connectionId: conn.connectionId,
          chatId: send.peer_id,
          messageId: leaderId,
          caption: nextCaption,
        });
        if (!out.ok) throw new Error(out.description || "editMessageCaption failed");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to edit Telegram message";
      console.error(`[ppv/sends PATCH] Telegram edit failed for code=${code}:`, message);
      return Response.json({ error: message }, { status: 502 });
    }

    // Only update our DB caption after Telegram accepted — so the chatter UI
    // stays consistent with what the fan actually sees.
    const { error: updErr } = await admin
      .from("ppv_sends")
      .update({ caption: nextCaption || null })
      .eq("id", send.id);
    if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

    return Response.json({ ok: true, caption: nextCaption });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

