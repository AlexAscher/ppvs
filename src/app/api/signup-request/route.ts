import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { consume, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { sendAdminSignupAlert } from "@/lib/sales-alerts";
import { encrypt } from "@/lib/crypto";

/**
 * POST /api/signup-request
 *  { email, password, displayName, role, agencyName }
 *
 * v3 (temporary): signups don't hit Supabase Auth directly — they land in
 * signup_requests for a human to review. On approval the stored password is
 * decrypted and passed to `admin.auth.admin.createUser` so the applicant
 * can log in with the credentials they chose (see admin/signup-requests).
 *
 * The password is stored ENCRYPTED (AES-256-GCM via SESSION_ENC_KEY) rather
 * than plaintext. If the requests table leaks in isolation, passwords stay
 * confidential; the trust envelope matches session_string / api_hash on
 * `models`, which use the same key.
 */

export async function POST(req: NextRequest) {
  // Cap signup floods by IP — the endpoint is public and previously took a
  // pending row per POST with no limit.
  const ip = getClientIp(req);
  if (!consume(`signup|${ip}`, 5, 60_000)) return tooManyRequests(60);

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    password?: string;
    displayName?: string;
    role?: string;
    agencyName?: string | null;
    agencyTelegram?: string | null;
    referralCode?: string | null;
  } | null;
  const email = (body?.email ?? "").trim().toLowerCase();
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return Response.json({ error: "A valid email is required" }, { status: 400 });
  }
  const password = (body?.password ?? "").trim();
  if (password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  let encryptedPassword: string;
  try {
    encryptedPassword = encrypt(password);
  } catch (e) {
    console.error("[signup-request] encrypt failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "Signup temporarily unavailable" }, { status: 503 });
  }
  const displayName = (body?.displayName ?? "").trim() || null;
  const role = body?.role === "chatter" ? "chatter" : "agency";
  const agencyName = role === "agency" ? (body?.agencyName ?? "").trim() || null : null;
  // Optional agency Telegram handle. Normalise to "@handle" for a consistent
  // shape in the DB; drop if just "@" or a stray character.
  const rawTg = role === "agency" ? (body?.agencyTelegram ?? "").trim() : "";
  const normalizedTg = rawTg.replace(/^@+/, "").trim();
  const agencyTelegram = normalizedTg ? `@${normalizedTg}` : null;
  // Referral code from /signup?ref=CODE. Only meaningful for agencies —
  // that's who has GMV to share. Uppercased to match our generated codes;
  // stored as-is (validated against referral_links at approval-report time,
  // not here — a stale code just tags nothing).
  const referralCode =
    role === "agency" && typeof body?.referralCode === "string"
      ? body.referralCode.trim().toUpperCase().slice(0, 32) || null
      : null;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("signup_requests")
    .insert({
      email,
      password: encryptedPassword,
      display_name: displayName,
      role,
      agency_name: agencyName,
      agency_telegram: agencyTelegram,
      referral_code: referralCode,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) {
    // 23505 = unique violation on the "pending email" partial index — the user
    // clicked submit twice or is retrying. Treat as success from their POV.
    if ((error as { code?: string }).code === "23505") {
      return Response.json({ ok: true, deduplicated: true });
    }
    console.error("[signup-request] insert failed:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
  // Fire a Telegram DM to every connected admin channel so the platform
  // owner sees the pending request without polling /admin → Signups.
  // Fire-and-forget: alert failure never blocks the applicant.
  sendAdminSignupAlert({
    email,
    role: role as "agency" | "chatter",
    agencyName,
  });
  return Response.json({ ok: true, id: data.id });
}
