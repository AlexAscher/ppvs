import { Api } from "telegram";
import bigInt from "big-integer";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { withTelegramClient } from "@/lib/telegram-pool";

/**
 * Fan-out helper for the admin Global Sales Alerts multi-channel table.
 *
 * `kind` decides which per-channel flag gates delivery:
 *   - "ppv-or-tip"  → alerts_ppv column
 *   - "signup"      → alerts_signups column
 *   - "vault"       → alerts_vault column
 *
 * Fire-and-forget. Errors are logged and swallowed so a bot outage never
 * blocks the caller (sale, signup insert, vault upload).
 */
export async function broadcastToAdminChannels(
  kind: "ppv-or-tip" | "signup" | "vault",
  text: string,
): Promise<void> {
  try {
    const admin = createAdminSupabaseClient();
    const { data } = await admin
      .from("admin_sales_channels")
      .select("bot_chat_id, enabled, alerts_ppv, alerts_signups, alerts_vault")
      .not("bot_chat_id", "is", null)
      .eq("enabled", true);
    type Row = {
      bot_chat_id: string;
      alerts_ppv?: boolean | null;
      alerts_signups?: boolean | null;
      alerts_vault?: boolean | null;
    };
    const rows = (data ?? []) as Row[];
    const applicable = rows.filter((r) => {
      if (kind === "ppv-or-tip") return r.alerts_ppv !== false;
      if (kind === "signup") return r.alerts_signups !== false;
      if (kind === "vault") return r.alerts_vault !== false;
      return true;
    });
    if (applicable.length === 0) return;
    const { sendBotMessage } = await import("@/lib/alert-bot");
    await Promise.all(applicable.map((r) => sendBotMessage(r.bot_chat_id, text)));
  } catch (e) {
    console.error(
      "[admin-alerts] fan-out failed:",
      e instanceof Error ? e.message : e,
    );
  }
}

/** New pending signup alert — fires from /api/signup-request. */
export function sendAdminSignupAlert(params: {
  email: string;
  role: "agency" | "chatter";
  agencyName?: string | null;
}): void {
  const roleLabel = params.role === "agency" ? "Agency" : "Chatter";
  const agencyLine = params.agencyName ? `\n🏢 ${params.agencyName}` : "";
  const text = `📬 New signup pending review\n${roleLabel} · ${params.email}${agencyLine}\nOpen /admin → Signups`;
  void broadcastToAdminChannels("signup", text);
}

/** New pending PPV upload alert — fires from PPVsTab upload path via the
 *  chat-side ppvs insert (rows land with review_status='pending'). */
export function sendAdminVaultAlert(params: {
  agencyName?: string | null;
  modelName?: string | null;
  count: number;
}): void {
  const who = params.agencyName ?? "An agency";
  const model = params.modelName ? ` (creator ${params.modelName})` : "";
  const items = params.count === 1 ? "1 item" : `${params.count} items`;
  const text = `🔒 Vault: ${who}${model} uploaded ${items} for review\nOpen /admin → Vault`;
  void broadcastToAdminChannels("vault", text);
}

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

  // Fan-out to every connected platform-owner (admin) sales channel. Runs
  // in parallel with the per-agency delivery below so admin alerts still
  // fire even when the agency hasn't wired Sales Alerts yet.
  void broadcastToAdminChannels("ppv-or-tip", text);

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
