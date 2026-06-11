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
import { buildTelegramClientOptions } from "@/lib/telegram-client";

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** Turn raw gramJS/MTProto errors into something the agency can act on. */
function friendlyPasswordError(msg: string): string {
  if (/PASSWORD_HASH_INVALID/i.test(msg)) return "Wrong cloud password — try again.";
  const flood = msg.match(/FLOOD_WAIT_(\d+)/i);
  if (flood) return `Telegram rate-limited this — wait ${flood[1]}s and try again.`;
  if (/TIMEOUT|timed out/i.test(msg)) return "Telegram didn't respond in time. Try again in a moment.";
  return msg || "Failed to check password";
}

export async function POST(request: NextRequest) {
  try {
    const { apiId, apiHash, password, tempSession, modelId } = await request.json();

    const session = new StringSession(tempSession ?? "");
    const tg = new TelegramClient(
      session,
      Number(apiId),
      apiHash,
      buildTelegramClientOptions(),
    );

    try {
      await withTimeout(tg.connect(), 25_000, "connect");
    } catch (e) {
      try { await tg.disconnect(); } catch {}
      throw e instanceof Error ? e : new Error("Couldn't reach Telegram to sign in.");
    }

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
    const raw = err instanceof Error ? err.message : "Failed to check password";
    console.error("[telegram/check-password] error:", raw);
    return Response.json({ error: friendlyPasswordError(raw) }, { status: 400 });
  }
}
