import type { SupabaseClient } from "@supabase/supabase-js";

export async function uploadPpvMedia(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const id = crypto.randomUUID();
  const path = `${userId}/${id}.${ext}`;

  const { error } = await supabase.storage
    .from("ppvs")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from("ppvs").getPublicUrl(path);
  return data.publicUrl;
}

export function ppvMediaPathFromUrl(url: string): string | null {
  const match = url.match(/\/storage\/v1\/object\/public\/ppvs\/(.+?)(?:\?|$)/);
  return match ? match[1] : null;
}

export async function deletePpvMedia(
  supabase: SupabaseClient,
  mediaUrl: string,
): Promise<void> {
  const path = ppvMediaPathFromUrl(mediaUrl);
  if (!path) return;
  await supabase.storage.from("ppvs").remove([path]);
}
