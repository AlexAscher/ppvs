import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { withTimeout } from "@/lib/with-timeout";
import { consume, getClientIp, tooManyRequests } from "@/lib/rate-limit";

export const maxDuration = 30;

// Cap each critical-path Supabase call so a flaky uplink can't pin the
// fan's status check for 70s. On timeout we 503 fast and the client retries.
const DELIVER_QUERY_TIMEOUT_MS = 15_000;

type DeliverBody = { code: string };

type SendRow = {
  id: string;
  status: string;
  caption: string | null;
};

type ItemRowRaw = {
  ordinal: number;
  ppvs:
    | { id: string; name: string; media_url: string | null }
    | { id: string; name: string; media_url: string | null }[]
    | null;
};

export type DeliverItem = {
  name: string;
  mediaUrl: string;
  isVideo: boolean;
};

function isLikelyVideoUrl(url: string): boolean {
  const u = url.toLowerCase().split("?")[0];
  return /\.(mp4|mov|webm|m4v|mkv)$/.test(u);
}

/**
 * READ-ONLY status/reveal endpoint for the /pay page.
 *
 * Payment authorisation lives in the Telegram Stars webhook path
 * (/api/webhooks/telegram → fulfillPpvPaid). This endpoint no longer mutates
 * state — it only returns the originals list for a send that has ALREADY
 * been marked paid/delivered by the webhook. Any unpaid code gets 402.
 *
 * Why: the previous version marked the send `paid` on a bare code POST,
 * which turned the pay code into a self-authenticating bearer secret that
 * could be replayed to mint balance and reveal content without a real
 * Stars payment.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    if (!consume(`deliver|${ip}`, 20, 60_000)) return tooManyRequests(60);

    const body = (await req.json().catch(() => null)) as DeliverBody | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code || code.length < 6 || code.length > 16 || !/^[a-z0-9]+$/.test(code)) {
      return Response.json({ error: "Invalid code" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();

    let sendRaw: SendRow | null;
    let itemsRaw: unknown;
    try {
      const sendRes = await withTimeout(
        Promise.resolve(
          admin.from("ppv_sends").select("id, status, caption").eq("code", code).maybeSingle(),
        ),
        DELIVER_QUERY_TIMEOUT_MS,
        "deliver: load send",
      );
      if (sendRes.error) return Response.json({ error: `DB: ${sendRes.error.message}` }, { status: 500 });
      sendRaw = sendRes.data as SendRow | null;
      if (!sendRaw) return Response.json({ error: "Not found" }, { status: 404 });

      // Only reveal originals once the Stars webhook has marked the order paid.
      if (sendRaw.status !== "paid" && sendRaw.status !== "delivered") {
        return Response.json(
          {
            error: "This order is not paid yet. Complete the payment in Telegram to unlock the content.",
            status: sendRaw.status,
          },
          { status: 402 },
        );
      }

      const itemsRes = await withTimeout(
        Promise.resolve(
          admin
            .from("ppv_send_items")
            .select("ordinal, ppvs(id, name, media_url)")
            .eq("send_id", sendRaw.id)
            .order("ordinal", { ascending: true }),
        ),
        DELIVER_QUERY_TIMEOUT_MS,
        "deliver: load items",
      );
      if (itemsRes.error) return Response.json({ error: `DB: ${itemsRes.error.message}` }, { status: 500 });
      itemsRaw = itemsRes.data;
    } catch {
      return Response.json({ error: "Status is slow right now — try again." }, { status: 503 });
    }
    const send = sendRaw;

    const items: DeliverItem[] = ((itemsRaw ?? []) as unknown as ItemRowRaw[])
      .map((it) => {
        const ppv = Array.isArray(it.ppvs) ? it.ppvs[0] ?? null : it.ppvs;
        return {
          name: ppv?.name ?? "Item",
          mediaUrl: ppv?.media_url ?? "",
          isVideo: isLikelyVideoUrl(ppv?.media_url ?? ""),
        };
      })
      .filter((it) => !!it.mediaUrl);

    return Response.json({
      ok: true,
      items,
      caption: send.caption,
      alreadyDelivered: send.status === "delivered",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[ppv/deliver POST] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
