import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

type DeliverBody = { code: string };

type SendRow = {
  id: string;
  caption: string | null;
  status: string;
};

type ItemRowRaw = {
  ordinal: number;
  ppvs:
    | { name: string; media_url: string | null }
    | { name: string; media_url: string | null }[]
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
 * Web-delivery: when the fan clicks Pay we mark the send as paid+delivered
 * and respond with the list of original media URLs. The browser then loads
 * those URLs directly from Supabase CDN — our server never touches the
 * file payload, so flaky network on the chatter's side is irrelevant.
 *
 * Auth: no user check — the unique `code` itself is the bearer secret.
 * If Telegram-DM delivery is needed later (after VPS migration), revive
 * `sendOriginalsAlbum` from lib/ppv-delivery and call it from here.
 *
 * Idempotent: if status is already `delivered`, returns the same item
 * list so the fan refreshing the page just keeps seeing their content.
 */
export async function POST(req: NextRequest) {
  try {
    const { code } = (await req.json()) as DeliverBody;
    if (!code) return Response.json({ error: "code required" }, { status: 400 });

    const admin = createAdminSupabaseClient();

    const { data: sendRaw, error: sendErr } = await admin
      .from("ppv_sends")
      .select("id, caption, status")
      .eq("code", code)
      .maybeSingle();
    if (sendErr) return Response.json({ error: `DB: ${sendErr.message}` }, { status: 500 });
    if (!sendRaw) return Response.json({ error: "Not found" }, { status: 404 });

    const send = sendRaw as SendRow;

    const { data: itemsRaw, error: itemsErr } = await admin
      .from("ppv_send_items")
      .select("ordinal, ppvs(name, media_url)")
      .eq("send_id", send.id)
      .order("ordinal", { ascending: true });
    if (itemsErr) return Response.json({ error: `DB: ${itemsErr.message}` }, { status: 500 });

    const items: DeliverItem[] = ((itemsRaw ?? []) as unknown as ItemRowRaw[])
      .map((it) => {
        const ppv = Array.isArray(it.ppvs) ? it.ppvs[0] ?? null : it.ppvs;
        return {
          name: ppv?.name ?? "Item",
          mediaUrl: ppv?.media_url ?? "",
          isVideo: ppv?.media_url ? isLikelyVideoUrl(ppv.media_url) : false,
        };
      })
      .filter((it) => !!it.mediaUrl);

    // Flip lifecycle states. Idempotent — only writes if not already
    // delivered, so re-clicks / page reloads don't churn the row.
    if (send.status !== "delivered") {
      const now = new Date().toISOString();
      const updates: {
        status: "delivered";
        delivered_at: string;
        paid_at?: string;
      } = { status: "delivered", delivered_at: now };
      if (send.status === "pending" || send.status === "sending" || send.status === "sent") {
        updates.paid_at = now;
      }
      await admin.from("ppv_sends").update(updates).eq("id", send.id);
    }

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
