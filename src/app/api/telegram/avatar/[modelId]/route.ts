import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { withTelegramClient } from "@/lib/telegram-pool";
import { decryptIfNeeded } from "@/lib/crypto";

const cache = new Map<string, { data: Buffer; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;

    // Auth before cache: gate the model-scoped image on ownership BEFORE any
    // cache hit. The cached bytes are the model's own profile photo, so
    // returning them to an unauthenticated caller would still leak model
    // information (existence + avatar) even if the byte payload is public
    // on Telegram itself.
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

    const cached = cache.get(modelId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      // Wrap Node Buffer in Uint8Array so it satisfies BodyInit (newer
      // @types/node strip the BodyInit overload for plain Buffer).
      return new Response(new Uint8Array(cached.data), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    // Decrypt secrets (verify-code stores them AES-GCM-encrypted; legacy
    // plaintext rows pass through). Go through the shared pool so we NEVER open
    // a second socket on this model's session — a raw connect here duplicated
    // the pooled connection and triggered AUTH_KEY_DUPLICATED whenever the
    // model was already connected (keepalive, or a chatter viewing it).
    const decSession = decryptIfNeeded(model.session_string);
    const decHash = decryptIfNeeded(model.api_hash);
    if (!decSession || !decHash) return new Response("Bad session", { status: 404 });

    let photo: Buffer | null = null;
    try {
      photo = await withTelegramClient(
        modelId,
        decSession,
        model.api_id,
        decHash,
        async (tg) => {
          const downloaded = await tg.downloadProfilePhoto("me", { isBig: false });
          return downloaded instanceof Buffer ? downloaded : null;
        },
        15_000,
        true, // read-only: safe to reconnect+retry once on a dead pooled socket
      );
    } catch {
      photo = null;
    }

    if (!photo) return new Response("No photo", { status: 404 });

    cache.set(modelId, { data: photo, ts: Date.now() });

    return new Response(new Uint8Array(photo), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new Response("Error", { status: 500 });
  }
}
