-- Inbox / Feed / Vault-bundles / Urgency-timer
-- Run this whole file in the Supabase SQL Editor.
--
-- 1. agency_posts        — internal agency feed (announcements / scripts).
--                          The agency composes; its chatters read.
-- 2. ppv_groups.bundle_price
--                        — sell a whole PPV group as one unlock at this price.
-- 3. ppv_sends.expires_at
--                        — urgency timer; after this instant the pay link is
--                          dead (deliver / checkout refuse it).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Agency feed
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agency_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text,
  body        text NOT NULL,
  image_url   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agency_posts_agency_idx
  ON agency_posts (agency_id, created_at DESC);

ALTER TABLE agency_posts ENABLE ROW LEVEL SECURITY;

-- The API reads/writes through the service-role admin client (which bypasses
-- RLS and scopes by agency_id in code), mirroring fan_groups / presence. This
-- policy just lets the agency owner touch its own rows directly if needed.
DROP POLICY IF EXISTS agency_posts_owner ON agency_posts;
CREATE POLICY agency_posts_owner ON agency_posts
  USING (auth.uid() = agency_id)
  WITH CHECK (auth.uid() = agency_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Vault bundles — one price unlocks every item in the group
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE ppv_groups
  ADD COLUMN IF NOT EXISTS bundle_price numeric;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Urgency timer — pay link expires at this instant (NULL = never expires)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE ppv_sends
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
