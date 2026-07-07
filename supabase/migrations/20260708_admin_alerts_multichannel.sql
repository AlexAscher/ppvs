-- Batch 98: platform-owner Sales Alerts becomes a MULTI-CHANNEL fan-out.
-- Previously admin_sales_channels was keyed by admin_email (one bound bot
-- chat per admin). The panel needs to Connect N chats — a phone, a desktop,
-- a co-owner's account — and every event goes to every connected chat.
--
-- Also: two new event flags for the vault-approval and signup-review
-- workflows. Removed the deprecated alerts_tips flag (Tips flow retired).

-- 1. Add a surrogate id primary key so multiple rows can share the same
--    admin_email (or no admin_email at all — the panel now decides).
ALTER TABLE admin_sales_channels
  ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();

-- 2. Optional human-readable label captured from the bot's /start Telegram
--    metadata (first name / username). Just for the UI list.
ALTER TABLE admin_sales_channels
  ADD COLUMN IF NOT EXISTS label TEXT;

-- 3. New per-channel event toggles. Both default TRUE — existing rows keep
--    getting sale alerts, and new event categories fire out of the box.
ALTER TABLE admin_sales_channels
  ADD COLUMN IF NOT EXISTS alerts_signups BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS alerts_vault BOOLEAN NOT NULL DEFAULT TRUE;

-- 4. Swap the primary key from admin_email → id. admin_email stays as a
--    nullable audit column ("who connected this row"). bot_chat_id keeps
--    its UNIQUE constraint (one row per Telegram chat).
ALTER TABLE admin_sales_channels DROP CONSTRAINT IF EXISTS admin_sales_channels_pkey;
ALTER TABLE admin_sales_channels ADD PRIMARY KEY (id);
ALTER TABLE admin_sales_channels ALTER COLUMN admin_email DROP NOT NULL;

-- 5. Drop the deprecated Tips flag. Any code referencing alerts_tips is
--    updated in this batch — the column would just be dead weight.
ALTER TABLE admin_sales_channels DROP COLUMN IF EXISTS alerts_tips;
