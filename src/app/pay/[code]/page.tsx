import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { PayClient } from "./PayClient";

type LinkWithItem = {
  price: number;
  vault_items: {
    title: string;
    thumb_path: string;
    file_type: "image" | "video";
    default_price: number;
  } | null;
};

export default async function PayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminSupabaseClient() as any;

  const { data: link } = await admin
    .from("ppv_links")
    .select("price, vault_items(title, thumb_path, file_type, default_price)")
    .eq("code", code)
    .single() as { data: LinkWithItem | null };

  if (!link) notFound();

  const item = link.vault_items;
  if (!item) notFound();

  const { data: thumbData } = admin.storage.from("vault").getPublicUrl(item.thumb_path);

  return (
    <PayClient
      code={code}
      title={item.title}
      price={link.price}
      thumbUrl={thumbData.publicUrl}
      fileType={item.file_type}
    />
  );
}
