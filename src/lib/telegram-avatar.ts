import { TelegramClient } from "telegram";
import { SupabaseClient } from "@supabase/supabase-js";

export async function downloadPhotoBuffer(
  tg: TelegramClient,
): Promise<Buffer | null> {
  try {
    const result = await Promise.race([
      tg.downloadProfilePhoto("me", { isBig: false }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    return result instanceof Buffer ? result : null;
  } catch {
    return null;
  }
}

export async function uploadAvatarToStorage(
  supabase: SupabaseClient,
  modelId: string,
  photo: Buffer,
): Promise<string | null> {
  const path = `${modelId}.jpg`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, photo, { contentType: "image/jpeg", upsert: true });

  if (error) {
    console.error("[uploadAvatarToStorage] storage error:", error);
    return null;
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}
