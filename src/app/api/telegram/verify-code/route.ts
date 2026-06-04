import { NextRequest } from "next/server";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
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
    const { apiId, apiHash, phone, code, phoneCodeHash, tempSession, modelId } =
      await request.json();

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
      try {
        await tg.invoke(
          new Api.auth.SignIn({
            phoneNumber: phone,
            phoneCodeHash,
            phoneCode: code,
          }),
        );
      } catch (signInErr: unknown) {
        const msg = signInErr instanceof Error ? signInErr.message : "";
        if (msg.includes("SESSION_PASSWORD_NEEDED")) {
          const ts = session.save();
          return Response.json({ twoFaNeeded: true, tempSession: ts });
        }
        throw signInErr;
      }
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

    // Reconnect path: a `modelId` means we're refreshing the session of an
    // existing (expired) model — UPDATE in place instead of inserting a
    // duplicate, and flip session_status back to active.
    let inserted: {
      id: string;
      name: string;
      username: string | null;
      earnings: number;
      avatar_url: string | null;
    } | null;
    let dbError: { message: string } | null;
    // Encrypt the Telegram credentials at rest. `api_id` is a number → no
    // encryption needed; session_string + api_hash give full account access.
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

    // Drop the pool's stale client + expired-flag guard so the next
    // request reconnects cleanly with the fresh session.
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
      err instanceof Error ? err.message : "Failed to verify code";
    return Response.json({ error: message }, { status: 400 });
  }
}
