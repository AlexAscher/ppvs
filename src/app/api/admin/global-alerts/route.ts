import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getBotUsername, sendBotMessage } from "@/lib/alert-bot";

/**
 * Platform-owner Sales Alerts — MULTI-CHANNEL fan-out. Any admin can Connect
 * several bot chats (phone, desktop, a co-owner), each with its own event
 * toggles. Every enabled channel gets a copy of every applicable event.
 *
 *   GET    → { channels: Channel[], botUsername }
 *   POST   → mint a one-time link code, return t.me/<bot>?start=admin_<code>.
 *            Creates a pending row (bot_chat_id NULL). The bot's /start
 *            handler binds bot_chat_id + label when the admin taps Start.
 *   PATCH  → { id, enabled?, alertsPpv?, alertsSignups?, alertsVault? }
 *   DELETE → { id } — removes the row entirely.
 *   PUT    → { id } — Send test to the given channel.
 */

type Channel = {
  id: string;
  botChatId: string | null;
  label: string | null;
  enabled: boolean;
  alertsPpv: boolean;
  alertsSignups: boolean;
  alertsVault: boolean;
  connected: boolean;
  pending: boolean;
};

function mapRow(r: {
  id: string;
  bot_chat_id: string | null;
  label: string | null;
  enabled: boolean;
  alerts_ppv: boolean;
  alerts_signups: boolean;
  alerts_vault: boolean;
  link_code: string | null;
}): Channel {
  return {
    id: r.id,
    botChatId: r.bot_chat_id,
    label: r.label,
    enabled: r.enabled,
    alertsPpv: r.alerts_ppv,
    alertsSignups: r.alerts_signups,
    alertsVault: r.alerts_vault,
    connected: !!r.bot_chat_id,
    pending: !r.bot_chat_id && !!r.link_code,
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("admin_sales_channels")
    .select("id, bot_chat_id, label, enabled, alerts_ppv, alerts_signups, alerts_vault, link_code, created_at")
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as Parameters<typeof mapRow>[0][];
  const botUsername = await getBotUsername();
  return Response.json({
    channels: rows.map(mapRow),
    botUsername,
  });
}

export async function POST() {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const botUsername = await getBotUsername();
  if (!botUsername) {
    return Response.json({ error: "Notifications bot is not configured on this server." }, { status: 500 });
  }

  // One-time link code. UNIQUE index catches collision on the same slot
  // being minted twice within the same second.
  const code = `${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 8)}`;
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("admin_sales_channels")
    .insert({
      admin_email: auth.user.email!.toLowerCase(),
      link_code: code,
      // bot_chat_id stays NULL until the bot binds it on /start.
    })
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    id: (data as { id: string }).id,
    link: `https://t.me/${botUsername}?start=admin_${code}`,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    enabled?: boolean;
    alertsPpv?: boolean;
    alertsSignups?: boolean;
    alertsVault?: boolean;
  } | null;
  if (!body?.id) return Response.json({ error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.alertsPpv === "boolean") patch.alerts_ppv = body.alertsPpv;
  if (typeof body.alertsSignups === "boolean") patch.alerts_signups = body.alertsSignups;
  if (typeof body.alertsVault === "boolean") patch.alerts_vault = body.alertsVault;
  if (Object.keys(patch).length === 1) return Response.json({ ok: true, noop: true });

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("admin_sales_channels")
    .update(patch)
    .eq("id", body.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return Response.json({ error: "id required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("admin_sales_channels")
    .delete()
    .eq("id", body.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return Response.json({ error: "id required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("admin_sales_channels")
    .select("bot_chat_id")
    .eq("id", body.id)
    .maybeSingle();
  const chatId = (data as { bot_chat_id?: string | null } | null)?.bot_chat_id;
  if (!chatId) {
    return Response.json({ error: "This channel is not connected yet." }, { status: 400 });
  }
  const ok = await sendBotMessage(
    chatId,
    "🔔 Test alert — Global Sales Alerts are wired up correctly.\n" +
      "You'll get a message like this on every PPV sale, new signup, and " +
      "new Vault upload that needs review.",
  );
  if (!ok) return Response.json({ error: "Bot send failed" }, { status: 502 });
  return Response.json({ ok: true });
}
