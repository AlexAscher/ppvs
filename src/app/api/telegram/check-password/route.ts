import { NextRequest } from "next/server";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { computeCheck } from "telegram/Password";
import {
  createSupabaseServerClient,
  createAdminSupabaseClient,
} from "@/lib/supabase-server";
import {
  downloadPhotoBuffer,
  uploadAvatarToStorage,
} from "@/lib/telegram-avatar";
import { evictTelegramClient, clearExpiredFlag } from "@/lib/telegram-pool";
import { encrypt } from "@/lib/crypto";

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

export async function POST(request: NextRequest) {
  try {
    const { apiId, apiHash, password, tempSession, modelId } = await request.json();

    const session = new StringSession(tempSession ?? "");
    const tg = new TelegramClient(
      session,
      Number(apiId),
      apiHash,
      buildClientOptions(),
    );

    await tg.connect();

    let me,
      finalSession,
      photoBuffer: Buffer | null = null;
    try {
      const passwordData = await tg.invoke(new Api.account.GetPassword());
      const srpCheck = await computeCheck(passwordData, password);
      await tg.invoke(new Api.auth.CheckPassword({ password: srpCheck }));
      me = await tg.getMe();
      finalSession = session.save();
      photoBuffer = await downloadPhotoBuffer(tg);
    } finally {
      tg.disconnect().catch(() => {});
    }

    const name = [me.firstName, me.lastName].filter(Boolean).join(" ");

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return Response.json({ error: "Not authenticated" }, { status: 401 });

    let inserted: {
      id: string;
      name: string;
      username: string | null;
      earnings: number;
      avatar_url: string | null;
    } | null;
    let dbError: { message: string } | null;
    const encSession = encrypt(finalSession);
    const encApiHash = encrypt(apiHash);
    if (modelId) {
      const r = await supabase
        .from("models")
        .update({
          username: me.username ?? null,
          telegram_id: me.id.toString(),
          session_string: encSession,
          api_id: Number(apiId),
          api_hash: encApiHash,
          session_status: "active",
        })
        .eq("id", modelId)
        .eq("agency_user_id", user.id)
        .select("id, name, username, earnings, avatar_url")
        .single();
      inserted = r.data;
      dbError = r.error;
    } else {
      const r = await supabase
        .from("models")
        .insert({
          agency_user_id: user.id,
          name,
          username: me.username ?? null,
          telegram_id: me.id.toString(),
          session_string: encSession,
          api_id: Number(apiId),
          api_hash: encApiHash,
          earnings: 0,
          session_status: "active",
        })
        .select("id, name, username, earnings, avatar_url")
        .single();
      inserted = r.data;
      dbError = r.error;
    }

    if (dbError || !inserted)
      return Response.json({ error: dbError?.message ?? "DB error" }, { status: 500 });

    evictTelegramClient(inserted.id);
    clearExpiredFlag(inserted.id);

    if (photoBuffer) {
      const admin = createAdminSupabaseClient();
      const avatarUrl = await uploadAvatarToStorage(
        admin,
        inserted.id,
        photoBuffer,
      );
      if (avatarUrl) {
        await supabase
          .from("models")
          .update({ avatar_url: avatarUrl })
          .eq("id", inserted.id);
        inserted.avatar_url = avatarUrl;
      }
    }

    return Response.json({ model: inserted });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to check password";
    return Response.json({ error: message }, { status: 400 });
  }
}
