import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { sendAdminVaultAlert } from "@/lib/sales-alerts";

/**
 * POST /api/vault/notify  { modelId, count }
 *
 * Client calls this after a Vault upload (single form or bulk) so every
 * connected admin channel gets one grouped alert with the model + item
 * count instead of one alert per file. Fire-and-forget on the client;
 * this endpoint returns fast and swallows any failure.
 *
 * Authorized just like the send / edit paths — only the agency owner or a
 * linked chatter can fire the alert for a given model.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      modelId?: string;
      count?: number;
    } | null;
    const modelId = (body?.modelId ?? "").toString();
    const count = Math.max(1, Math.floor(Number(body?.count ?? 1)));
    if (!modelId) return Response.json({ error: "modelId required" }, { status: 400 });

    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const admin = createAdminSupabaseClient();
    const { data: modelRow } = await admin
      .from("models")
      .select("name, agency_user_id")
      .eq("id", modelId)
      .maybeSingle();
    const modelName = (modelRow as { name?: string | null } | null)?.name ?? null;
    const agencyId = (modelRow as { agency_user_id?: string | null } | null)?.agency_user_id ?? null;

    let agencyName: string | null = null;
    if (agencyId) {
      try {
        const { data: u } = await admin.auth.admin.getUserById(agencyId);
        const md = (u?.user?.user_metadata ?? {}) as Record<string, unknown>;
        agencyName =
          (md.agency_name as string | undefined)?.trim() ||
          (md.display_name as string | undefined)?.trim() ||
          u?.user?.email?.split("@")[0] ||
          null;
      } catch { /* best-effort */ }
    }

    sendAdminVaultAlert({ agencyName, modelName, count });
    return Response.json({ ok: true });
  } catch (e: unknown) {
    // Never block the caller on an alert-side failure.
    console.error("[vault/notify] error:", e instanceof Error ? e.message : e);
    return Response.json({ ok: true, silent: true });
  }
}
