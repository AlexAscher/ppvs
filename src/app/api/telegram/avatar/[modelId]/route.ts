import { NextRequest } from "next/server";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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

const cache = new Map<string, { data: Buffer; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;

    const cached = cache.get(modelId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      // Wrap Node Buffer in Uint8Array so it satisfies BodyInit (newer
      // @types/node strip the BodyInit overload for plain Buffer).
      return new Response(new Uint8Array(cached.data), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    const { data: model, error } = await supabase
      .from("models")
      .select("session_string, api_id, api_hash")
      .eq("id", modelId)
      .eq("agency_user_id", user.id)
      .single();

    if (error || !model) return new Response("Not found", { status: 404 });

    const session = new StringSession(model.session_string);
    const tg = new TelegramClient(
      session,
      model.api_id,
      model.api_hash,
      buildClientOptions(),
    );

    let photo: Buffer | null = null;
    try {
      await tg.connect();
      const downloaded = await tg.downloadProfilePhoto("me", { isBig: false });
      if (downloaded instanceof Buffer) photo = downloaded;
    } finally {
      tg.disconnect().catch(() => {});
    }

    if (!photo) return new Response("No photo", { status: 404 });

    cache.set(modelId, { data: photo, ts: Date.now() });

    return new Response(new Uint8Array(photo), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new Response("Error", { status: 500 });
  }
}
