import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getBotUsername, sendBotMessage } from "@/lib/alert-bot";

/**
 * Platform-owner Sales Alerts channel — separate from per-agency alerts.
 *
 *   GET    → { connected, enabled, alertsPpv, alertsTips, botUsername }
 *   POST   → mint a one-time link code, return t.me/<bot>?start=admin_<code>
 *   PATCH  → toggle enabled / alertsPpv / alertsTips
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
    .select("bot_chat_id, enabled, alerts_ppv, alerts_tips")
    .eq("admin_email", auth.user.email!.toLowerCase())
    .maybeSingle();
  const botUsername = await getBotUsername();
  return Response.json({
    connected: !!(data?.bot_chat_id),
    enabled: data?.enabled ?? true,
    alertsPpv: data?.alerts_ppv ?? true,
    alertsTips: data?.alerts_tips ?? true,
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

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;
  const email = auth.user.email!.toLowerCase();

  const body = (await req.json().catch(() => null)) as {
    enabled?: boolean;
    alertsPpv?: boolean;
    alertsTips?: boolean;
  } | null;
  if (!body) return Response.json({ error: "Body required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.alertsPpv === "boolean") patch.alerts_ppv = body.alertsPpv;
  if (typeof body.alertsTips === "boolean") patch.alerts_tips = body.alertsTips;
  if (Object.keys(patch).length === 1) return Response.json({ ok: true, noop: true });

  const admin = createAdminSupabaseClient();
  // Upsert so an admin who toggles a setting BEFORE completing the Connect
  // flow still gets a row created (matching agency Sales Alerts UX).
  const { error } = await admin
    .from("admin_sales_channels")
    .upsert({ admin_email: email, ...patch }, { onConflict: "admin_email" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
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

/** Send a synthetic sales-alert-style DM to the admin's bound chat so they
 *  can verify the wiring end-to-end without waiting for a real sale. */
export async function PUT() {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;
  const email = auth.user.email!.toLowerCase();

  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("admin_sales_channels")
    .select("bot_chat_id")
    .eq("admin_email", email)
    .maybeSingle();
  const chatId = (data as { bot_chat_id?: string | null } | null)?.bot_chat_id;
  if (!chatId) {
    return Response.json({ error: "Bot is not connected. Tap Connect first." }, { status: 400 });
  }
  const ok = await sendBotMessage(
    chatId,
    "🔔 Test alert — Global Sales Alerts are wired up correctly.\nYou'll get a message like this on every PPV / tip sale across all agencies.",
  );
  if (!ok) return Response.json({ error: "Bot send failed" }, { status: 502 });
  return Response.json({ ok: true });
}
