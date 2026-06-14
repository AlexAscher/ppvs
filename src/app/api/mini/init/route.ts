import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { verifyInitData, InitDataInvalidError } from "@/lib/telegram-webapp";
import { PLATFORM_FEE_PCT } from "@/lib/platform";

/**
 * POST /api/mini/init { initData, startParam }
 *
 * Mini App boot endpoint. Verifies Telegram-supplied initData via HMAC,
 * resolves startParam (a PPV or tip code) to a checkout payload the
 * client renders.
 *
 * Returns { kind: 'ppv'|'tip', code, items?, caption?, recipient?,
 *           basePrice, total, status }.
 */

type PpvSendRow = {
  id: string;
  total_price: number | string;
  caption: string | null;
  peer_username: string | null;
  status: string;
};
type ItemRowRaw = {
  ordinal: number;
  ppvs:
    | { id: string; name: string; preview_url: string | null }
    | { id: string; name: string; preview_url: string | null }[]
    | null;
};
type TipRow = {
  amount: number | string;
  message: string | null;
  peer_username: string | null;
  status: string;
  model_id: string | null;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    initData?: string;
    startParam?: string;
  } | null;
  if (!body) return Response.json({ error: "Bad JSON" }, { status: 400 });

  // Verify auth — required for production. In dev (no bot configured)
  // we still allow the client to render so the page can be tested.
  let trusted = false;
  try {
    if (body.initData) {
      verifyInitData(body.initData);
      trusted = true;
    }
  } catch (e) {
    if (e instanceof InitDataInvalidError) {
      // Bot not configured (missing TELEGRAM_BOT_TOKEN) → soft-fail so
      // the page still works during local testing.
      if (!/not set/i.test(e.message)) {
        return Response.json({ error: e.message }, { status: 401 });
      }
    } else {
      throw e;
    }
  }

  const code = (body.startParam ?? "").trim();
  if (!code) return Response.json({ error: "missing startParam" }, { status: 400 });
  if (!/^[a-z0-9_-]{4,32}$/i.test(code)) {
    return Response.json({ error: "invalid code" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // Try PPV first (most common), then tip.
  const { data: ppvRaw } = await admin
    .from("ppv_sends")
    .select("id, total_price, caption, peer_username, status")
    .eq("code", code)
    .maybeSingle();
  if (ppvRaw) {
    const send = ppvRaw as PpvSendRow;
    const { data: itemsRaw } = await admin
      .from("ppv_send_items")
      .select("ordinal, ppvs(id, name, preview_url)")
      .eq("send_id", send.id)
      .order("ordinal", { ascending: true });
    const items = ((itemsRaw ?? []) as unknown as ItemRowRaw[]).map((it) => {
      const ppv = Array.isArray(it.ppvs) ? it.ppvs[0] ?? null : it.ppvs;
      return {
        name: ppv?.name ?? "Item",
        // Preview via the public signed-url endpoint (private-bucket-ready).
        media_url: ppv?.preview_url && ppv?.id ? `/api/ppv/file/${ppv.id}?kind=preview` : null,
      };
    });
    const basePrice = Number(send.total_price ?? 0);
    const total = Math.round(basePrice * (1 + PLATFORM_FEE_PCT) * 100) / 100;
    return Response.json({
      kind: "ppv",
      code,
      items,
      basePrice,
      total,
      caption: send.caption ?? "",
      recipient: send.peer_username,
      status: send.status,
      trusted,
    });
  }

  const { data: tipRaw } = await admin
    .from("tips")
    .select("amount, message, peer_username, status, model_id")
    .eq("code", code)
    .maybeSingle();
  if (tipRaw) {
    const tip = tipRaw as TipRow;
    // Resolve the CREATOR's @ for the success screen. `peer_username` is
    // the FAN's handle (Telegram peer = the user the tip link was sent
    // to), so using it in "Tip delivered to @x" wrongly shows the buyer
    // their own username. We want the model's @.
    let creatorUsername: string | null = null;
    if (tip.model_id) {
      const { data: m } = await admin
        .from("models")
        .select("username")
        .eq("id", tip.model_id)
        .maybeSingle();
      creatorUsername = (m as { username: string | null } | null)?.username ?? null;
    }
    return Response.json({
      kind: "tip",
      code,
      basePrice: Number(tip.amount ?? 0),
      total: Number(tip.amount ?? 0),
      caption: tip.message ?? "",
      recipient: tip.peer_username,
      creatorUsername,
      status: tip.status,
      trusted,
    });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
