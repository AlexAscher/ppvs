import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/admin-auth";
import { GlobalAlertsClient } from "./GlobalAlertsClient";

export const dynamic = "force-dynamic";

export default async function GlobalAlertsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/dashboard");

  return <GlobalAlertsClient adminEmail={user.email!} />;
}
