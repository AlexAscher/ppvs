import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * Cheap polling endpoint for the chatter UI to follow a background
 * PPV send. No auth — the `code` is the bearer secret (same as /pay/{code}).
 *
 * Returns: { status: 'pending'|'sending'|'sent'|'paid'|'delivered'|'failed', error?: string }
 */
export async function GET(req: NextRequest) {
  try {
    const code = new URL(req.url).searchParams.get("code");
    if (!code) return Response.json({ error: "code required" }, { status: 400 });

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("ppv_sends")
      .select("status, error")
      .eq("code", code)
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "Not found" }, { status: 404 });

    const row = data as { status: string; error: string | null };
    return Response.json({ status: row.status, error: row.error });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
