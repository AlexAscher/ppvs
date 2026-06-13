import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { PLATFORM_FEE_PCT } from "@/lib/platform";
import { PayClient } from "./PayClient";

type SendRow = {
  id: string;
  total_price: number | string;
  caption: string | null;
  peer_username: string | null;
  status: string;
  expires_at: string | null;
};

// Supabase's typed select infers the relation as an array even though the FK
// is many-to-one; we accept both shapes and normalize.
type ItemRowRaw = {
  ordinal: number;
  ppvs:
    | { id: string; name: string; preview_url: string | null }
    | { id: string; name: string; preview_url: string | null }[]
    | null;
};

export default async function PayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const admin = createAdminSupabaseClient();

  // Fetch the send + its id in one query so we don't round-trip twice.
  const { data: sendRaw } = await admin
    .from("ppv_sends")
    .select("id, total_price, caption, peer_username, status, expires_at")
    .eq("code", code)
    .maybeSingle();
  if (!sendRaw) notFound();
  const send = sendRaw as SendRow;

  const { data: itemsRaw } = await admin
    .from("ppv_send_items")
    .select("ordinal, ppvs(id, name, preview_url)")
    .eq("send_id", send.id)
    .order("ordinal", { ascending: true });

  // The locked page ships ONLY the pre-blurred preview, served through the
  // signed-url endpoint (?kind=preview is public) so it keeps working once
  // the bucket is private. We never reference the original here — that would
  // leak the un-paywalled file. Items without a preview render a lock tile.
  const items = ((itemsRaw ?? []) as unknown as ItemRowRaw[]).map((it) => {
    const ppv = Array.isArray(it.ppvs) ? it.ppvs[0] ?? null : it.ppvs;
    return {
      name: ppv?.name ?? "Item",
      media_url: ppv?.preview_url && ppv?.id ? `/api/ppv/file/${ppv.id}?kind=preview` : null,
    };
  });

  // Buyer-facing price = chatter's base + platform fee on top. We must
  // compute the same total here as in /api/payments/malum/create so what
  // the buyer sees on /pay matches the Malum checkout total to the cent.
  // Math.round on cents avoids floating-point drift on e.g. $9.99 × 1.10.
  const basePrice = Number(send.total_price ?? 0);
  const fee = Math.round(basePrice * PLATFORM_FEE_PCT * 100) / 100;
  const total = Math.round(basePrice * (1 + PLATFORM_FEE_PCT) * 100) / 100;

  return (
    <PayClient
      code={code}
      items={items}
      basePrice={basePrice}
      fee={fee}
      total={total}
      caption={send.caption ?? ""}
      recipient={send.peer_username ?? null}
      initiallyDelivered={send.status === "delivered"}
      expiresAt={send.expires_at}
    />
  );
}
