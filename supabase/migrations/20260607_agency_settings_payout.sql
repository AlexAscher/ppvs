-- Agency-level settings (Sales Alerts + Eco Mode + Payout defaults)
-- and per-(model[,chatter]) split overrides.
--
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).

-- ───────────────────────────────────────────────────────────────────────
-- 1. agency_settings — one row per agency user
--
-- alerts_*  : Sales Alerts to a private TG channel of the agency's choice
-- eco_mode  : reduces VPS/MTProto load (slower polling, batched upserts)
-- default_split_* : global revenue split — overridable per-model / per-
-- (model,chatter) in payout_splits below.
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agency_settings (
  user_id                     uuid          PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Sales Alerts
  alerts_enabled              boolean       NOT NULL DEFAULT false,
  alerts_ppv                  boolean       NOT NULL DEFAULT true,
  alerts_tips                 boolean       NOT NULL DEFAULT true,
  -- Channel coordinates resolved at pick time (MTProto needs both for
  -- private channels). Title kept for UI display in Settings.
  alerts_channel_id           text,
  alerts_channel_access_hash  text,
  alerts_channel_title        text,
  -- Which of the agency's MTProto sessions to send alerts from. NULL =
  -- first model's session (set once any model is connected).
  alerts_sender_model_id      uuid          REFERENCES models(id) ON DELETE SET NULL,

  -- Eco Mode
  eco_mode_enabled            boolean       NOT NULL DEFAULT false,

  -- Default split (overridable per-model/per-chatter via payout_splits)
  default_split_model_pct     numeric(5,2)  NOT NULL DEFAULT 50.00,
  default_split_chatter_pct   numeric(5,2)  NOT NULL DEFAULT 20.00,
  default_split_agency_pct    numeric(5,2)  NOT NULL DEFAULT 30.00,

  updated_at                  timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT agency_settings_split_sums CHECK (
    default_split_model_pct + default_split_chatter_pct + default_split_agency_pct = 100
  )
);

ALTER TABLE agency_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agency_settings_select_own" ON agency_settings;
CREATE POLICY "agency_settings_select_own" ON agency_settings
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "agency_settings_insert_own" ON agency_settings;
CREATE POLICY "agency_settings_insert_own" ON agency_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "agency_settings_update_own" ON agency_settings;
CREATE POLICY "agency_settings_update_own" ON agency_settings
  FOR UPDATE USING (auth.uid() = user_id);


-- ───────────────────────────────────────────────────────────────────────
-- 2. payout_splits — per-model or per-(model,chatter) overrides
--
-- scope='model'   : override for a specific model (all sales by that model)
-- scope='chatter' : override for a specific (model, chatter) pair
--
-- Resolution priority on a sale:
--   1. payout_splits (scope='chatter') matching model_id + chatter_user_id
--   2. payout_splits (scope='model')   matching model_id
--   3. agency_settings.default_split_*
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payout_splits (
  id                uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_user_id    uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope             text          NOT NULL CHECK (scope IN ('model', 'chatter')),
  model_id          uuid          NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  chatter_user_id   uuid          REFERENCES auth.users(id) ON DELETE CASCADE,
  model_pct         numeric(5,2)  NOT NULL,
  chatter_pct       numeric(5,2)  NOT NULL,
  agency_pct        numeric(5,2)  NOT NULL,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT payout_splits_sums CHECK (model_pct + chatter_pct + agency_pct = 100),
  CONSTRAINT payout_splits_scope_chatter CHECK (
    (scope = 'model'   AND chatter_user_id IS NULL) OR
    (scope = 'chatter' AND chatter_user_id IS NOT NULL)
  )
);

-- One row per (agency, model) for model scope.
CREATE UNIQUE INDEX IF NOT EXISTS payout_splits_model_uniq
  ON payout_splits (agency_user_id, model_id)
  WHERE scope = 'model';

-- One row per (agency, model, chatter) for chatter scope.
CREATE UNIQUE INDEX IF NOT EXISTS payout_splits_chatter_uniq
  ON payout_splits (agency_user_id, model_id, chatter_user_id)
  WHERE scope = 'chatter';

-- Common lookup: resolve splits for a sale's model_id.
CREATE INDEX IF NOT EXISTS payout_splits_lookup_idx
  ON payout_splits (model_id, scope);

ALTER TABLE payout_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payout_splits_select_own" ON payout_splits;
CREATE POLICY "payout_splits_select_own" ON payout_splits
  FOR SELECT USING (auth.uid() = agency_user_id);

DROP POLICY IF EXISTS "payout_splits_insert_own" ON payout_splits;
CREATE POLICY "payout_splits_insert_own" ON payout_splits
  FOR INSERT WITH CHECK (auth.uid() = agency_user_id);

DROP POLICY IF EXISTS "payout_splits_update_own" ON payout_splits;
CREATE POLICY "payout_splits_update_own" ON payout_splits
  FOR UPDATE USING (auth.uid() = agency_user_id);

DROP POLICY IF EXISTS "payout_splits_delete_own" ON payout_splits;
CREATE POLICY "payout_splits_delete_own" ON payout_splits
  FOR DELETE USING (auth.uid() = agency_user_id);
