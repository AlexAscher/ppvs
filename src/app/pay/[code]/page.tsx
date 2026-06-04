import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { PayClient } from "./PayClient";

type SendRow = {
  id: string;
  total_price: number | string;
  caption: string | null;
  peer_username: string | null;
  status: string;
};

// Supabase's typed select infers the relation as an array even though the FK
// is many-to-one; we accept both shapes and normalize.
type ItemRowRaw = {
  ordinal: number;
  ppvs:
    | { name: string; media_url: string | null; preview_url: string | null }
    | { name: string; media_url: string | null; preview_url: string | null }[]
    | null;
};

export default async function PayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const admin = createAdminSupabaseClient();

  // Fetch the send + its id in one query so we don't round-trip twice.
  const { data: sendRaw } = await admin
    .from("ppv_sends")
    .select("id, total_price, caption, peer_username, status")
    .eq("code", code)
    .maybeSingle();
  if (!sendRaw) notFound();
  const send = sendRaw as SendRow;

  const { data: itemsRaw } = await admin
    .from("ppv_send_items")
    .select("ordinal, ppvs(name, media_url, preview_url)")
    .eq("send_id", send.id)
    .order("ordinal", { ascending: true });

  // The locked page ships ONLY the pre-blurred `preview_url`. We deliberately
  // never fall back to the original `media_url` — that would leak the
  // unpaywalled file (the storage bucket is currently public, so a URL is the
  // full asset). For items without a preview the client renders a lock tile.
  const items = ((itemsRaw ?? []) as unknown as ItemRowRaw[]).map((it) => {
    const ppv = Array.isArray(it.ppvs) ? it.ppvs[0] ?? null : it.ppvs;
    return {
      name: ppv?.name ?? "Item",
      media_url: ppv?.preview_url ?? null,
    };
  });

  return (
    <PayClient
      code={code}
      items={items}
      price={Number(send.total_price ?? 0)}
      caption={send.caption ?? ""}
      recipient={send.peer_username ?? null}
      initiallyDelivered={send.status === "delivered"}
    />
  );
}
