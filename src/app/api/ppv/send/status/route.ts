import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { withTimeout } from "@/lib/with-timeout";
import { consume, getClientIp, tooManyRequests } from "@/lib/rate-limit";

const STATUS_QUERY_TIMEOUT_MS = 12_000;

/**
 * Cheap polling endpoint for the chatter UI to follow a background
 * PPV send. No auth — the `code` is the bearer secret (same as /pay/{code}).
 *
 * Returns: { status: 'pending'|'sending'|'sent'|'paid'|'delivered'|'failed', error?: string }
 */
export async function GET(req: NextRequest) {
  try {
    // The code is a bearer secret; cap polling per IP so it can't be used to
    // brute-force-scan codes. Generous because the chatter UI polls actively.
    const ip = getClientIp(req);
    if (!consume(`ppv-status|${ip}`, 120, 60_000)) return tooManyRequests(30);

    const code = new URL(req.url).searchParams.get("code");
    if (!code) return Response.json({ error: "code required" }, { status: 400 });

    const admin = createAdminSupabaseClient();
    let data: { status: string; error: string | null } | null;
    let error: { message: string } | null;
    try {
      const res = await withTimeout(
        Promise.resolve(
          admin.from("ppv_sends").select("status, error").eq("code", code).maybeSingle(),
        ),
        STATUS_QUERY_TIMEOUT_MS,
        "send-status query",
      );
      data = res.data as { status: string; error: string | null } | null;
      error = res.error;
    } catch {
      // Timed out — report a transient 'sending' so the client keeps
      // polling instead of treating it as a hard failure.
      return Response.json({ status: "sending" });
    }
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "Not found" }, { status: 404 });

    return Response.json({ status: data.status, error: data.error });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
