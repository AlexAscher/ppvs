import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/admin-auth";
import { AdminClient } from "@/components/admin/AdminClient";

// Server-side gate: only emails in ADMIN_EMAILS may render the panel. Anyone
// else is bounced to their normal dashboard before any admin data is fetched.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/dashboard");

  return <AdminClient />;
}
