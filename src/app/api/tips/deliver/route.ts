import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { consume, getClientIp, tooManyRequests } from "@/lib/rate-limit";

type TipRow = { status: string };

/**
 * POST /api/tips/deliver — READ-ONLY status probe for the /tip page.
 *
 * Payment authorisation lives in the Telegram Stars webhook path
 * (/api/webhooks/telegram → fulfillTipPaid). This endpoint no longer marks
 * anything paid; it only reports whether the Stars webhook has already
 * closed out the tip. Unpaid codes get 402.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    if (!consume(`tip-deliver|${ip}`, 20, 60_000)) return tooManyRequests(60);

    const body = (await req.json().catch(() => null)) as { code?: string } | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code || code.length < 6 || code.length > 20 || !/^[a-z0-9]+$/.test(code)) {
      return Response.json({ error: "Invalid code" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();

    const { data: tip, error } = await admin
      .from("tips")
      .select("status")
      .eq("code", code)
      .maybeSingle();

    if (error) return Response.json({ error: `DB: ${error.message}` }, { status: 500 });
    if (!tip) return Response.json({ error: "Not found" }, { status: 404 });

    const tipRow = tip as TipRow;
    if (tipRow.status !== "paid") {
      return Response.json(
        {
          error: "This tip has not been paid yet. Complete the payment in Telegram.",
          status: tipRow.status,
        },
        { status: 402 },
      );
    }

    return Response.json({ ok: true, alreadyPaid: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[tips/deliver POST] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
