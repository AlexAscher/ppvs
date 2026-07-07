import { NextRequest } from "next/server";
import { getCachedAuthUser } from "@/lib/auth-cache";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * POST /api/ppv/thumb/upload
 *
 * Endpoint the client-side lazy-backfill hook posts to after generating a
 * thumbnail for an OLD PPV row that shipped before batch 99 (no
 * `thumb_url`). The browser canvas-resizes the existing original once, POSTs
 * the resulting ~20 KB JPEG here, we upload it to the `ppvs` bucket and
 * write the URL back to the row. Every subsequent Vault view — for anyone
 * — then hits the thumb path instead of the original.
 *
 * Body: multipart/form-data
 *   - ppvId: uuid string
 *   - thumb: image/jpeg file (≤ 200 KB — client generates ~20 KB)
 *
 * Auth: the caller must be the agency owner of the PPV's model. Chatters
 * and admins are excluded on purpose — the backfill fires from the
 * agency's Vault view, and letting other roles write to `ppvs.thumb_url`
 * would widen the trust surface unnecessarily.
 *
 * Idempotent: if `thumb_url` is already set the endpoint no-ops (returns
 * { alreadyHadThumb: true }) so races between two tabs don't fight.
 */

const MAX_THUMB_BYTES = 200 * 1024;

export async function POST(req: NextRequest) {
  try {
    const user = await getCachedAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData().catch(() => null);
    if (!form) return Response.json({ error: "Bad form" }, { status: 400 });
    const ppvId = String(form.get("ppvId") ?? "").trim();
    const thumb = form.get("thumb");
    if (!ppvId) return Response.json({ error: "ppvId required" }, { status: 400 });
    if (!(thumb instanceof File)) return Response.json({ error: "thumb required" }, { status: 400 });
    if (thumb.size === 0 || thumb.size > MAX_THUMB_BYTES) {
      return Response.json({ error: "Thumb size out of range" }, { status: 400 });
    }
    if (thumb.type && !thumb.type.startsWith("image/")) {
      return Response.json({ error: "Thumb must be an image" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { data: ppv } = await admin
      .from("ppvs")
      .select("id, agency_user_id, model_id, thumb_url")
      .eq("id", ppvId)
      .maybeSingle();
    if (!ppv) return Response.json({ error: "Not found" }, { status: 404 });
    const row = ppv as {
      agency_user_id: string;
      model_id: string;
      thumb_url: string | null;
    };
    if (row.agency_user_id !== user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (row.thumb_url) {
      return Response.json({ ok: true, alreadyHadThumb: true, thumbUrl: row.thumb_url });
    }

    const bytes = new Uint8Array(await thumb.arrayBuffer());
    const path = `${row.agency_user_id}/${ppvId}_thumb.jpg`;
    const { error: upErr } = await admin.storage
      .from("ppvs")
      .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
    if (upErr) {
      console.error("[ppv/thumb/upload] upload failed:", upErr.message);
      return Response.json({ error: "Upload failed" }, { status: 500 });
    }
    const publicUrl = admin.storage.from("ppvs").getPublicUrl(path).data.publicUrl;

    const { error: updErr } = await admin
      .from("ppvs")
      .update({ thumb_url: publicUrl })
      .eq("id", ppvId);
    if (updErr) {
      console.error("[ppv/thumb/upload] DB update failed:", updErr.message);
      return Response.json({ error: "Save failed" }, { status: 500 });
    }
    return Response.json({ ok: true, thumbUrl: publicUrl });
  } catch (e) {
    console.error("[ppv/thumb/upload] error:", e instanceof Error ? e.message : e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
