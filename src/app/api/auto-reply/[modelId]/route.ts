import { NextRequest } from "next/server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * Auto-reply config per model.
 *
 *   GET  /api/auto-reply/[modelId]
 *     Returns the model's current auto-reply settings.
 *
 *   POST /api/auto-reply/[modelId]
 *     Body: { enabled?, text?, mediaUrl?, mediaType?: 'photo'|'video'|null }
 *     Partial updates: fields not in the body are left untouched. Pass
 *     `mediaUrl: null` to clear the attached file.
 *
 * Media is uploaded by the browser straight to Supabase Storage (same
 * `ppvs` bucket as the vault) — we only persist the resulting public URL
 * here. Keeps the API stateless and dodges a multipart-parsing dependency.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const admin = createAdminSupabaseClient();
    // Tolerate the delay column being missing on older schemas (migration
    // 20260615 may not have been run yet) by selecting *, then defaulting.
    const { data, error } = await admin
      .from("models")
      .select("*")
      .eq("id", modelId)
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const row = (data ?? {}) as {
      auto_reply_enabled?: boolean | null;
      auto_reply_text?: string | null;
      auto_reply_media_url?: string | null;
      auto_reply_media_type?: string | null;
      auto_reply_delay_sec?: number | null;
    };
    return Response.json({
      enabled: row.auto_reply_enabled ?? false,
      text: row.auto_reply_text ?? "",
      mediaUrl: row.auto_reply_media_url ?? null,
      mediaType: row.auto_reply_media_type ?? null,
      delaySec: row.auto_reply_delay_sec ?? 0,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

type UpsertBody = {
  enabled?: boolean;
  text?: string;
  mediaUrl?: string | null;
  mediaType?: "photo" | "video" | null;
  delaySec?: number;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const body = (await req.json().catch(() => null)) as UpsertBody | null;
    if (!body) return Response.json({ error: "Body required" }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (typeof body.enabled === "boolean") patch.auto_reply_enabled = body.enabled;
    if (typeof body.text === "string") patch.auto_reply_text = body.text.slice(0, 4096);
    // mediaUrl undefined → leave alone. mediaUrl explicit null → clear it.
    if (body.mediaUrl === null) {
      patch.auto_reply_media_url = null;
      patch.auto_reply_media_type = null;
    } else if (typeof body.mediaUrl === "string") {
      patch.auto_reply_media_url = body.mediaUrl;
      patch.auto_reply_media_type =
        body.mediaType === "photo" || body.mediaType === "video"
          ? body.mediaType
          : null;
    }
    if (typeof body.delaySec === "number" && Number.isFinite(body.delaySec)) {
      // Clamp delay to 0..3600 (1 hour). Anything past that is almost
      // certainly a UI mistake — and the in-process setTimeout we use to
      // honour it doesn't survive process restarts.
      patch.auto_reply_delay_sec = Math.max(0, Math.min(3600, Math.round(body.delaySec)));
    }

    if (Object.keys(patch).length === 0) {
      return Response.json({ ok: true, noop: true });
    }

    const admin = createAdminSupabaseClient();
    const { error } = await admin.from("models").update(patch).eq("id", modelId);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
