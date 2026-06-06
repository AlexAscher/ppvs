-- Tips table: one row per tip request sent by a chatter.
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).

CREATE TABLE IF NOT EXISTS tips (
  id             uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  code           text          UNIQUE NOT NULL,
  model_id       uuid          REFERENCES models(id) ON DELETE CASCADE,
  chatter_id     uuid          REFERENCES auth.users(id),
  peer_id        text          NOT NULL,
  peer_access_hash text,
  peer_username  text,
  amount         numeric(10,2) NOT NULL,
  message        text,
  status         text          NOT NULL DEFAULT 'pending',  -- pending | paid
  paid_at        timestamptz,
  created_at     timestamptz   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tips_code_idx           ON tips (code);
CREATE INDEX IF NOT EXISTS tips_model_status_idx   ON tips (model_id, status);
CREATE INDEX IF NOT EXISTS tips_peer_idx            ON tips (model_id, peer_id);
