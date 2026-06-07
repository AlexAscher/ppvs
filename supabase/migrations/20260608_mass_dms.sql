-- Mass DM campaigns + per-recipient delivery rows.
--
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).

-- ───────────────────────────────────────────────────────────────────────
-- mass_dm_campaigns — one row per "send this message to a filtered fan
-- list" job. Persists across server restarts so the throttled worker
-- can resume.
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mass_dm_campaigns (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id      uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model_id            uuid          NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  -- The auth.users who actually clicked Send (agency owner or chatter).
  started_by          uuid          NOT NULL REFERENCES auth.users(id),
  -- Message template — supports {first_name} placeholder.
  message             text          NOT NULL,
  -- Filter snapshot used to materialize the recipient list. Stored for
  -- the campaign history so the agency can see what was targeted.
  -- Shape: { tags?: string[], min_spent?: number, last_seen_days?: number }
  filters             jsonb,
  -- Throttle floor/ceiling in ms (worker picks a random in-range delay
  -- between sends to mimic human typing). Defaults match the Recommended
  -- option in the picker.
  jitter_min_ms       int           NOT NULL DEFAULT 2000,
  jitter_max_ms       int           NOT NULL DEFAULT 4000,
  status              text          NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending','running','paused','completed','cancelled','failed')),
  total_recipients    int           NOT NULL DEFAULT 0,
  sent_count          int           NOT NULL DEFAULT 0,
  failed_count        int           NOT NULL DEFAULT 0,
  -- Worker updates this every iteration so a reaper on server-startup
  -- can spot 'running' rows that haven't heartbeat in N minutes (the
  -- process crashed mid-campaign) and resume them.
  last_heartbeat_at   timestamptz,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  started_at          timestamptz,
  finished_at         timestamptz
);

CREATE INDEX IF NOT EXISTS mass_dm_campaigns_agency_idx
  ON mass_dm_campaigns (agency_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mass_dm_campaigns_running_idx
  ON mass_dm_campaigns (status, last_heartbeat_at)
  WHERE status = 'running';

ALTER TABLE mass_dm_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mass_dm_campaigns_select_own" ON mass_dm_campaigns;
CREATE POLICY "mass_dm_campaigns_select_own" ON mass_dm_campaigns
  FOR SELECT USING (auth.uid() = agency_user_id OR auth.uid() = started_by);

DROP POLICY IF EXISTS "mass_dm_campaigns_insert_own" ON mass_dm_campaigns;
CREATE POLICY "mass_dm_campaigns_insert_own" ON mass_dm_campaigns
  FOR INSERT WITH CHECK (auth.uid() = started_by);

DROP POLICY IF EXISTS "mass_dm_campaigns_update_own" ON mass_dm_campaigns;
CREATE POLICY "mass_dm_campaigns_update_own" ON mass_dm_campaigns
  FOR UPDATE USING (auth.uid() = agency_user_id OR auth.uid() = started_by);


-- ───────────────────────────────────────────────────────────────────────
-- mass_dm_recipients — one row per fan in a campaign. Materialized at
-- campaign creation so we don't re-evaluate filters as fans come and go.
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mass_dm_recipients (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       uuid          NOT NULL REFERENCES mass_dm_campaigns(id) ON DELETE CASCADE,
  -- Snapshot of fan TG identity at materialize time.
  peer_id           text          NOT NULL,
  peer_access_hash  text,
  peer_username     text,
  first_name        text,
  status            text          NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','sent','failed','skipped')),
  sent_at           timestamptz,
  error             text,
  -- Worker picks rows by ordinal — gives the agency a deterministic
  -- "who got it first" trail.
  ordinal           int           NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS mass_dm_recipients_pending_idx
  ON mass_dm_recipients (campaign_id, status, ordinal)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS mass_dm_recipients_campaign_idx
  ON mass_dm_recipients (campaign_id, ordinal);

ALTER TABLE mass_dm_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mass_dm_recipients_select_own" ON mass_dm_recipients;
CREATE POLICY "mass_dm_recipients_select_own" ON mass_dm_recipients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM mass_dm_campaigns c
      WHERE c.id = mass_dm_recipients.campaign_id
        AND (auth.uid() = c.agency_user_id OR auth.uid() = c.started_by)
    )
  );
