import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getCachedAuthUser } from "@/lib/auth-cache";
import { withTelegramClient } from "@/lib/telegram-pool";

/**
 * GET /api/creators/connection-status?modelIds=a,b,c
 *
 * For each model the agency owns, returns whether @ppvstarbot is currently
 * connected via Telegram Business Chat Automation. Used by the Creators page
 * to show a per-model badge and the "connect" instructions when missing.
 *
 *   { statuses: { [modelId]: { connected: boolean, tgUserId: string | null } } }
 *
 * Model TG user id is resolved lazily on first call via gramJS getMe and
 * cached on models.tg_user_id so subsequent calls are a single DB query.
 */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = await getCachedAuthUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const idsParam = new URL(req.url).searchParams.get("modelIds") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return Response.json({ statuses: {} });

  const admin = createAdminSupabaseClient();
  const { data: rows, error } = await admin
    .from("models")
    .select("id, agency_user_id, tg_user_id, session_string, api_id, api_hash, session_status")
    .in("id", ids)
    .eq("agency_user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const statuses: Record<string, { connected: boolean; tgUserId: string | null }> = {};
  await Promise.all(
    (rows ?? []).map(async (m) => {
      const row = m as {
        id: string; tg_user_id: string | null; session_string: string;
        api_id: number; api_hash: string; session_status?: string | null;
      };
      let tgUserId = row.tg_user_id;
      if (!tgUserId && row.session_status !== "expired") {
        try {
          tgUserId = await withTelegramClient(
            row.id, row.session_string, row.api_id, row.api_hash,
            async (tg) => {
              const me = await tg.getMe();
              return me && "id" in me && me.id != null ? me.id.toString() : null;
            },
            10_000,
          );
          if (tgUserId) {
            await admin.from("models").update({ tg_user_id: tgUserId }).eq("id", row.id);
          }
        } catch {
          tgUserId = null;
        }
      }
      let connected = false;
      if (tgUserId) {
        const { data: bc } = await admin
          .from("business_connections")
          .select("connection_id")
          .eq("tg_user_id", tgUserId)
          .eq("is_enabled", true)
          .eq("can_reply", true)
          .limit(1)
          .maybeSingle();
        connected = !!bc;
      }
      statuses[row.id] = { connected, tgUserId };
    }),
  );

  return Response.json({ statuses });
}
