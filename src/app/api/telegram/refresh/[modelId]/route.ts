import { NextRequest } from "next/server";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import {
  createSupabaseServerClient,
  createAdminSupabaseClient,
} from "@/lib/supabase-server";
import {
  downloadPhotoBuffer,
  uploadAvatarToStorage,
} from "@/lib/telegram-avatar";

function buildClientOptions() {
  const base = { connectionRetries: 0, timeout: 15 };
  if (process.env.TELEGRAM_PROXY_IP) {
    return {
      ...base,
      useWSS: false,
      proxy: {
        ip: process.env.TELEGRAM_PROXY_IP,
        port: Number(process.env.TELEGRAM_PROXY_PORT ?? 1080),
        socksType: 5 as const,
        username: process.env.TELEGRAM_PROXY_USER,
        password: process.env.TELEGRAM_PROXY_PASS,
      },
    };
  }
  return { ...base, useWSS: true };
}

const inFlight = new Map<string, Promise<Response>>();

async function doRefresh(
  modelId: string,
  model: { session_string: string; api_id: number; api_hash: string },
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<Response> {
  const session = new StringSession(model.session_string);
  const tg = new TelegramClient(
    session,
    model.api_id,
    model.api_hash,
    buildClientOptions(),
  );

  let me: Awaited<ReturnType<typeof tg.getMe>> | undefined;
  let photoBuffer: Buffer | null = null;

  try {
    await Promise.race([
      (async () => {
        await tg.connect();
        me = await tg.getMe();
        photoBuffer = await downloadPhotoBuffer(tg);
      })(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Telegram timeout")), 15000),
      ),
    ]);
  } finally {
    await Promise.race([
      tg.disconnect(),
      new Promise<void>((r) => setTimeout(r, 2000)),
    ]);
  }

  if (!me) throw new Error("Failed to get user info");

  const name = [me.firstName, me.lastName].filter(Boolean).join(" ");
  const username = me.username ?? null;

  const admin = createAdminSupabaseClient();
  let avatarUrl: string | null = null;
  if (photoBuffer) {
    avatarUrl = await uploadAvatarToStorage(admin, modelId, photoBuffer);
  }

  const { data: updated, error: updateError } = await supabase
    .from("models")
    .update({ name, username, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) })
    .eq("id", modelId)
    .select("id, name, username, earnings, avatar_url")
    .single();

  if (updateError)
    return Response.json({ error: updateError.message }, { status: 500 });

  return Response.json({ model: updated });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return Response.json({ error: "Not authenticated" }, { status: 401 });

    const { data: model, error } = await supabase
      .from("models")
      .select("session_string, api_id, api_hash")
      .eq("id", modelId)
      .eq("agency_user_id", user.id)
      .single();

    if (error || !model)
      return Response.json({ error: "Not found" }, { status: 404 });

    if (inFlight.has(modelId)) {
      return inFlight.get(modelId)!;
    }

    const promise = doRefresh(modelId, model, supabase).finally(() =>
      inFlight.delete(modelId),
    );
    inFlight.set(modelId, promise);
    return await promise;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to refresh";
    return Response.json({ error: message }, { status: 400 });
  }
}
