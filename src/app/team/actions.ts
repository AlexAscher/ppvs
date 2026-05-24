"use server";

import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function getServerUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function inviteChatter(
  chatterEmail: string,
): Promise<{ error?: string }> {
  const user = await getServerUser();
  if (!user) return { error: "Not authenticated" };
  if (user.user_metadata?.role !== "agency")
    return { error: "Only agencies can invite chatters" };

  const admin = createAdminSupabaseClient() as any;

  // Check if invitation already exists
  const { data: existing } = await admin
    .from("invitations")
    .select("id, status")
    .eq("agency_id", user.id)
    .eq("chatter_email", chatterEmail.toLowerCase())
    .in("status", ["pending", "accepted"])
    .maybeSingle();

  if (existing) return { error: "This chatter has already been invited" };

  const { error } = await admin.from("invitations").insert({
    agency_id: user.id,
    agency_name:
      user.user_metadata?.agency_name ??
      user.user_metadata?.display_name ??
      "Agency",
    chatter_email: chatterEmail.toLowerCase(),
    status: "pending",
  });

  if (error) return { error: "Failed to send invitation" };
  return {};
}

export async function acceptInvitation(
  invitationId: string,
): Promise<{ error?: string }> {
  const user = await getServerUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminSupabaseClient() as any;

  // Verify invitation belongs to this chatter's email
  const { data: inv } = await admin
    .from("invitations")
    .select("id, agency_id, chatter_email, status")
    .eq("id", invitationId)
    .eq("status", "pending")
    .maybeSingle();

  if (!inv) return { error: "Invitation not found or already processed" };
  if (inv.chatter_email !== user.email?.toLowerCase())
    return { error: "This invitation is not for you" };

  // Update invitation
  await admin
    .from("invitations")
    .update({ status: "accepted", chatter_id: user.id })
    .eq("id", invitationId);

  // Create agency_chatters link (ignore duplicate)
  await admin
    .from("agency_chatters")
    .insert({ agency_id: inv.agency_id, chatter_id: user.id })
    .select();

  return {};
}

export async function declineInvitation(
  invitationId: string,
): Promise<{ error?: string }> {
  const user = await getServerUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminSupabaseClient() as any;

  const { data: inv } = await admin
    .from("invitations")
    .select("chatter_email")
    .eq("id", invitationId)
    .maybeSingle();

  if (!inv || inv.chatter_email !== user.email?.toLowerCase())
    return { error: "Invitation not found" };

  await admin
    .from("invitations")
    .update({ status: "declined" })
    .eq("id", invitationId);
  return {};
}

export async function removeChatter(
  chatterId: string,
): Promise<{ error?: string }> {
  const user = await getServerUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminSupabaseClient() as any;
  await admin
    .from("agency_chatters")
    .delete()
    .eq("agency_id", user.id)
    .eq("chatter_id", chatterId);
  await admin
    .from("invitations")
    .update({ status: "declined" })
    .eq("agency_id", user.id)
    .eq("chatter_id", chatterId);

  return {};
}
