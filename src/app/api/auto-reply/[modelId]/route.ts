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
    const { data, error } = await admin
      .from("models")
      .select("auto_reply_enabled, auto_reply_text, auto_reply_media_url, auto_reply_media_type")
      .eq("id", modelId)
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const row = (data ?? {}) as {
      auto_reply_enabled?: boolean | null;
      auto_reply_text?: string | null;
      auto_reply_media_url?: string | null;
      auto_reply_media_type?: string | null;
    };
    return Response.json({
      enabled: row.auto_reply_enabled ?? false,
      text: row.auto_reply_text ?? "",
      mediaUrl: row.auto_reply_media_url ?? null,
      mediaType: row.auto_reply_media_type ?? null,
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
