-- ════════════════════════════════════════════════════════════════════════
-- Chat archive (per-model, shared across chatters)
-- Run in the Supabase SQL editor. Re-runnable.
--
-- A chat (fan) can be "archived" in the chatter workspace. Archiving is scoped
-- to the MODEL (not the chatter), so every chatter assigned to that model sees
-- the same archive — matching how the agency wants archived conversations put
-- away for the whole team. Archived chats are hidden from the main dialog list
-- and only rendered when the pinned "Archive" folder is opened.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists chat_archives (
  model_id    uuid        not null references models(id) on delete cascade,
  peer_id     text        not null,
  archived_at timestamptz not null default now(),
  archived_by uuid,
  primary key (model_id, peer_id)
);

create index if not exists chat_archives_model_idx on chat_archives (model_id);

-- RLS: same access rule as every other model-scoped table — the agency owner
-- and the model's assigned chatters can read/write. Server routes use the
-- service role and bypass RLS, but we lock the table down for the browser role
-- too so nothing is readable via the shipped anon key.
alter table chat_archives enable row level security;
drop policy if exists chat_archives_model_rw on chat_archives;
create policy chat_archives_model_rw on chat_archives for all to authenticated
  using (app_can_access_model(model_id))
  with check (app_can_access_model(model_id));
