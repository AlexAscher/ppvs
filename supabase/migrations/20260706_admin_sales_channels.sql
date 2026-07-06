-- Batch 93c: platform-owner sales notifications.
-- Every sale (PPV or tip) fans out to any admin who has connected the
-- Sales Alerts bot from /admin/global-alerts. Independent of per-agency
-- alerts_bot — an agency's channel keeps working unchanged.
--
-- One row per admin email (matches ADMIN_EMAILS allowlist). bot_chat_id is
-- the private DM the notifications bot has with that admin.

CREATE TABLE IF NOT EXISTS admin_sales_channels (
  admin_email TEXT PRIMARY KEY,
  bot_chat_id TEXT UNIQUE,
  -- One-time code embedded in the deep link `t.me/<bot>?start=admin_<code>`.
  -- Consumed and cleared by the bot poller on Start.
  link_code TEXT UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
