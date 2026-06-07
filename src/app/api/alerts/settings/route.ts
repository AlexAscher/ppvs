import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET  /api/alerts/settings  → current agency_settings row (auto-creates defaults)
 * POST /api/alerts/settings  → partial update (any subset of fields)
 */

type Settings = {
  alerts_enabled: boolean;
  alerts_ppv: boolean;
  alerts_tips: boolean;
  alerts_channel_id: string | null;
  alerts_channel_access_hash: string | null;
  alerts_channel_title: string | null;
  alerts_sender_model_id: string | null;
  // Bot delivery (added by 20260611_alerts_bot.sql). Exposed as a bool
  // so we never leak the raw chat id to the client.
  alerts_bot_connected?: boolean;
};

export async function GET() {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();
  // select * so the optional alerts_bot_* columns come through without
  // erroring on older schemas.
  let { data } = await admin
    .from("agency_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) {
    await admin.from("agency_settings").insert({ user_id: user.id });
    const { data: created } = await admin
      .from("agency_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    data = created;
  }

  const row = (data ?? {}) as Record<string, unknown>;
  const settings: Settings = {
    alerts_enabled: !!row.alerts_enabled,
    alerts_ppv: row.alerts_ppv === undefined ? true : !!row.alerts_ppv,
    alerts_tips: row.alerts_tips === undefined ? true : !!row.alerts_tips,
    alerts_channel_id: (row.alerts_channel_id as string) ?? null,
    alerts_channel_access_hash: (row.alerts_channel_access_hash as string) ?? null,
    alerts_channel_title: (row.alerts_channel_title as string) ?? null,
    alerts_sender_model_id: (row.alerts_sender_model_id as string) ?? null,
    alerts_bot_connected: !!row.alerts_bot_chat_id,
  };
  return Response.json({ settings });
}

export async function POST(req: NextRequest) {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Partial<Settings> | null;
  if (!body) return Response.json({ error: "Bad JSON" }, { status: 400 });

  // Only the alert/channel fields are writable here.
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.alerts_enabled === "boolean") update.alerts_enabled = body.alerts_enabled;
  if (typeof body.alerts_ppv === "boolean") update.alerts_ppv = body.alerts_ppv;
  if (typeof body.alerts_tips === "boolean") update.alerts_tips = body.alerts_tips;
  if (body.alerts_channel_id !== undefined) update.alerts_channel_id = body.alerts_channel_id;
  if (body.alerts_channel_access_hash !== undefined)
    update.alerts_channel_access_hash = body.alerts_channel_access_hash;
  if (body.alerts_channel_title !== undefined)
    update.alerts_channel_title = body.alerts_channel_title;
  if (body.alerts_sender_model_id !== undefined)
    update.alerts_sender_model_id = body.alerts_sender_model_id;

  const admin = createAdminSupabaseClient();
  // Upsert: works on both first-time write and updates.
  const { error } = await admin
    .from("agency_settings")
    .upsert({ user_id: user.id, ...update }, { onConflict: "user_id" });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
