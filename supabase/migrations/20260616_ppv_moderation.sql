-- PPV moderation queue
-- Run in Supabase SQL Editor.
--
-- Every newly-uploaded PPV starts in "pending" — agencies see "Pending
-- admin review" on the card, chatters cannot send it to fans until you
-- (the platform admin) flip it to "approved" via the admin panel.
-- Existing PPVs are bulk-approved by the second statement so the rollout
-- doesn't lock the current vault.

ALTER TABLE ppvs
  ADD COLUMN IF NOT EXISTS review_status  text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS review_notes   text,
  ADD COLUMN IF NOT EXISTS reviewed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by    uuid;

-- Index for the admin queue's "show pending first" sort.
CREATE INDEX IF NOT EXISTS ppvs_review_status_idx
  ON ppvs (review_status, created_at DESC);

-- One-time grandfather: anything that already existed when this migration
-- ran is implicitly approved (otherwise every agency's chatters would be
-- blocked from sending their current vault until you reviewed it). New
-- INSERTs after this point inherit the column default 'pending'.
UPDATE ppvs SET review_status = 'approved' WHERE review_status = 'pending';
