import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { PLATFORM_FEE_PCT } from "@/lib/platform";
import { SuccessClient } from "./SuccessClient";

type SendRow = {
  id: string;
  status: string;
  caption: string | null;
  total_price: number | string;
  peer_username: string | null;
};

type ItemRowRaw = {
  ordinal: number;
  ppvs:
    | { name: string; media_url: string | null; preview_url: string | null }
    | { name: string; media_url: string | null; preview_url: string | null }[]
    | null;
};

// Always evaluate live — we depend on `ppv_sends.status` flipping when the
// webhook fires, and stale SSR would hand the buyer the blurred preview
// long after the payment cleared.
export const dynamic = "force-dynamic";

/**
 * Landing page after Malum's hosted checkout returns the buyer.
 *
 * Race with the webhook: Malum may bounce the buyer back before the
 * webhook finishes hitting our endpoint. SSR ships whichever media is
 * safe — **previews only** while status is unpaid, originals once paid.
 * The client polls the cheap status endpoint and reloads the page when
 * the row flips, which re-runs this SSR with the new status.
 *
 * That keeps original URLs out of the HTML until we've verified payment
 * server-side, while still giving the buyer an "unlock" the moment the
 * webhook lands.
 */
export default async function SuccessPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const admin = createAdminSupabaseClient();

  const { data: sendRaw } = await admin
    .from("ppv_sends")
    .select("id, status, caption, total_price, peer_username")
    .eq("code", code)
    .maybeSingle();
  if (!sendRaw) notFound();
  const send = sendRaw as SendRow;

  const paid = send.status === "paid" || send.status === "delivered";

  const { data: itemsRaw } = await admin
    .from("ppv_send_items")
    .select("ordinal, ppvs(name, media_url, preview_url)")
    .eq("send_id", send.id)
    .order("ordinal", { ascending: true });

  // Critical: hand the client `media_url` ONLY when the payment has been
  // confirmed by Malum. Until then we ship the blurred `preview_url` (same
  // posture as /pay/{code}) so devtools can't extract the original.
  const items = ((itemsRaw ?? []) as unknown as ItemRowRaw[]).map((it) => {
    const ppv = Array.isArray(it.ppvs) ? it.ppvs[0] ?? null : it.ppvs;
    return {
      name: ppv?.name ?? "Item",
      media_url: paid ? ppv?.media_url ?? null : ppv?.preview_url ?? null,
    };
  });

  return (
    <SuccessClient
      code={code}
      items={items}
      price={
        Math.round(Number(send.total_price ?? 0) * (1 + PLATFORM_FEE_PCT) * 100) / 100
      }
      caption={send.caption ?? ""}
      recipient={send.peer_username ?? null}
      initiallyPaid={paid}
    />
  );
}
