-- Batch 93b: agency's Telegram handle captured at signup time so operations
-- can DM the agency owner even before they wire Sales Alerts. Optional; the
-- admin flow just copies whatever's present into user_metadata on approve.

ALTER TABLE signup_requests
  ADD COLUMN IF NOT EXISTS agency_telegram TEXT;
