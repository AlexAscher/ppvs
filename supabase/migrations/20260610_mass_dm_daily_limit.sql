-- Optional per-campaign daily send cap. When today's sent count reaches
-- daily_limit, the worker pauses the campaign (status='paused') instead
-- of finishing — the agency can resume it the next day.
--
-- Safe to run anytime; the create endpoint + worker degrade gracefully
-- if this column is missing.
--
-- Run in Supabase SQL Editor.

ALTER TABLE mass_dm_campaigns
  ADD COLUMN IF NOT EXISTS daily_limit int;
