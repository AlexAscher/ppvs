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

function buildMessage(ev: SalesAlertEvent): string {
  const model = ev.modelName ? ev.modelName : "model";
  if (ev.type === "ppv") {
    return `💰 +${fmtUSD(ev.amount)} PPV\n${model} ← ${ev.fanDisplay}\n📦 ${ev.itemName}`;
  }
  // tip
  const tail = ev.message ? `\n💬 ${ev.message}` : "";
  return `💎 +${fmtUSD(ev.amount)} Tip\n${model} ← ${ev.fanDisplay}${tail}`;
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

  // Load agency settings + decide whether to send.
  const { data: settingsRaw } = await admin
    .from("agency_settings")
    .select(
      "alerts_enabled, alerts_ppv, alerts_tips, alerts_channel_id, alerts_channel_access_hash, alerts_sender_model_id",
    )
    .eq("user_id", event.agencyUserId)
    .maybeSingle();

  const settings = (settingsRaw ?? null) as AgencySettings | null;
  if (!settings || !settings.alerts_enabled) return;
  if (!settings.alerts_channel_id || !settings.alerts_channel_access_hash) return;
  if (event.type === "ppv" && !settings.alerts_ppv) return;
  if (event.type === "tip" && !settings.alerts_tips) return;

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

  const text = buildMessage(event);

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
