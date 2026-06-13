import { NextRequest } from "next/server";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { buildTelegramClientOptions } from "@/lib/telegram-client";
import { consume, getClientIp, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const { apiId, apiHash, phone } = await request.json();

    // Each call dials Telegram and triggers an SMS/code to `phone`. Without a
    // limit this is an SMS-flood / Telegram-ban vector. Cap both by IP and by
    // target phone so a single number can't be hammered from many IPs.
    const ip = getClientIp(request);
    if (!consume(`send-code-ip|${ip}`, 5, 60_000)) return tooManyRequests(60);
    if (typeof phone === "string" && phone.trim()) {
      if (!consume(`send-code-phone|${phone.trim()}`, 3, 600_000)) {
        return tooManyRequests(600);
      }
    }

    const session = new StringSession("");
    const tg = new TelegramClient(
      session,
      Number(apiId),
      apiHash,
      buildTelegramClientOptions(),
    );

    await tg.connect();
    const raw = await tg.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId: Number(apiId),
        apiHash,
        settings: new Api.CodeSettings({}),
      }),
    );
    tg.disconnect().catch(() => {});

    const result = raw as Api.auth.SentCode;
    return Response.json({
      phoneCodeHash: result.phoneCodeHash,
      tempSession: session.save(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send code";
    return Response.json({ error: message }, { status: 400 });
  }
}
