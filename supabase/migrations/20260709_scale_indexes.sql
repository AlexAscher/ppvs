-- Batch 99 P2-2 — indexes on the hot query paths.
--
-- Motivated by the 2026-07-07 outage where the free-tier Postgres started
-- refusing / slow-queuing reads once egress throttling kicked in. Even
-- without throttling, the queries below scan every time they're missing an
-- index — fine at 10 agencies, painful at 100.
--
-- All CREATE INDEX statements are IF NOT EXISTS + CONCURRENTLY so this is
-- safe to run on a live prod DB with no maintenance window.
--
-- ── Read paths targeted ────────────────────────────────────────────────
--  • Dashboard sales query: ppv_sends filtered by (model_id, status, paid_at)
--    at every dashboard render. Currently scans partition per model.
--  • Wallet balance:        ppv_sends / tips filtered by model_id + status.
--  • Auth: agency_chatters looked up by (chatter_id, model_id) on every
--    single-model API request via authorizeModelAccess.
--  • Fan feed sort:         fans (model_id, last_response_at DESC) drives
--    the dialog list ordering when there's no cached message.

-- 1. PPV sales — dashboard, payout report, wallet balance.
CREATE INDEX IF NOT EXISTS idx_ppv_sends_model_status_paid_at
  ON ppv_sends (model_id, status, paid_at DESC);

-- 2. Tips — same shape.
CREATE INDEX IF NOT EXISTS idx_tips_model_status_paid_at
  ON tips (model_id, status, paid_at DESC);

-- 3. Chatter's per-model sales (dashboard "my sales" scope).
CREATE INDEX IF NOT EXISTS idx_ppv_sends_chatter_model_paid_at
  ON ppv_sends (chatter_id, model_id, paid_at DESC)
  WHERE chatter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tips_chatter_model_paid_at
  ON tips (chatter_id, model_id, paid_at DESC)
  WHERE chatter_id IS NOT NULL;

-- 4. Chatter assignment lookup on every /api/... call that touches a model.
--    authorizeModelAccess() does .eq("chatter_id",...).eq("model_id",...).
CREATE INDEX IF NOT EXISTS idx_agency_chatters_chatter_model
  ON agency_chatters (chatter_id, model_id);

-- 5. Dialog list ordering. fan-activity sets last_response_at on every
--    incoming; sorted-desc reads dominate the fan sidebar.
CREATE INDEX IF NOT EXISTS idx_fans_model_last_response
  ON fans (model_id, last_response_at DESC NULLS LAST);

-- 6. Vault filtering: model + review_status (batch 96+ chatter picker skips
--    pending/rejected; admin Vault filters by pending).
CREATE INDEX IF NOT EXISTS idx_ppvs_model_review_status
  ON ppvs (model_id, review_status);

-- 7. Pay-code lookup (webhook fulfilment). `code` is unique but the
--    partial index below is smaller and lets pending → paid transitions
--    hit an index-only scan.
CREATE INDEX IF NOT EXISTS idx_ppv_sends_code
  ON ppv_sends (code);
CREATE INDEX IF NOT EXISTS idx_tips_code
  ON tips (code);

-- 8. Signup-requests admin queue sorted by created_at.
CREATE INDEX IF NOT EXISTS idx_signup_requests_status_created
  ON signup_requests (status, created_at DESC);

-- 9. Recent chat-events for the chatter sidebar banners.
CREATE INDEX IF NOT EXISTS idx_chat_system_events_model_peer_created
  ON chat_system_events (model_id, peer_id, created_at DESC);
