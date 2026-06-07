import { NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET  /api/eco → { enabled: boolean }
 * POST /api/eco → { enabled: boolean }  (toggle)
 *
 * Eco mode lives on agency_settings.eco_mode_enabled. When ON, the
 * chatter UI bumps its poll intervals by 4× (dialogs 10s → 40s,
 * messages 5s → 20s, activity 3s → 12s). Server-side gramJS event
 * subscriptions are reactive, not polled, so they're unaffected.
 *
 * GET is intentionally cheap (single row, no caching headers) — the UI
 * fetches it once on mount.
 */
export async function GET() {
  const ssr = await createServerSupabaseClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ enabled: false });

  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("agency_settings")
    .select("eco_mode_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  const enabled = !!(data as { eco_mode_enabled?: boolean } | null)?.eco_mode_enabled;
  return Response.json({ enabled });
}

export async function POST(req: NextRequest) {
  const ssr = await createServerSupabaseClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { enabled?: boolean } | null;
  if (typeof body?.enabled !== "boolean") {
    return Response.json({ error: "enabled boolean required" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("agency_settings")
    .upsert(
      {
        user_id: user.id,
        eco_mode_enabled: body.enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, enabled: body.enabled });
}
