-- Named fan groups (whales / spenders / timewasters / …).
--
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).
--
-- Distinct from the existing fans.tags[] (single-emoji labels): groups
-- have a name, color, optional emoji prefix, and a many-to-many
-- membership table so a fan can be in N groups simultaneously.

-- ───────────────────────────────────────────────────────────────────────
-- fan_groups — per-agency group library
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fan_groups (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_user_id  uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text          NOT NULL,
  -- Hex color used in chips. Defaults match the chatter-page indigo.
  color           text          NOT NULL DEFAULT '#6366f1',
  emoji           text,
  -- UI order. Lower first.
  position        int           NOT NULL DEFAULT 0,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  -- One group name per agency — keeps the picker clean.
  CONSTRAINT fan_groups_name_per_agency UNIQUE (agency_user_id, name)
);

CREATE INDEX IF NOT EXISTS fan_groups_agency_idx
  ON fan_groups (agency_user_id, position);

ALTER TABLE fan_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fan_groups_select_own" ON fan_groups;
CREATE POLICY "fan_groups_select_own" ON fan_groups
  FOR SELECT USING (auth.uid() = agency_user_id);

DROP POLICY IF EXISTS "fan_groups_insert_own" ON fan_groups;
CREATE POLICY "fan_groups_insert_own" ON fan_groups
  FOR INSERT WITH CHECK (auth.uid() = agency_user_id);

DROP POLICY IF EXISTS "fan_groups_update_own" ON fan_groups;
CREATE POLICY "fan_groups_update_own" ON fan_groups
  FOR UPDATE USING (auth.uid() = agency_user_id);

DROP POLICY IF EXISTS "fan_groups_delete_own" ON fan_groups;
CREATE POLICY "fan_groups_delete_own" ON fan_groups
  FOR DELETE USING (auth.uid() = agency_user_id);


-- ───────────────────────────────────────────────────────────────────────
-- fan_group_memberships — (group, model, peer) many-to-many
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fan_group_memberships (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid          NOT NULL REFERENCES fan_groups(id) ON DELETE CASCADE,
  model_id        uuid          NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  peer_id         text          NOT NULL,
  added_at        timestamptz   NOT NULL DEFAULT now(),
  -- One fan-in-group row.
  CONSTRAINT fan_group_memberships_uniq UNIQUE (group_id, model_id, peer_id)
);

-- "list members of this group" (most common read).
CREATE INDEX IF NOT EXISTS fan_group_memberships_group_idx
  ON fan_group_memberships (group_id, added_at DESC);

-- "which groups is this (model, peer) in" — used by the chat drawer +
-- dialog list filter to colour-code rows.
CREATE INDEX IF NOT EXISTS fan_group_memberships_lookup_idx
  ON fan_group_memberships (model_id, peer_id);

ALTER TABLE fan_group_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fan_group_memberships_select_own" ON fan_group_memberships;
CREATE POLICY "fan_group_memberships_select_own" ON fan_group_memberships
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM fan_groups g
      WHERE g.id = fan_group_memberships.group_id
        AND g.agency_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "fan_group_memberships_insert_own" ON fan_group_memberships;
CREATE POLICY "fan_group_memberships_insert_own" ON fan_group_memberships
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM fan_groups g
      WHERE g.id = fan_group_memberships.group_id
        AND g.agency_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "fan_group_memberships_delete_own" ON fan_group_memberships;
CREATE POLICY "fan_group_memberships_delete_own" ON fan_group_memberships
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM fan_groups g
      WHERE g.id = fan_group_memberships.group_id
        AND g.agency_user_id = auth.uid()
    )
  );
