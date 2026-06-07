import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { materializeRecipients, type Filters } from "@/lib/mass-dm";

/**
 * POST /api/mass-dm/preview { modelId, filters }
 *
 * Returns { count, sample } — count of fans matching the filter snapshot,
 * plus the first 8 by total_spent for the UI preview.
 */
export async function POST(req: NextRequest) {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    modelId?: string;
    filters?: Filters;
  } | null;
  if (!body?.modelId) return Response.json({ error: "modelId required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data: m } = await admin
    .from("models")
    .select("id, agency_user_id")
    .eq("id", body.modelId)
    .maybeSingle();
  if (!m || (m as { agency_user_id: string }).agency_user_id !== user.id) {
    return Response.json({ error: "Model not yours" }, { status: 403 });
  }

  const fans = await materializeRecipients(admin, body.modelId, body.filters ?? {});
  const sample = fans
    .slice()
    .sort((a, b) => Number(b.total_spent ?? 0) - Number(a.total_spent ?? 0))
    .slice(0, 8)
    .map((f) => ({
      name: f.telegram_username
        ? `@${f.telegram_username}`
        : f.telegram_name || "Fan",
      spent: Number(f.total_spent ?? 0),
    }));

  return Response.json({ count: fans.length, sample });
}
