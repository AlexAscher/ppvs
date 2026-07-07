import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET /api/ppv/thumb/{ppvId}
 *
 * Public Vault thumbnail. Batch 99a — was originally a 302 to the public
 * Supabase Storage URL, which meant Cloudflare could only cache the tiny
 * redirect header; the browser followed the 302 and burned Supabase egress
 * every fresh visit. Now we PROXY bytes through the Node origin so
 * Cloudflare (or any CDN in front of us) caches the actual image body —
 * subsequent viewers hit the edge, Supabase egress goes to zero after the
 * first cache miss.
 *
 * Resolution order for the source URL:
 *   1. `ppvs.thumb_url` — crisp 400px JPEG (batch 99 uploads; older rows
 *      get one via the client-side lazy backfill in PPVsTab).
 *   2. `ppvs.preview_url` — the blurred pay-page poster. Small and safe as
 *      a stop-gap.
 *   3. 404 → the Vault tile falls back to an empty placeholder.
 *
 * Schema resilience: if the deploy has landed but the migration adding
 * `thumb_url` hasn't been run yet, `.select("thumb_url, ...")` errors on
 * Supabase. We catch that specific case, retry with just `preview_url`,
 * and keep serving the blurred preview so the grid renders.
 *
 * Anonymous: thumbnails are shown in the agency Vault grid AND on the fan
 * pay page. Neither leaks the paywalled original, so auth is unnecessary.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ppvId: string }> },
) {
  const { ppvId } = await params;
  if (!ppvId) return Response.json({ error: "ppvId required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  let thumbUrl: string | null = null;
  let previewUrl: string | null = null;

  const first = await admin
    .from("ppvs")
    .select("thumb_url, preview_url")
    .eq("id", ppvId)
    .maybeSingle();
  if (first.error) {
    // Migration 20260709_ppv_thumb_url.sql hasn't run on this DB yet.
    // Retry without thumb_url so we can still serve preview_url as
    // fallback until the column exists.
    const retry = await admin
      .from("ppvs")
      .select("preview_url")
      .eq("id", ppvId)
      .maybeSingle();
    previewUrl = (retry.data as { preview_url?: string | null } | null)?.preview_url ?? null;
  } else {
    const row = first.data as { thumb_url?: string | null; preview_url?: string | null } | null;
    thumbUrl = row?.thumb_url ?? null;
    previewUrl = row?.preview_url ?? null;
  }

  const target = thumbUrl || previewUrl;
  if (!target) return new Response("No thumb", { status: 404 });

  // Proxy bytes so a CDN in front of us can cache the ACTUAL image body.
  // A prior 302 to the Supabase URL only cached the redirect — every fresh
  // viewer still hit Supabase directly, defeating the point.
  try {
    const upstream = await fetch(target);
    if (!upstream.ok || !upstream.body) {
      return new Response("Upstream error", { status: 502 });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
        // Long CDN cache — after client-side backfill lands, PpvCard bumps
        // a `?v=` query param on the src, which busts both browser and
        // CF cache automatically.
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch (e) {
    console.error("[ppv/thumb] proxy error:", e instanceof Error ? e.message : e);
    return new Response("Fetch failed", { status: 502 });
  }
}
