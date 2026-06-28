-- Cache the model's Telegram user id so the Business-connection lookup is a
-- single DB hit instead of a gramJS getMe() round-trip every time we render
-- the Creators page or send a PPV.
alter table models add column if not exists tg_user_id text;
create index if not exists models_tg_user_id_idx on models(tg_user_id);
