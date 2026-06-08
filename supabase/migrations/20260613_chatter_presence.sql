-- Team presence: a heartbeat row per user, bumped every ~30s from the
-- browser while the app is open. The agency reads its chatters' rows to
-- show online dots + "last active".
--
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS chatter_presence (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chatter_presence ENABLE ROW LEVEL SECURITY;

-- A user can write only their own heartbeat. Reads happen via the admin
-- client (agency-scoped) in /api/presence GET.
DROP POLICY IF EXISTS chatter_presence_self ON chatter_presence;
CREATE POLICY chatter_presence_self ON chatter_presence
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
