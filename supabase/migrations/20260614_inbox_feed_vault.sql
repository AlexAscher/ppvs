-- Vault bundles + PPV urgency timer
-- Run this whole file in the Supabase SQL Editor.
--
-- (The Inbox needs no schema — it reuses the dialogs API. The agency Feed
--  was removed, so its agency_posts table is intentionally NOT created here.)
--
-- 1. ppv_groups.bundle_price — sell a whole PPV group as one unlock at this price.
-- 2. ppv_sends.expires_at    — urgency timer; after this instant the pay link is
--                              dead (deliver / checkout refuse it). NULL = never.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Vault bundles — one price unlocks every item in the group
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE ppv_groups
  ADD COLUMN IF NOT EXISTS bundle_price numeric;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Urgency timer — pay link expires at this instant (NULL = never expires)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE ppv_sends
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
