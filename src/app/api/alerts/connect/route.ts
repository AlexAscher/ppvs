import { randomBytes } from "node:crypto";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { getBotUsername, startAlertBotPolling } from "@/lib/alert-bot";

/**
 * POST /api/alerts/connect
 *
 * Generates a one-time link code for the agency, persists it, and returns
 * a t.me deep link. The agency opens it in their personal Telegram and
 * taps Start; the bot poller (lib/alert-bot) captures `/start <code>` and
 * binds their chat_id. Also (re)starts the poller in case the server
 * booted without instrumentation.
 *
 * DELETE /api/alerts/connect — unlink (clears chat_id + code).
 */
export async function POST() {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  startAlertBotPolling();

  const username = await getBotUsername();
  if (!username) {
    return Response.json(
      { error: "Bot not configured (TELEGRAM_BOT_TOKEN missing)" },
      { status: 503 },
    );
  }

  const code = randomBytes(12).toString("base64url"); // ~16 url-safe chars

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("agency_settings")
    .upsert(
      { user_id: user.id, alerts_bot_link_code: code, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    link: `https://t.me/${username}?start=${code}`,
    botUsername: username,
  });
}

export async function DELETE() {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("agency_settings")
    .update({
      alerts_bot_chat_id: null,
      alerts_bot_link_code: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
