import { Api } from "telegram";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { withTelegramClient } from "@/lib/telegram-pool";

// Inbox is heavier than a single /api/telegram/dialogs call: it fans out to
// every connected model of the agency. Cap how long we wait per model so one
// stuck session doesn't tank the whole response.
export const maxDuration = 60;
const PER_MODEL_TIMEOUT_MS = 12_000;
const PER_MODEL_DIALOG_LIMIT = 30;

export type InboxItem = {
  modelId: string;
  modelName: string;
  modelUsername: string | null;
  modelAvatarUrl: string | null;
  /** Telegram peer (the fan). Negative ids stay positive in URLs so the
   *  chatter route's parsing keeps working. */
  peerId: string;
  peerType: "user" | "chat" | "channel";
  peerTitle: string;
  peerUsername: string | null;
  lastMessage: string;
  lastMessageDate: number;
  unreadCount: number;
  accessHash: string | null;
};

function timeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function GET() {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();

  // Only agencies have an Inbox. Chatters work inside the single-model
  // chatter page, so we return their one model rather than 401-ing.
  const role = (user.user_metadata?.role as "agency" | "chatter") ?? "chatter";
  let modelIds: string[] = [];
  type ModelRow = {
    id: string;
    name: string;
    username: string | null;
    avatar_url: string | null;
    session_string: string;
    api_id: number;
    api_hash: string;
    session_status?: string | null;
  };
  let models: ModelRow[] = [];
  if (role === "agency") {
    const { data } = await admin
      .from("models")
      .select("id, name, username, avatar_url, session_string, api_id, api_hash, session_status")
      .eq("agency_user_id", user.id);
    models = (data ?? []) as ModelRow[];
  } else {
    // Chatter sees only the model they're attached to.
    const { data: ac } = await admin
      .from("agency_chatters")
      .select("model_id")
      .eq("chatter_id", user.id)
      .maybeSingle();
    const modelId = (ac as { model_id: string | null } | null)?.model_id ?? null;
    if (modelId) {
      const { data: m } = await admin
        .from("models")
        .select("id, name, username, avatar_url, session_string, api_id, api_hash, session_status")
        .eq("id", modelId)
        .maybeSingle();
      if (m) models = [m as ModelRow];
    }
  }
  // Drop expired sessions — getDialogs would just throw immediately.
  models = models.filter((m) => m.session_status !== "expired" && m.session_string);
  modelIds = models.map((m) => m.id);
  if (modelIds.length === 0) return Response.json({ items: [], models: [] });

  // Fan out across every model. Each is wrapped in its own timeout so one
  // bad session doesn't block the whole Inbox.
  const settled = await Promise.allSettled(
    models.map(async (m) => {
      const items = await timeout(
        withTelegramClient(
          m.id,
          m.session_string,
          m.api_id,
          m.api_hash,
          async (tg) => {
            const dialogs = await tg.getDialogs({ limit: PER_MODEL_DIALOG_LIMIT });
            const out: InboxItem[] = [];
            for (const d of dialogs) {
              const entity = d.entity;
              let peerType: InboxItem["peerType"];
              let peerTitle: string;
              let peerUsername: string | null = null;
              let peerId: string;
              let accessHash: string | null = null;
              if (entity instanceof Api.User) {
                peerType = "user";
                peerTitle = [entity.firstName, entity.lastName].filter(Boolean).join(" ") || entity.username || "User";
                peerUsername = entity.username ?? null;
                peerId = entity.id.toString();
                accessHash = entity.accessHash?.toString() ?? null;
              } else if (entity instanceof Api.Chat) {
                peerType = "chat";
                peerTitle = entity.title;
                peerId = `-${entity.id.toString()}`;
              } else if (entity instanceof Api.Channel) {
                peerType = "channel";
                peerTitle = entity.title;
                peerUsername = entity.username ?? null;
                peerId = `-100${entity.id.toString()}`;
                accessHash = entity.accessHash?.toString() ?? null;
              } else continue;

              const msg = d.message;
              const lastMessage =
                msg && "message" in msg && typeof msg.message === "string" && msg.message
                  ? msg.message
                  : msg && "media" in msg && msg.media
                    ? "📎 Media"
                    : "";

              out.push({
                modelId: m.id,
                modelName: m.name,
                modelUsername: m.username,
                modelAvatarUrl: m.avatar_url,
                peerId,
                peerType,
                peerTitle,
                peerUsername,
                lastMessage,
                lastMessageDate: msg?.date ?? 0,
                unreadCount: d.unreadCount ?? 0,
                accessHash,
              });
            }
            return out;
          },
        ),
        PER_MODEL_TIMEOUT_MS,
        `inbox/${m.id}`,
      );
      return items;
    }),
  );

  const items: InboxItem[] = [];
  const errors: { modelId: string; error: string }[] = [];
  settled.forEach((r, idx) => {
    if (r.status === "fulfilled") items.push(...r.value);
    else errors.push({ modelId: models[idx].id, error: r.reason instanceof Error ? r.reason.message : "failed" });
  });

  // Sort: unread first, then newest. The dashboard surfaces fans the agency
  // most likely cares about right now without scrolling.
  items.sort((a, b) => {
    const ua = a.unreadCount > 0 ? 1 : 0;
    const ub = b.unreadCount > 0 ? 1 : 0;
    if (ua !== ub) return ub - ua;
    return b.lastMessageDate - a.lastMessageDate;
  });

  return Response.json({
    items,
    models: models.map((m) => ({
      id: m.id,
      name: m.name,
      username: m.username,
      avatar_url: m.avatar_url,
    })),
    errors,
  });
}
