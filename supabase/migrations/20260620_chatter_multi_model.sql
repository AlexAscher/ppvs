-- ───────────────────────────────────────────────────────────────────────────
-- Chatter multi-model assignment
--
-- A chatter can now be assigned to SEVERAL models inside one agency (one
-- agency_chatters row per model). Older schemas implicitly assumed one
-- model per chatter; if a UNIQUE(chatter_id) constraint exists it blocks
-- the second assignment and must be dropped.
--
-- This migration:
--   1. Drops any UNIQUE constraint defined on (chatter_id) ALONE.
--   2. Adds a composite UNIQUE index on (agency_id, chatter_id, model_id)
--      so the same model can't be assigned to the same chatter twice while
--      still permitting different models. (NULL model_ids stay distinct in
--      Postgres, which is fine — they represent "unassigned".)
--
-- Safe to run multiple times.
-- ───────────────────────────────────────────────────────────────────────────

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'agency_chatters'
      and con.contype = 'u'
      and (
        select array_agg(att.attname order by att.attnum)
        from unnest(con.conkey) as k(attnum)
        join pg_attribute att
          on att.attrelid = con.conrelid and att.attnum = k.attnum
      ) = array['chatter_id']
  loop
    execute format('alter table agency_chatters drop constraint %I', r.conname);
  end loop;
end $$;

create unique index if not exists agency_chatters_unique_assignment
  on agency_chatters (agency_id, chatter_id, model_id);

-- ── Rollback ────────────────────────────────────────────────────────────────
-- drop index if exists agency_chatters_unique_assignment;
-- (The dropped UNIQUE(chatter_id) constraint is not recreated — multi-model
--  is the intended end state.)
