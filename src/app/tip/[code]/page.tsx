import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import { TipClient } from "./TipClient";

type TipRow = {
  code: string;
  amount: number | string;
  message: string | null;
  peer_username: string | null;
  status: string;
};

export default async function TipPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const admin = createAdminSupabaseClient();
  const { data: tip, error } = await admin
    .from("tips")
    .select("code, amount, message, peer_username, status")
    .eq("code", code)
    .maybeSingle();

  if (error || !tip) return notFound();

  const row = tip as TipRow;

  return (
    <TipClient
      code={row.code}
      amount={Number(row.amount)}
      message={row.message ?? ""}
      peerUsername={row.peer_username}
      initiallyPaid={row.status === "paid"}
    />
  );
}
