import { requireAdmin } from "@/lib/admin-auth";

// Cheap probe used by the dashboard sidebar to decide whether to show the
// "Admin" link. 200 → admin, 401/403 → not.
export async function GET() {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;
  return Response.json({ ok: true, email: auth.user.email });
}
