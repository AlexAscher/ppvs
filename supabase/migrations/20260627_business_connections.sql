-- Telegram Business "Chat Automation" connections. When a model connects our
-- bot to her account (Settings → Chat Automation → add @ppvstarbot), Telegram
-- sends a `business_connection` update. We store it keyed by the connection id
-- and the model's Telegram user id so the PPV send path can call
-- sendPaidMedia(business_connection_id, …) on her behalf — native Paid Media,
-- Stars credited to our bot.
create table if not exists business_connections (
  connection_id text primary key,
  tg_user_id    text not null,
  user_chat_id  text,
  can_reply     boolean default false,
  rights        jsonb,
  is_enabled    boolean default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists business_connections_tg_user_idx on business_connections(tg_user_id);
