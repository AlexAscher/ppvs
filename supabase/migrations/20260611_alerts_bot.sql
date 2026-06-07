-- Bot-based Sales Alerts: the agency links its personal Telegram to the
-- platform bot via a one-time /start code, and the bot DMs alerts there.
-- No extra userbot, no ban risk.
--
-- Run in Supabase SQL Editor.

ALTER TABLE agency_settings
  ADD COLUMN IF NOT EXISTS alerts_bot_chat_id   text,
  ADD COLUMN IF NOT EXISTS alerts_bot_link_code text;

-- Fast lookup when the bot poller resolves an incoming /start <code>.
CREATE INDEX IF NOT EXISTS agency_settings_bot_link_code_idx
  ON agency_settings (alerts_bot_link_code)
  WHERE alerts_bot_link_code IS NOT NULL;
