import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET /api/search?q=...
 *
 * Agency-wide search across the data we store: fan notes, PPV item names,
 * Mass DM history, group names and conversation labels. ILIKE-based
 * (simple + index-friendly enough at this scale). Each category is
 * best-effort and capped so the dropdown stays snappy.
 *
 * Response: { fans, ppvs, campaigns, groups, labels }
 */
export async function GET(req: NextRequest) {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ fans: [], ppvs: [], campaigns: [], groups: [], labels: [] });
  const like = `%${q.replace(/[%_]/g, "")}%`;

  const admin = createAdminSupabaseClient();
  const { data: modelsRaw } = await admin
    .from("models")
    .select("id, name")
    .eq("agency_user_id", user.id);
  const models = (modelsRaw ?? []) as { id: string; name: string }[];
  const modelIds = models.map((m) => m.id);
  const nameByModel = new Map(models.map((m) => [m.id, m.name]));

  async function safe<T>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
    try {
      const r = await p;
      return (r.data ?? []) as T[];
    } catch {
      return [];
    }
  }

  const [fans, ppvs, campaigns, groups, labels] = await Promise.all([
    modelIds.length
      ? safe(
          admin
            .from("fans")
            .select("model_id, peer_id, telegram_username, telegram_name, notes")
            .in("model_id", modelIds)
            .ilike("notes", like)
            .limit(10),
        )
      : Promise.resolve([]),
    modelIds.length
      ? safe(
          admin
            .from("ppvs")
            .select("id, model_id, name")
            .in("model_id", modelIds)
            .ilike("name", like)
            .limit(10),
        )
      : Promise.resolve([]),
    safe(
      admin
        .from("mass_dm_campaigns")
        .select("id, message, created_at, sent_count, total_recipients")
        .eq("agency_user_id", user.id)
        .ilike("message", like)
        .order("created_at", { ascending: false })
        .limit(10),
    ),
    safe(
      admin
        .from("fan_groups")
        .select("id, name, color")
        .eq("agency_user_id", user.id)
        .ilike("name", like)
        .limit(10),
    ),
    safe(
      admin
        .from("conversation_labels")
        .select("id, name, color")
        .eq("agency_user_id", user.id)
        .ilike("name", like)
        .limit(10),
    ),
  ]);

  type FanRow = { model_id: string; peer_id: string; telegram_username: string | null; telegram_name: string | null; notes: string | null };
  type PpvRow = { id: string; model_id: string; name: string };

  return Response.json({
    fans: (fans as FanRow[]).map((f) => ({
      peerId: f.peer_id,
      modelId: f.model_id,
      modelName: nameByModel.get(f.model_id) ?? "Creator",
      name: f.telegram_username ? `@${f.telegram_username}` : f.telegram_name || "Fan",
      snippet: (f.notes ?? "").slice(0, 80),
    })),
    ppvs: (ppvs as PpvRow[]).map((p) => ({
      id: p.id,
      name: p.name,
      modelName: nameByModel.get(p.model_id) ?? "Creator",
    })),
    campaigns,
    groups,
    labels,
  });
}
