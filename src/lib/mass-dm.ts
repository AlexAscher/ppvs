import { Api } from "telegram";
import bigInt from "big-integer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { withTelegramClient } from "@/lib/telegram-pool";

/**
 * Mass DMs — throttled broadcast of a templated message to a filtered
 * fan list of one model.
 *
 * Per-recipient delay is a random in-range jitter (2–4s default) — that
 * mimics human typing well enough to keep Telegram's anti-spam from
 * flagging the account, and Sales Alerts / regular polling keep
 * working in parallel.
 *
 * Worker model:
 *   1. /api/mass-dm/create materializes recipients from the snapshot
 *      filter; persists campaign + rows with status='pending'.
 *   2. /api/mass-dm/<id>/start marks campaign 'running', kicks off
 *      runCampaign() via Next 16's after() so the API returns fast.
 *   3. runCampaign() loops over pending recipients, sleeps the jitter
 *      between sends, updates each row's status, updates the campaign
 *      counts + heartbeat.
 *   4. /api/mass-dm/<id>/stop flips status to 'cancelled' and the loop
 *      sees it on the next iteration check.
 */

export type Filters = {
  tags?: string[];        // any-of match
  minSpent?: number;
  lastSeenDays?: number;
};

export type FanRow = {
  peer_id: string;
  peer_access_hash: string | null;
  telegram_username: string | null;
  telegram_name: string | null;
  total_spent: number | string | null;
  tags: string[] | null;
  last_seen_at: string | null;
};

const recentlyMaterialized = new Map<string, number>();
const inflightCampaigns = new Set<string>();

/**
 * Pull every fan of `modelId` that matches `filters`. Tag matching is
 * "any-of" (a fan with any matching tag passes). Other filters AND
 * together.
 */
export async function materializeRecipients(
  admin: SupabaseClient,
  modelId: string,
  filters: Filters,
): Promise<FanRow[]> {
  let q = admin
    .from("fans")
    .select(
      "peer_id, peer_access_hash, telegram_username, telegram_name, total_spent, tags, last_seen_at",
    )
    .eq("model_id", modelId);

  if (filters.minSpent && filters.minSpent > 0) {
    q = q.gte("total_spent", filters.minSpent);
  }
  if (filters.lastSeenDays && filters.lastSeenDays > 0) {
    const since = new Date(Date.now() - filters.lastSeenDays * 86_400_000).toISOString();
    q = q.gte("last_seen_at", since);
  }
  if (filters.tags && filters.tags.length > 0) {
    // overlaps() — true if any of fan.tags ∩ filters.tags is non-empty.
    q = q.overlaps("tags", filters.tags);
  }

  const { data } = await q.limit(5000);
  return (data ?? []) as FanRow[];
}

/** Substitute {first_name}/{name}/{username} placeholders in a template. */
export function renderTemplate(template: string, fan: FanRow): string {
  const firstName = (fan.telegram_name ?? "").split(" ")[0] || "babe";
  const username = fan.telegram_username ? `@${fan.telegram_username}` : "";
  return template
    .replace(/\{first_name\}/gi, firstName)
    .replace(/\{name\}/gi, fan.telegram_name ?? firstName)
    .replace(/\{username\}/gi, username);
}

function pickJitter(min: number, max: number): number {
  const lo = Math.max(500, min);
  const hi = Math.max(lo + 100, max);
  return lo + Math.floor(Math.random() * (hi - lo));
}

/**
 * Run a campaign loop. Safe to call multiple times — the inflight set
 * dedupes. Returns once the campaign finishes / fails / is cancelled.
 */
export async function runCampaign(campaignId: string): Promise<void> {
  if (inflightCampaigns.has(campaignId)) return;
  inflightCampaigns.add(campaignId);
  const admin = createAdminSupabaseClient();
  try {
    await runCampaignInner(admin, campaignId);
  } catch (e) {
    console.error(
      `[mass-dm] campaign ${campaignId} crashed:`,
      e instanceof Error ? e.message : e,
    );
    await admin
      .from("mass_dm_campaigns")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
      })
      .eq("id", campaignId);
  } finally {
    inflightCampaigns.delete(campaignId);
  }
}

async function runCampaignInner(admin: SupabaseClient, campaignId: string) {
  // Pull campaign + model session credentials.
  const { data: campRaw } = await admin
    .from("mass_dm_campaigns")
    .select("id, agency_user_id, model_id, message, jitter_min_ms, jitter_max_ms, status")
    .eq("id", campaignId)
    .maybeSingle();
  type CampaignRow = {
    id: string;
    agency_user_id: string;
    model_id: string;
    message: string;
    jitter_min_ms: number;
    jitter_max_ms: number;
    status: string;
  };
  const campaign = campRaw as CampaignRow | null;
  if (!campaign) return;
  if (campaign.status === "cancelled" || campaign.status === "completed") return;

  const { data: modelRaw } = await admin
    .from("models")
    .select("id, name, session_string, api_id, api_hash, session_status")
    .eq("id", campaign.model_id)
    .maybeSingle();
  type ModelRow = {
    id: string;
    name: string;
    session_string: string | null;
    api_id: number | null;
    api_hash: string | null;
    session_status: string | null;
  };
  const model = modelRaw as ModelRow | null;
  if (!model?.session_string || !model.api_id || !model.api_hash) {
    await admin
      .from("mass_dm_campaigns")
      .update({ status: "failed", finished_at: new Date().toISOString() })
      .eq("id", campaignId);
    return;
  }
  if (model.session_status === "expired") {
    await admin
      .from("mass_dm_campaigns")
      .update({ status: "failed", finished_at: new Date().toISOString() })
      .eq("id", campaignId);
    return;
  }

  await admin
    .from("mass_dm_campaigns")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  // Iterate pending recipients in ordinal order.
  // Re-query each iteration so a /stop flips the loop cheaply.
  for (;;) {
    // Cancel check.
    const { data: live } = await admin
      .from("mass_dm_campaigns")
      .select("status, sent_count, failed_count, total_recipients")
      .eq("id", campaignId)
      .maybeSingle();
    type Live = {
      status: string;
      sent_count: number;
      failed_count: number;
      total_recipients: number;
    };
    const liveRow = live as Live | null;
    if (!liveRow || liveRow.status === "cancelled" || liveRow.status === "paused") return;

    // Done?
    if (liveRow.sent_count + liveRow.failed_count >= liveRow.total_recipients) {
      await admin
        .from("mass_dm_campaigns")
        .update({ status: "completed", finished_at: new Date().toISOString() })
        .eq("id", campaignId);
      return;
    }

    const { data: nextRaw } = await admin
      .from("mass_dm_recipients")
      .select("id, peer_id, peer_access_hash, peer_username, first_name")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .order("ordinal", { ascending: true })
      .limit(1)
      .maybeSingle();
    type NextRow = {
      id: string;
      peer_id: string;
      peer_access_hash: string | null;
      peer_username: string | null;
      first_name: string | null;
    };
    const recipient = nextRaw as NextRow | null;
    if (!recipient) {
      // No pending rows but counts say not done — shouldn't happen; finish.
      await admin
        .from("mass_dm_campaigns")
        .update({ status: "completed", finished_at: new Date().toISOString() })
        .eq("id", campaignId);
      return;
    }

    const text = renderTemplate(campaign.message, {
      peer_id: recipient.peer_id,
      peer_access_hash: recipient.peer_access_hash,
      telegram_username: recipient.peer_username,
      telegram_name: recipient.first_name,
      total_spent: null,
      tags: null,
      last_seen_at: null,
    });

    let sendError: string | null = null;
    try {
      await withTelegramClient(
        model.id,
        model.session_string!,
        model.api_id!,
        model.api_hash!,
        async (client) => {
          const peer = new Api.InputPeerUser({
            userId: bigInt(recipient.peer_id),
            accessHash: bigInt(recipient.peer_access_hash ?? "0"),
          });
          await client.sendMessage(peer, {
            message: text,
            linkPreview: false,
          });
        },
        20_000,
      );
    } catch (e) {
      sendError = e instanceof Error ? e.message : String(e);
    }

    if (sendError) {
      await admin
        .from("mass_dm_recipients")
        .update({
          status: "failed",
          error: sendError.slice(0, 500),
        })
        .eq("id", recipient.id);
      await admin.rpc("increment_mass_dm_failed", { cid: campaignId }).then(
        () => undefined,
        async () => {
          // Fallback if the rpc isn't installed: read-modify-write.
          const cur = liveRow.failed_count + 1;
          await admin
            .from("mass_dm_campaigns")
            .update({ failed_count: cur, last_heartbeat_at: new Date().toISOString() })
            .eq("id", campaignId);
        },
      );

      // If Telegram tells us to slow down, honor a longer cooldown.
      if (/FLOOD_WAIT_(\d+)/.test(sendError)) {
        const m = sendError.match(/FLOOD_WAIT_(\d+)/);
        const secs = m ? Math.min(120, Math.max(10, Number(m[1]))) : 60;
        await sleep(secs * 1000);
      }
    } else {
      await admin
        .from("mass_dm_recipients")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", recipient.id);
      const cur = liveRow.sent_count + 1;
      await admin
        .from("mass_dm_campaigns")
        .update({ sent_count: cur, last_heartbeat_at: new Date().toISOString() })
        .eq("id", campaignId);
    }

    await sleep(pickJitter(campaign.jitter_min_ms, campaign.jitter_max_ms));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Coalesce repeated 'preview' calls within 2s to keep the UI snappy
 *  but not hammer Supabase as the user types in filter sliders. */
export function shouldDebouncePreview(key: string): boolean {
  const now = Date.now();
  const prev = recentlyMaterialized.get(key) ?? 0;
  if (now - prev < 2000) return true;
  recentlyMaterialized.set(key, now);
  return false;
}
