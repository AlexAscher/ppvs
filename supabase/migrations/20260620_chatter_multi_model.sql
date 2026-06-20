-- ───────────────────────────────────────────────────────────────────────────
-- Chatter multi-model assignment
--
-- A chatter can now be assigned to SEVERAL models inside one agency (one
-- agency_chatters row per model). Older schemas assumed one row per chatter
-- and used either UNIQUE(chatter_id) or UNIQUE(agency_id, chatter_id);
-- either shape blocks the second assignment and must be dropped.
--
-- This migration:
--   1. Drops any UNIQUE constraint on agency_chatters whose columns are a
--      subset of (agency_id, chatter_id) — i.e. (chatter_id) alone or
--      (agency_id, chatter_id). Composite constraints that include model_id
--      (the new intended shape) are left in place.
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
    select con.conname,
      (
        select array_agg(att.attname::text order by att.attnum)
        from unnest(con.conkey) as k(attnum)
        join pg_attribute att
          on att.attrelid = con.conrelid and att.attnum = k.attnum
      ) as cols
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'agency_chatters'
      and con.contype = 'u'
  loop
    if r.cols = array['chatter_id']::text[]
       or r.cols = array['agency_id','chatter_id']::text[]
       or r.cols = array['chatter_id','agency_id']::text[]
    then
      execute format('alter table agency_chatters drop constraint %I', r.conname);
    end if;
  end loop;
end $$;

create unique index if not exists agency_chatters_unique_assignment
  on agency_chatters (agency_id, chatter_id, model_id);

-- ── Rollback ────────────────────────────────────────────────────────────────
-- drop index if exists agency_chatters_unique_assignment;
-- (The dropped UNIQUE(chatter_id) constraint is not recreated — multi-model
--  is the intended end state.)
