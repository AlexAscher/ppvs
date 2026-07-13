import { NextRequest } from "next/server";
import {
  createSupabaseServerClient,
  createAdminSupabaseClient,
} from "@/lib/supabase-server";
import {
  downloadPhotoBuffer,
  uploadAvatarToStorage,
} from "@/lib/telegram-avatar";
import { withTelegramClient } from "@/lib/telegram-pool";
import { decryptIfNeeded } from "@/lib/crypto";

const inFlight = new Map<string, Promise<Response>>();

async function doRefresh(
  modelId: string,
  model: { session_string: string; api_id: number; api_hash: string },
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<Response> {
  // Decrypt secrets (encrypted at rest; legacy plaintext passes through).
  const decSession = decryptIfNeeded(model.session_string);
  const decHash = decryptIfNeeded(model.api_hash);
  if (!decSession || !decHash) {
    return Response.json({ error: "Bad session" }, { status: 400 });
  }

  // Reuse the model's pooled connection instead of opening a second socket.
  // A raw connect here would AUTH_KEY_DUPLICATE against keepalive or a chatter
  // viewing the same model — the exact conflict this hardening removes.
  // Read-only (getMe + profile photo) → safe to reconnect+retry once.
  const { me, photoBuffer } = await withTelegramClient(
    modelId,
    decSession,
    model.api_id,
    decHash,
    async (tg) => {
      const meRes = await tg.getMe();
      const photo = await downloadPhotoBuffer(tg);
      return { me: meRes, photoBuffer: photo };
    },
    15_000,
    true,
  );

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
