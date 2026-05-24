import { NextRequest } from "next/server";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { buildTelegramClientOptions } from "@/lib/telegram-client";

export async function POST(request: NextRequest) {
  try {
    const { apiId, apiHash, phone } = await request.json();

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
