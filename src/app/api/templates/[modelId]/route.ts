import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";

/**
 * Quick-reply templates per model. The agency owner manages them
 * (create/edit/delete); chatters consume them read-only.
 *
 *   GET    → list templates for the model, ordered by sort_order
 *   POST   → create { title, body, sortOrder? } — agency only
 *   PUT    → update { id, title?, body?, sortOrder? } — agency only
 *   DELETE → ?id=…  — agency only
 *
 * Authorization is done via `authorizeModelAccess`, which already
 * distinguishes owner (agency) from delegate (chatter). For write ops we
 * additionally require the caller to be the agency owner.
 */

export type TemplateRow = {
  id: string;
  model_id: string;
  title: string;
  body: string;
  sort_order: number;
  created_at: string;
};

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
      .from("quick_reply_templates")
      .select("*")
      .eq("model_id", modelId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ templates: (data ?? []) as TemplateRow[] });
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

function ensureAgencyOwner(
  auth: { userId: string; model: { agency_user_id: string } },
): Response | null {
  if (auth.model.agency_user_id !== auth.userId) {
    return Response.json({ error: "Agency owner only" }, { status: 403 });
  }
  return null;
}

type CreateBody = { title: string; body: string; sortOrder?: number };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;
    const forbidden = ensureAgencyOwner(auth);
    if (forbidden) return forbidden;

    const body = (await req.json().catch(() => null)) as CreateBody | null;
    if (!body || !body.title?.trim() || !body.body?.trim()) {
      return Response.json({ error: "title and body required" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("quick_reply_templates")
      .insert({
        model_id: modelId,
        title: body.title.trim(),
        body: body.body,
        sort_order: body.sortOrder ?? 0,
      })
      .select("*")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ template: data as TemplateRow });
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

type UpdateBody = { id: string; title?: string; body?: string; sortOrder?: number };

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;
    const forbidden = ensureAgencyOwner(auth);
    if (forbidden) return forbidden;

    const body = (await req.json().catch(() => null)) as UpdateBody | null;
    if (!body?.id) {
      return Response.json({ error: "id required" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title.trim();
    if (body.body !== undefined) patch.body = body.body;
    if (body.sortOrder !== undefined) patch.sort_order = body.sortOrder;

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("quick_reply_templates")
      .update(patch)
      .eq("id", body.id)
      .eq("model_id", modelId)
      .select("*")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ template: data as TemplateRow });
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;
    const forbidden = ensureAgencyOwner(auth);
    if (forbidden) return forbidden;

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    const admin = createAdminSupabaseClient();
    const { error } = await admin
      .from("quick_reply_templates")
      .delete()
      .eq("id", id)
      .eq("model_id", modelId);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true });
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
