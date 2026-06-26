import { NextRequest } from "next/server";
import { Api } from "telegram";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { withTelegramClient } from "@/lib/telegram-pool";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { generatePpvCode } from "@/lib/ppv-delivery";
import { createStarsInvoiceLink, starsToUsd } from "@/lib/stars";

export const maxDuration = 60;

type TipSendBody = {
  modelId: string;
  peerId: string;
  accessHash: string | null;
  peerUsername?: string | null;
  /** Chatter-supplied tip in Telegram Stars (integer). */
  priceStars: number;
  message?: string | null;
  scheduleDate?: number | null;
};

/**
 * POST /api/tips/send
 * Body: { modelId, peerId, accessHash, peerUsername?, amount, message? }
 *
 * Creates a tip row, generates a /tip/[code] pay URL, and sends it
 * to the fan via Telegram. The fan clicks the link, sees the amount,
 * clicks "Send Tip" → /api/tips/deliver marks it paid and records
 * the amount so it shows up in the model's balance.
 *
 * Telegram delivery is best-effort: the tip row is always created even
 * if the Telegram message fails (e.g. session expired).
 */
export async function POST(req: NextRequest) {
  try {
    const raw = (await req.json().catch(() => null)) as Partial<TipSendBody> | null;
    const modelId = typeof raw?.modelId === "string" ? raw.modelId : "";
    const peerId = typeof raw?.peerId === "string" ? raw.peerId : "";
    const rawStars = typeof raw?.priceStars === "number" ? raw.priceStars : 0;
    const priceStars = Number.isFinite(rawStars) && rawStars > 0 ? Math.max(1, Math.round(rawStars)) : 0;
    // USD equivalent for accounting (tips.amount + reports).
    const amount = priceStars > 0 ? starsToUsd(priceStars) : 0;
    const accessHash = raw?.accessHash ?? null;
    const peerUsername = typeof raw?.peerUsername === "string" ? raw.peerUsername : null;
    const message =
      typeof raw?.message === "string" ? raw.message.trim().slice(0, 500) : null;
    const scheduleDate =
      typeof raw?.scheduleDate === "number" && raw.scheduleDate > 0 ? raw.scheduleDate : undefined;

    if (!modelId || !peerId || priceStars <= 0) {
      return Response.json({ error: "modelId, peerId and priceStars required" }, { status: 400 });
    }

    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const admin = createAdminSupabaseClient();

    // Generate a unique tip code (same 12-char alphabet as PPV codes).
    let code = "";
    let tipId = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      code = generatePpvCode();
      const { data: inserted, error: insertErr } = await admin
        .from("tips")
        .insert({
          code,
          model_id: modelId,
          chatter_id: auth.userId,
          peer_id: peerId,
          peer_access_hash: typeof accessHash === "string" ? accessHash : null,
          peer_username: peerUsername,
          amount,
          message: message || null,
          status: "pending",
        })
        .select("id")
        .single();
      if (!insertErr && inserted) {
        tipId = (inserted as { id: string }).id;
        break;
      }
      // 23505 = unique_violation — try another code
      if (insertErr && (insertErr as { code?: string }).code !== "23505") {
        return Response.json({ error: `DB: ${insertErr.message}` }, { status: 500 });
      }
    }
    if (!tipId) {
      return Response.json({ error: "Could not generate unique code" }, { status: 500 });
    }

    // Tip link: native Telegram Stars invoice deep link (`t.me/$<hash>`).
    // Tap opens the native pay sheet — no mini-app, no web.
    let tipUrl: string;
    try {
      tipUrl = await createStarsInvoiceLink({
        title: "Send a tip",
        description: message?.trim() || "Send a tip",
        payload: code,
        stars: priceStars,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "createInvoiceLink failed";
      console.error("[tips/send] stars invoice failed:", msg);
      return Response.json({ error: msg }, { status: 502 });
    }

    // Build the message:
    //   <optional chatter message>
    //   Tip X ⭐ ↗    ← TextUrl entity, URL hidden from body
    const tipLabel = `Tip ${priceStars} ⭐ ↗`;
    // Blank line between the chatter's message and the Tip link (offset below
    // is messageBlock.length, so it adjusts automatically).
    const messageBlock = message ? `${message}\n\n` : "";
    const tipText = `${messageBlock}${tipLabel}`;

    const tipEntity = new Api.MessageEntityTextUrl({
      offset: messageBlock.length,
      length: tipLabel.length,
      url: tipUrl,
    });

    // Best-effort Telegram send. Failure doesn't fail the whole request —
    // the chatter can copy the link from the UI if Telegram bounces.
    try {
      await withTelegramClient(
        modelId,
        auth.model.session_string,
        auth.model.api_id,
        auth.model.api_hash,
        async (tg) => {
          // sendMessage handles numeric strings as peer IDs; it resolves
          // the entity from the session's entity cache (populated when
          // the model previously messaged this fan for PPV sends).
          //
          // linkPreview:false suppresses TG's auto-generated link card so
          // the fan sees a clean tip request — not a big page preview.
          await tg.sendMessage(peerId, {
            message: tipText,
            formattingEntities: [tipEntity],
            linkPreview: false,
            schedule: scheduleDate,
          });
        },
        30_000,
      );
    } catch (e: unknown) {
      console.error(
        "[tips/send] Telegram message failed:",
        e instanceof Error ? e.message : e,
      );
    }

    return Response.json({ ok: true, code, tipUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[tips/send POST] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
