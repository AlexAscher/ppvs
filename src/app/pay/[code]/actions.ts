"use server";

import { createAdminSupabaseClient } from "@/lib/supabase-server";

type LinkWithItem = {
  id: string;
  price: number;
  is_paid: boolean;
  vault_items: { file_path: string; file_type: string } | null;
};

export async function unlockPpv(code: string): Promise<{ url?: string; error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminSupabaseClient() as any;

  const { data: link, error: fetchErr } = await admin
    .from("ppv_links")
    .select("id, price, is_paid, vault_items(file_path, file_type)")
    .eq("code", code)
    .eq("is_paid", false)
    .single() as { data: LinkWithItem | null; error: unknown };

  if (fetchErr || !link) {
    return { error: "Link not found or already used." };
  }

  const { error: updateErr } = await admin
    .from("ppv_links")
    .update({ is_paid: true, paid_at: new Date().toISOString() })
    .eq("id", link.id) as { error: unknown };

  if (updateErr) return { error: "Failed to process payment." };

  const filePath = link.vault_items?.file_path;
  if (!filePath) return { error: "Content not found." };

  const { data: signedData, error: signErr } = await admin.storage
    .from("content")
    .createSignedUrl(filePath, 3600) as { data: { signedUrl: string } | null; error: unknown };

  if (signErr || !signedData) return { error: "Failed to generate download link." };

  return { url: signedData.signedUrl };
}
