import { NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";

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
};

export async function GET() {
  const ssr = await createServerSupabaseClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();
  let { data } = await admin
    .from("agency_settings")
    .select(
      "alerts_enabled, alerts_ppv, alerts_tips, alerts_channel_id, alerts_channel_access_hash, alerts_channel_title, alerts_sender_model_id",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) {
    // Auto-provision a default row on first read.
    await admin.from("agency_settings").insert({ user_id: user.id });
    const { data: created } = await admin
      .from("agency_settings")
      .select(
        "alerts_enabled, alerts_ppv, alerts_tips, alerts_channel_id, alerts_channel_access_hash, alerts_channel_title, alerts_sender_model_id",
      )
      .eq("user_id", user.id)
      .maybeSingle();
    data = created;
  }

  return Response.json({ settings: (data ?? null) as Settings | null });
}

export async function POST(req: NextRequest) {
  const ssr = await createServerSupabaseClient();
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
