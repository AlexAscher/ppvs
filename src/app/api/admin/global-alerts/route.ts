import { requireAdmin } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getBotUsername } from "@/lib/alert-bot";

/**
 * Platform-owner Sales Alerts channel — separate from per-agency alerts.
 *
 *   GET    → { connected, botUsername }
 *   POST   → mint a one-time link code, return t.me/<bot>?start=admin_<code>
 *   DELETE → unbind the current chat_id (leave the code, force a new Connect)
 *
 * Binding happens inside the bot's /start handler (lib/alert-bot.ts) when it
 * sees `admin_<code>` as the /start payload.
 */

export async function GET() {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("admin_sales_channels")
    .select("bot_chat_id, enabled")
    .eq("admin_email", auth.user.email!.toLowerCase())
    .maybeSingle();
  const botUsername = await getBotUsername();
  return Response.json({
    connected: !!(data?.bot_chat_id),
    enabled: data?.enabled ?? true,
    botUsername,
  });
}

export async function POST() {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;
  const email = auth.user.email!.toLowerCase();

  const botUsername = await getBotUsername();
  if (!botUsername) {
    return Response.json({ error: "Notifications bot is not configured on this server." }, { status: 500 });
  }

  // Short random code — 12 chars from a 36-char alphabet is astronomically
  // unlikely to collide; the UNIQUE index catches the rare case.
  const code = `${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 8)}`;
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("admin_sales_channels")
    .upsert(
      { admin_email: email, link_code: code, updated_at: new Date().toISOString() },
      { onConflict: "admin_email" },
    );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    link: `https://t.me/${botUsername}?start=admin_${code}`,
  });
}

export async function DELETE() {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;
  const email = auth.user.email!.toLowerCase();

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("admin_sales_channels")
    .update({ bot_chat_id: null, updated_at: new Date().toISOString() })
    .eq("admin_email", email);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
