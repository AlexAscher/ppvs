-- Auto-reply delay + Fan profile basics
-- Run in Supabase SQL Editor.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Auto-reply delay (seconds, 0 = instant)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE models
  ADD COLUMN IF NOT EXISTS auto_reply_delay_sec integer NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Fan profile basics: editable bio / birthdate / location
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE fans
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS birthdate date,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS last_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz;
