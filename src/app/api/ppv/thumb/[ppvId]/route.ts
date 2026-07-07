import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET /api/ppv/thumb/{ppvId}
 *
 * Public thumbnail for the Vault grid. Batch 99 introduced a dedicated
 * `thumb_url` (400px q70, ≈20 KB) so grids stop pulling the multi-MB
 * original per tile — the main cause of the 2026-07-07 Supabase egress
 * overage. Fallback path preserves the previous behaviour for rows that
 * don't yet have a thumb generated.
 *
 * Resolution order:
 *   1. `ppvs.thumb_url`  — the crisp small JPEG (new uploads always have it;
 *      old uploads get one via the client-side lazy backfill hook in
 *      PPVsTab / any component that renders the tile).
 *   2. `ppvs.preview_url` — the blurred pay-page poster. Small enough to
 *      keep egress low; visually blurry — fine as a stop-gap on old rows.
 *   3. 404 — the Vault tile falls back to a generic placeholder.
 *
 * Anonymous: like `/api/ppv/file?kind=preview`, thumbnails are shown in
 * the agency-facing Vault grid AND on the fan-facing pay page (as a
 * lower-egress alternative to the blurred preview). Neither leaks the
 * original content so auth is unnecessary.
 *
 * Cache: long — thumbnails are immutable per-PPV. Cloudflare (once
 * onboarded per P0-5) will serve subsequent requests from the edge.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ppvId: string }> },
) {
  const { ppvId } = await params;
  if (!ppvId) return Response.json({ error: "ppvId required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data: ppv } = await admin
    .from("ppvs")
    .select("thumb_url, preview_url")
    .eq("id", ppvId)
    .maybeSingle();

  const row = ppv as { thumb_url?: string | null; preview_url?: string | null } | null;
  const target = row?.thumb_url || row?.preview_url;
  if (!target) return new Response("No thumb", { status: 404 });

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      // Immutable per-PPV — the URL changes when a new thumb is generated
      // (client-side backfill uploads to a fresh path and updates the row).
      // 1 day browser cache is safe; CDN can cache much longer since it
      // keys on the ppvId and the target URL flips atomically in DB.
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
}
