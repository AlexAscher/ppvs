import { NextRequest } from "next/server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * Auto-reply config per model.
 *
 *   GET  /api/auto-reply/[modelId]
 *     Returns { enabled, text, delaySec, stars, ppvIds }.
 *
 *   POST /api/auto-reply/[modelId]
 *     Body: { enabled?, text?, delaySec?, stars?, ppvIds? }
 *     Partial updates. Media now comes from the Vault (ppvIds) exclusively —
 *     the legacy mediaUrl/mediaType upload path was retired in batch 93c.
 */

const MAX_STARS = 10_000;
const MAX_PPVS_PER_AR = 10;

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
      .select("*")
      .eq("id", modelId)
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const row = (data ?? {}) as {
      auto_reply_enabled?: boolean | null;
      auto_reply_text?: string | null;
      auto_reply_delay_sec?: number | null;
      auto_reply_stars?: number | null;
      auto_reply_ppv_ids?: string[] | null;
    };
    return Response.json({
      enabled: row.auto_reply_enabled ?? false,
      text: row.auto_reply_text ?? "",
      // 60 = 1 min default (see batch 93b — the design mock asks the switch
      // to land pre-selected on "1 min", not "instant").
      delaySec: row.auto_reply_delay_sec ?? 60,
      stars: Number(row.auto_reply_stars ?? 0),
      ppvIds: Array.isArray(row.auto_reply_ppv_ids) ? row.auto_reply_ppv_ids : [],
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

type UpsertBody = {
  enabled?: boolean;
  text?: string;
  delaySec?: number;
  stars?: number;
  ppvIds?: string[];
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
    if (typeof body.delaySec === "number" && Number.isFinite(body.delaySec)) {
      patch.auto_reply_delay_sec = Math.max(0, Math.min(3600, Math.round(body.delaySec)));
    }
    if (typeof body.stars === "number" && Number.isFinite(body.stars)) {
      patch.auto_reply_stars = Math.max(0, Math.min(MAX_STARS, Math.round(body.stars)));
    }
    if (Array.isArray(body.ppvIds)) {
      const cleaned = body.ppvIds
        .filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{10,}$/i.test(x))
        .slice(0, MAX_PPVS_PER_AR);
      patch.auto_reply_ppv_ids = cleaned;
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
