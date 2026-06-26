import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { createStarsInvoiceLink, usdToStars } from "@/lib/stars";
import { consume, getClientIp, tooManyRequests } from "@/lib/rate-limit";

export const maxDuration = 30;

/**
 * Build a Telegram Stars invoice link for a PPV/tip pay code. The Mini App
 * opens the returned link with Telegram.WebApp.openInvoice(). Payment is
 * settled by Telegram; the bot webhook delivers on `successful_payment`.
 *
 * Returns { link, stars }.
 */

type Body = { code?: string };

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    if (!consume(`stars-create|${ip}`, 20, 60_000)) return tooManyRequests(60);

    const body = (await req.json().catch(() => null)) as Body | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code || code.length < 6 || code.length > 16 || !/^[a-z0-9]+$/.test(code)) {
      return Response.json({ error: "Invalid code" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();

    // PPV send first, then tip. amount is the chatter's USD price.
    const { data: sendRaw } = await admin
      .from("ppv_sends")
      .select("total_price, status, caption, expires_at")
      .eq("code", code)
      .maybeSingle();

    let amount: number;
    let title: string;
    let description: string;

    if (sendRaw) {
      const send = sendRaw as {
        total_price: number | string; status: string; caption: string | null; expires_at: string | null;
      };
      if (send.status === "paid" || send.status === "delivered") {
        return Response.json({ error: "This order is already paid" }, { status: 409 });
      }
      if (send.expires_at && Date.now() > new Date(send.expires_at).getTime()) {
        return Response.json({ error: "This offer has expired." }, { status: 410 });
      }
      amount = Math.round(Number(send.total_price ?? 0) * 100) / 100;
      title = "Unlock content";
      description = send.caption?.trim() || "Unlock your private content";
    } else {
      const { data: tipRaw } = await admin
        .from("tips").select("amount, status, message").eq("code", code).maybeSingle();
      if (!tipRaw) return Response.json({ error: "Not found" }, { status: 404 });
      const tip = tipRaw as { amount: number | string; status: string; message: string | null };
      if (tip.status === "paid") return Response.json({ error: "This tip is already paid" }, { status: 409 });
      amount = Math.round(Number(tip.amount ?? 0) * 100) / 100;
      title = "Send a tip";
      description = tip.message?.trim() || "Send a tip";
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: "Invalid amount" }, { status: 400 });
    }

    const stars = usdToStars(amount);
    let link: string;
    try {
      link = await createStarsInvoiceLink({ title, description, payload: code, stars });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Telegram request failed";
      console.error("[stars/create] invoice error:", msg);
      return Response.json({ error: msg }, { status: 502 });
    }

    return Response.json({ link, stars });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    console.error("[stars/create] error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
