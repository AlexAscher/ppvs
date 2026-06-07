import { NextRequest } from "next/server";
import { Api } from "telegram";
import bigInt from "big-integer";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { withTelegramClient } from "@/lib/telegram-pool";

/**
 * GET /api/alerts/channels?modelId=<uuid>
 *
 * Lists channels/supergroups the given model's MTProto session is a
 * member of. Returns a small picker-friendly array: { id, access_hash,
 * title, isChannel }. The Settings UI uses this to populate the "Alerts
 * channel" dropdown.
 *
 * Why per-model: the agency might have multiple connected sessions
 * (one per model). The picker uses the chosen session's dialogs since
 * that's the session that will actually send alerts (or we'll use it as
 * the default sender if no other is configured).
 */

type ModelRow = {
  id: string;
  agency_user_id: string;
  session_string: string | null;
  api_id: number | null;
  api_hash: string | null;
  session_status: string | null;
};

type ChannelOption = {
  id: string;
  access_hash: string;
  title: string;
  isAdmin: boolean;
};

export async function GET(req: NextRequest) {
  const ssr = await createServerSupabaseClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const modelId = new URL(req.url).searchParams.get("modelId");
  if (!modelId) return Response.json({ error: "modelId required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data: modelRaw } = await admin
    .from("models")
    .select("id, agency_user_id, session_string, api_id, api_hash, session_status")
    .eq("id", modelId)
    .maybeSingle();
  const model = (modelRaw ?? null) as ModelRow | null;
  if (!model) return Response.json({ error: "Model not found" }, { status: 404 });
  if (model.agency_user_id !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!model.session_string || !model.api_id || !model.api_hash) {
    return Response.json({ error: "Model not connected to Telegram" }, { status: 400 });
  }
  if (model.session_status === "expired") {
    return Response.json({ error: "Session expired — reconnect this model first" }, { status: 400 });
  }

  try {
    const channels = await withTelegramClient(
      model.id,
      model.session_string,
      model.api_id,
      model.api_hash,
      async (client) => {
        const res = await client.invoke(
          new Api.messages.GetDialogs({
            offsetDate: 0,
            offsetId: 0,
            offsetPeer: new Api.InputPeerEmpty(),
            limit: 200,
            hash: bigInt(0),
          }),
        );
        // res.chats is a union — filter to Channel only (covers
        // supergroups and broadcast channels). Skip regular groups and
        // "ChatForbidden" entries.
        type ChatRow = {
          className?: string;
          id?: { toString(): string };
          accessHash?: { toString(): string };
          title?: string;
          megagroup?: boolean;
          broadcast?: boolean;
          creator?: boolean;
          adminRights?: unknown;
        };
        const chats = ("chats" in res ? (res.chats as ChatRow[]) : []) ?? [];
        const out: ChannelOption[] = [];
        for (const c of chats) {
          if (c.className !== "Channel") continue;
          if (!c.id || !c.accessHash || !c.title) continue;
          const isAdmin = Boolean(c.creator || c.adminRights);
          out.push({
            id: c.id.toString(),
            access_hash: c.accessHash.toString(),
            title: c.title,
            isAdmin,
          });
        }
        // Show admin-controlled channels first — those are the realistic
        // alert targets.
        out.sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.title.localeCompare(b.title));
        return out;
      },
      30_000,
    );
    return Response.json({ channels });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
