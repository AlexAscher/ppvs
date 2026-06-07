-- Conversation Labels (single status per chat), Fan Timezone histogram,
-- and Mass DM A/B columns.
--
-- Run in Supabase SQL Editor.

-- ───────────────────────────────────────────────────────────────────────
-- Conversation Labels: a per-agency library + one status per (model,peer)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_labels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  color           text NOT NULL DEFAULT '#6366f1',
  position        int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_labels_name_per_agency UNIQUE (agency_user_id, name)
);
ALTER TABLE conversation_labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_labels_own ON conversation_labels;
CREATE POLICY conversation_labels_own ON conversation_labels
  USING (auth.uid() = agency_user_id) WITH CHECK (auth.uid() = agency_user_id);

CREATE TABLE IF NOT EXISTS conversation_status (
  model_id   uuid NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  peer_id    text NOT NULL,
  label_id   uuid NOT NULL REFERENCES conversation_labels(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (model_id, peer_id)
);
CREATE INDEX IF NOT EXISTS conversation_status_label_idx ON conversation_status (label_id);
ALTER TABLE conversation_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_status_own ON conversation_status;
CREATE POLICY conversation_status_own ON conversation_status
  USING (EXISTS (SELECT 1 FROM models m WHERE m.id = conversation_status.model_id AND m.agency_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM models m WHERE m.id = conversation_status.model_id AND m.agency_user_id = auth.uid()));

-- ───────────────────────────────────────────────────────────────────────
-- Fan activity-hour histogram (UTC hour 0-23) for timezone detection.
-- Filled going forward by the NewMessage hook; mode = most active hour.
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fan_activity_hours (
  model_id uuid NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  peer_id  text NOT NULL,
  hour     smallint NOT NULL CHECK (hour BETWEEN 0 AND 23),
  cnt      int NOT NULL DEFAULT 0,
  PRIMARY KEY (model_id, peer_id, hour)
);
ALTER TABLE fan_activity_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fan_activity_hours_own ON fan_activity_hours;
CREATE POLICY fan_activity_hours_own ON fan_activity_hours
  FOR SELECT USING (EXISTS (SELECT 1 FROM models m WHERE m.id = fan_activity_hours.model_id AND m.agency_user_id = auth.uid()));

-- Atomic increment helper (upsert + 1) used by the activity hook.
CREATE OR REPLACE FUNCTION bump_fan_activity_hour(p_model uuid, p_peer text, p_hour smallint)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO fan_activity_hours (model_id, peer_id, hour, cnt)
  VALUES (p_model, p_peer, p_hour, 1)
  ON CONFLICT (model_id, peer_id, hour)
  DO UPDATE SET cnt = fan_activity_hours.cnt + 1;
$$;

-- ───────────────────────────────────────────────────────────────────────
-- Mass DM A/B test columns
-- ───────────────────────────────────────────────────────────────────────
ALTER TABLE mass_dm_campaigns
  ADD COLUMN IF NOT EXISTS is_ab     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS message_b text;

ALTER TABLE mass_dm_recipients
  ADD COLUMN IF NOT EXISTS variant      text,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;
