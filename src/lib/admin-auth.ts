import { getCachedAuthUser, type CachedAuthUser } from "@/lib/auth-cache";

/**
 * Platform-admin gate. There is no "admin" role in the DB — the platform owner
 * is identified by an env allowlist (ADMIN_EMAILS, comma-separated). Every
 * /api/admin/* route calls `requireAdmin()`; the /admin page server-checks the
 * same allowlist before rendering.
 *
 * Uses the cached auth-user helper so the hot polling endpoint (whoami, called
 * from the dashboard sidebar) never blocks on a slow Supabase round-trip.
 */

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = getAdminEmails();
  return list.length > 0 && list.includes(email.toLowerCase());
}

type AdminResult = { user: CachedAuthUser } | { errorResponse: Response };

export async function requireAdmin(): Promise<AdminResult> {
  const user = await getCachedAuthUser();
  if (!user) {
    return { errorResponse: Response.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  if (!isAdminEmail(user.email)) {
    return { errorResponse: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}
