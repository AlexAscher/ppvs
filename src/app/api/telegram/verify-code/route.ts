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
function friendlyAuthError(msg: string): string {
  if (/PHONE_CODE_INVALID/i.test(msg)) return "That code is wrong — double-check and try again.";
  if (/PHONE_CODE_EXPIRED/i.test(msg)) return "The code expired. Go back and request a new one.";
  if (/PHONE_NUMBER_INVALID/i.test(msg)) return "That phone number isn't valid.";
  if (/PHONE_NUMBER_BANNED/i.test(msg)) return "This phone number is banned on Telegram.";
  const flood = msg.match(/FLOOD_WAIT_(\d+)/i);
  if (flood) return `Telegram rate-limited this number — wait ${flood[1]}s and try again.`;
  if (/TIMEOUT|timed out/i.test(msg)) return "Telegram didn't respond in time. Try again in a moment.";
  return msg || "Failed to verify code";
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
    const raw = err instanceof Error ? err.message : "Failed to verify code";
    console.error("[telegram/verify-code] error:", raw);
    return Response.json({ error: friendlyAuthError(raw) }, { status: 400 });
  }
}
