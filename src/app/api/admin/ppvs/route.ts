import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/ppvs?agencyId=&modelId=&status=&limit=
 *
 * Platform-admin view of every PPV uploaded by any agency. Used by the
 * Vault section inside the agency drill-down (filters scoped to one
 * agency_user_id) and by the global review queue (no agency filter +
 * status=pending). Defaults to "pending first, newest first" so the
 * review queue surfaces the oldest unhandled item near the top.
 */

export type AdminPpvRow = {
  id: string;
  name: string;
  description: string | null;
  media_url: string | null;
  preview_url: string | null;
  created_at: string;
  review_status: "pending" | "approved" | "rejected";
  review_notes: string | null;
  reviewed_at: string | null;
  agency: { id: string; name: string | null; email: string | null };
  model: { id: string; name: string };
  group: { id: string; name: string } | null;
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const url = new URL(req.url);
  const agencyId = url.searchParams.get("agencyId");
  const modelId = url.searchParams.get("modelId");
  const status = url.searchParams.get("status"); // 'pending'|'approved'|'rejected'
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 200)));

  const admin = createAdminSupabaseClient();

  // Pull PPV rows with their group + model (relationship joins). Agency
  // lookup happens after — agencies live in auth.users which doesn't join
  // cleanly into the PostgREST query.
  let q = admin
    .from("ppvs")
    .select(
      "id, name, description, media_url, preview_url, created_at, review_status, review_notes, reviewed_at, agency_user_id, model_id, group_id, models(name), ppv_groups(name)",
    )
    .order("review_status", { ascending: true }) // 'pending' < 'approved' < 'rejected' alphabetically
    .order("created_at", { ascending: false })
    .limit(limit);
  if (agencyId) q = q.eq("agency_user_id", agencyId);
  if (modelId) q = q.eq("model_id", modelId);
  if (status && ["pending", "approved", "rejected"].includes(status)) {
    q = q.eq("review_status", status);
  }

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  type RawRow = {
    id: string;
    name: string;
    description: string | null;
    media_url: string | null;
    preview_url: string | null;
    created_at: string;
    review_status: "pending" | "approved" | "rejected";
    review_notes: string | null;
    reviewed_at: string | null;
    agency_user_id: string;
    model_id: string;
    group_id: string | null;
    models: { name?: string | null } | { name?: string | null }[] | null;
    ppv_groups: { name?: string | null } | { name?: string | null }[] | null;
  };
  const rows = (data ?? []) as RawRow[];

  // Batch-resolve agency identities so the table can show "Agency Name (email)".
  const agencyIds = [...new Set(rows.map((r) => r.agency_user_id))];
  const agencyMap = new Map<string, { name: string | null; email: string | null }>();
  for (const id of agencyIds) {
    try {
      const u = await admin.auth.admin.getUserById(id);
      const md = (u.data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      agencyMap.set(id, {
        name: (md.agency_name as string | undefined) ?? null,
        email: u.data?.user?.email ?? null,
      });
    } catch {
      agencyMap.set(id, { name: null, email: null });
    }
  }

  const items: AdminPpvRow[] = rows.map((r) => {
    const modelObj = Array.isArray(r.models) ? r.models[0] : r.models;
    const groupObj = Array.isArray(r.ppv_groups) ? r.ppv_groups[0] : r.ppv_groups;
    const agencyInfo = agencyMap.get(r.agency_user_id) ?? { name: null, email: null };
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      media_url: r.media_url,
      preview_url: r.preview_url,
      created_at: r.created_at,
      review_status: r.review_status,
      review_notes: r.review_notes,
      reviewed_at: r.reviewed_at,
      agency: { id: r.agency_user_id, name: agencyInfo.name, email: agencyInfo.email },
      model: { id: r.model_id, name: modelObj?.name ?? "Creator" },
      group: r.group_id && groupObj ? { id: r.group_id, name: groupObj.name ?? "Group" } : null,
    };
  });

  // Pending count is cheap to compute server-side too — useful for the
  // header badge on the admin Overview tab.
  let pendingCount: number | null = null;
  if (!status) {
    const { count } = await admin
      .from("ppvs")
      .select("id", { count: "exact", head: true })
      .eq("review_status", "pending");
    pendingCount = count ?? 0;
  }

  return Response.json({ items, pendingCount });
}
