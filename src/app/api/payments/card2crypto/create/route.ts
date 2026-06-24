import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import {
  convertToUsd,
  createForwardingAddress,
  buildPayUrl,
  card2cryptoNonce,
} from "@/lib/card2crypto";
import { consume, getClientIp, tooManyRequests } from "@/lib/rate-limit";

export const maxDuration = 30;

/**
 * Open a card2crypto checkout for a PPV/tip pay code (the card2crypto sibling
 * of /api/payments/malum/create).
 *
 * card2crypto forwards 100% to the platform POOL wallet; the webhook later
 * auto-sends 90% to the agency's own wallet. So before we open a checkout we
 * require the agency to have set a payout wallet (otherwise we'd collect their
 * money with nowhere to forward it). Returns { url } — the hosted pay page.
 */

type Body = { code?: string; email?: string };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    if (!consume(`c2c-create|${ip}`, 20, 60_000)) return tooManyRequests(60);

    const body = (await req.json().catch(() => null)) as Body | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!code || code.length < 6 || code.length > 16 || !/^[a-z0-9]+$/.test(code)) {
      return Response.json({ error: "Invalid code" }, { status: 400 });
    }
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return Response.json({ error: "Enter a valid email" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    if (!baseUrl) {
      return Response.json({ error: "Server misconfigured: NEXT_PUBLIC_APP_URL missing" }, { status: 500 });
    }

    // Resolve PPV send first, then tip — and find the owning model so we can
    // check the agency has a payout wallet (where the 90% will be forwarded).
    let amount: number;
    let modelId: string;
    const { data: sendRaw } = await admin
      .from("ppv_sends")
      .select("id, total_price, status, model_id, expires_at")
      .eq("code", code)
      .maybeSingle();

    if (sendRaw) {
      const send = sendRaw as {
        total_price: number | string; status: string; model_id: string; expires_at: string | null;
      };
      if (send.status === "paid" || send.status === "delivered") {
        return Response.json({ error: "This order is already paid" }, { status: 409 });
      }
      if (send.expires_at && Date.now() > new Date(send.expires_at).getTime()) {
        return Response.json({ error: "This offer has expired." }, { status: 410 });
      }
      amount = Math.round(Number(send.total_price ?? 0) * 100) / 100;
      modelId = send.model_id;
    } else {
      const { data: tipRaw } = await admin
        .from("tips").select("amount, status, model_id").eq("code", code).maybeSingle();
      if (!tipRaw) return Response.json({ error: "Not found" }, { status: 404 });
      const tip = tipRaw as { amount: number | string; status: string; model_id: string };
      if (tip.status === "paid") return Response.json({ error: "This tip is already paid" }, { status: 409 });
      amount = Math.round(Number(tip.amount ?? 0) * 100) / 100;
      modelId = tip.model_id;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: "Invalid amount" }, { status: 400 });
    }

    // The agency must have a payout wallet set — that's where card2crypto's
    // 90% is auto-forwarded. Block with a clear message otherwise.
    const { data: model } = await admin
      .from("models").select("agency_user_id").eq("id", modelId).maybeSingle();
    const agencyUserId = (model as { agency_user_id?: string } | null)?.agency_user_id;
    if (!agencyUserId) return Response.json({ error: "Model not found" }, { status: 404 });
    let agencyWallet = "";
    try {
      const { data: u } = await admin.auth.admin.getUserById(agencyUserId);
      agencyWallet = (u?.user?.user_metadata?.payout_address as string) ?? "";
    } catch { /* fall through to the guard below */ }
    if (!/^0x[0-9a-fA-F]{40}$/.test(agencyWallet)) {
      return Response.json(
        { error: "This creator's agency hasn't set a payout wallet yet. Please try the other payment method or ask them to add one." },
        { status: 409 },
      );
    }

    // amount is already USD (chatter prices are USD). convertToUsd is a no-op
    // for USD but kept for symmetry / future non-USD support.
    const usd = await convertToUsd(amount, "USD");

    const nonce = card2cryptoNonce(code);
    const callback = `${baseUrl}/api/webhooks/card2crypto?code=${encodeURIComponent(code)}&nonce=${nonce}`;

    let addressIn: string;
    try {
      const fwd = await createForwardingAddress(callback);
      addressIn = fwd.addressIn;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "card2crypto request failed";
      console.error("[card2crypto/create] gateway error:", msg);
      return Response.json({ error: msg }, { status: 502 });
    }

    const url = buildPayUrl({ addressIn, amountUsd: usd, email });
    return Response.json({ url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    console.error("[card2crypto/create] error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
