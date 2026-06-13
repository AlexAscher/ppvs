import { Api } from "telegram";
import bigInt from "big-integer";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { withTelegramClient } from "@/lib/telegram-pool";

/**
 * Send a Sales Alert to the agency's configured private TG channel.
 *
 * The alert is sent via one of the agency's connected MTProto sessions
 * (alerts_sender_model_id, or the first connected model as fallback).
 * The channel coordinates (id + access_hash) are stored at pick time in
 * Settings — see /api/alerts/channels for the picker that captures them.
 *
 * Best-effort: failures are logged and swallowed. Sales delivery flow
 * must never be blocked by an alert.
 */

type SalesAlertCommon = {
  agencyUserId: string;
  modelId: string;
  modelName?: string;
  fanDisplay: string;       // "@user" or "Fan Name"
  amount: number;           // dollars
  /** The chatter who initiated the sale. Resolved lazily inside the
   *  fan-out so callers don't have to pass full names — we look up the
   *  auth user's display name from `auth.users` if only the id is given. */
  chatterId?: string | null;
};

export type SalesAlertEvent =
  | (SalesAlertCommon & { type: "ppv"; itemName: string })
  | (SalesAlertCommon & { type: "tip"; message?: string | null });

type AgencySettings = {
  alerts_enabled: boolean;
  alerts_ppv: boolean;
  alerts_tips: boolean;
  alerts_channel_id: string | null;
  alerts_channel_access_hash: string | null;
  alerts_sender_model_id: string | null;
};

type ModelRow = {
  id: string;
  name: string | null;
  session_string: string | null;
  api_id: number | null;
  api_hash: string | null;
  session_status: string | null;
};

// Coalesce duplicates within a short window (e.g. webhook re-delivery).
const recentlySent = new Set<string>();
function markRecent(key: string) {
  recentlySent.add(key);
  setTimeout(() => recentlySent.delete(key), 30_000);
}

function fmtUSD(amount: number): string {
  return amount % 1 === 0 ? `$${amount.toFixed(0)}` : `$${amount.toFixed(2)}`;
}

/** Compact 3-line alert format (per user spec). Drops the PPV item name
 *  (was noisy) and adds the chatter so the agency knows who closed the sale.
 *
 *   💰 +$10 PPV
 *   Oscar | Comfygod ← @benzo_CEO
 *   ✍️ Chatter: Alex
 *
 *  Tips use the same shape with 💎 on the amount line; the fan's tip
 *  message (if any) appended as a fourth line.
 */
function buildMessage(ev: SalesAlertEvent, chatterName: string | null): string {
  const model = ev.modelName ? ev.modelName : "model";
  const kind = ev.type === "ppv" ? "PPV" : "Tip";
  const emoji = ev.type === "ppv" ? "💰" : "💎";
  const chatterLine = chatterName ? `\n✍️ Chatter: ${chatterName}` : "";
  const tipTail = ev.type === "tip" && ev.message ? `\n💬 ${ev.message}` : "";
  return `${emoji} +${fmtUSD(ev.amount)} ${kind}\n${model} ← ${ev.fanDisplay}${chatterLine}${tipTail}`;
}

/**
 * Fire-and-forget. Caller doesn't await — failures are logged only.
 */
export function sendSalesAlert(event: SalesAlertEvent): void {
  void (async () => {
    try {
      await sendSalesAlertInner(event);
    } catch (e) {
      console.error(
        "[sales-alerts] failed:",
        e instanceof Error ? e.message : e,
      );
    }
  })();
}

async function sendSalesAlertInner(event: SalesAlertEvent): Promise<void> {
  const dupKey = `${event.agencyUserId}:${event.type}:${event.modelId}:${event.fanDisplay}:${event.amount}`;
  if (recentlySent.has(dupKey)) return;

  const admin = createAdminSupabaseClient();

  // Load agency settings + decide whether to send. alerts_bot_chat_id is
  // in a column added by 20260611_alerts_bot.sql; select it but tolerate
  // its absence on older schemas.
  let settingsRaw: unknown = null;
  {
    const withBot = await admin
      .from("agency_settings")
      .select(
        "alerts_enabled, alerts_ppv, alerts_tips, alerts_channel_id, alerts_channel_access_hash, alerts_sender_model_id, alerts_bot_chat_id",
      )
      .eq("user_id", event.agencyUserId)
      .maybeSingle();
    if (withBot.error && /alerts_bot_chat_id/.test(withBot.error.message)) {
      const fallback = await admin
        .from("agency_settings")
        .select(
          "alerts_enabled, alerts_ppv, alerts_tips, alerts_channel_id, alerts_channel_access_hash, alerts_sender_model_id",
        )
        .eq("user_id", event.agencyUserId)
        .maybeSingle();
      settingsRaw = fallback.data;
    } else {
      settingsRaw = withBot.data;
    }
  }

  const settings = (settingsRaw ?? null) as (AgencySettings & { alerts_bot_chat_id?: string | null }) | null;
  if (!settings || !settings.alerts_enabled) return;
  if (event.type === "ppv" && !settings.alerts_ppv) return;
  if (event.type === "tip" && !settings.alerts_tips) return;

  // Resolve the chatter's display name once for the alert body. We try
  // auth.users metadata first (full_name / display_name → email prefix);
  // null falls back to "Chatter" elision in buildMessage.
  let chatterName: string | null = null;
  if (event.chatterId) {
    try {
      const { data: u } = await admin.auth.admin.getUserById(event.chatterId);
      const md = (u?.user?.user_metadata ?? {}) as Record<string, unknown>;
      chatterName =
        (md.full_name as string | undefined)?.trim() ||
        (md.display_name as string | undefined)?.trim() ||
        u?.user?.email?.split("@")[0] ||
        null;
    } catch {
      /* best-effort; alert still goes out without the chatter line */
    }
  }

  const text = buildMessage(event, chatterName);

  // ── Primary path: bot DM (no userbot, no ban risk) ──────────────────
  if (settings.alerts_bot_chat_id) {
    markRecent(dupKey);
    const { sendBotMessage } = await import("@/lib/alert-bot");
    await sendBotMessage(settings.alerts_bot_chat_id, text);
    return;
  }

  // ── Legacy path: model MTProto session → channel ────────────────────
  if (!settings.alerts_channel_id || !settings.alerts_channel_access_hash) return;

  // Pick the sender model: configured one, falling back to the model
  // that actually made the sale (which we know is connected because the
  // sale just happened).
  const senderModelId = settings.alerts_sender_model_id || event.modelId;

  const { data: modelRaw } = await admin
    .from("models")
    .select("id, name, session_string, api_id, api_hash, session_status")
    .eq("id", senderModelId)
    .maybeSingle();
  const sender = (modelRaw ?? null) as ModelRow | null;
  if (!sender?.session_string || !sender.api_id || !sender.api_hash) return;
  if (sender.session_status === "expired") return;

  markRecent(dupKey);

  await withTelegramClient(
    sender.id,
    sender.session_string,
    sender.api_id,
    sender.api_hash,
    async (client) => {
      const channelPeer = new Api.InputPeerChannel({
        channelId: bigInt(settings.alerts_channel_id!),
        accessHash: bigInt(settings.alerts_channel_access_hash!),
      });
      await client.sendMessage(channelPeer, {
        message: text,
        linkPreview: false,
      });
    },
    20_000,
  );
}
