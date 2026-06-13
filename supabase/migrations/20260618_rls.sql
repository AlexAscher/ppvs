-- ════════════════════════════════════════════════════════════════════════
-- Row-Level Security rollout
-- Run in the Supabase SQL editor. Re-runnable (drops policies before create).
--
-- WHY: every table was open to the public anon key (the one shipped in the
-- browser bundle). Anyone could `select * from fans` / `ppv_sends` etc. This
-- migration locks every business table down to:
--   • the agency owner   (agency_user_id / user_id = auth.uid())
--   • chatters of that agency's model (via agency_chatters)
--   • the platform server (service_role — BYPASSES RLS automatically, so all
--     /api routes that use createAdminSupabaseClient keep working unchanged)
--
-- The browser uses the *authenticated* role (logged-in session cookie), so
-- the policies below are written against that role. The *anon* role gets no
-- policy anywhere = full deny. Public fan pages (/pay, /tip) read via the
-- server (service_role), so they are unaffected.
--
-- ROLLBACK (paste to undo, e.g. if a screen unexpectedly shows empty):
--   do $$ declare t text; begin
--     foreach t in array array[
--       'models','ppvs','ppv_groups','ppv_tags','ppv_sends','tips','fans',
--       'fan_notes','fan_activity_hours','quick_reply_templates',
--       'conversation_status','conversation_labels','fan_group_memberships',
--       'fan_groups','mass_dm_campaigns','mass_dm_recipients','payouts',
--       'payout_splits','chatter_presence','ppv_links','vault_items',
--       'agency_settings','agency_chatters','invitations','ppv_item_tags',
--       'ppv_group_tags','ppv_send_items']
--     loop execute format('alter table %I disable row level security', t); end loop;
--   end $$;
-- ════════════════════════════════════════════════════════════════════════

-- ── Helper: can the current user access this model? ─────────────────────────
-- SECURITY DEFINER so it reads models/agency_chatters as the function owner,
-- side-stepping RLS on those tables (no recursion, no infinite loop).
create or replace function app_can_access_model(p_model uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from models m
    where m.id = p_model
      and (
        m.agency_user_id = auth.uid()
        or exists (
          select 1 from agency_chatters ac
          where ac.chatter_id = auth.uid()
            and ac.model_id = m.id
        )
      )
  );
$$;

revoke all on function app_can_access_model(uuid) from public;
grant execute on function app_can_access_model(uuid) to authenticated;

-- ── models ──────────────────────────────────────────────────────────────────
alter table models enable row level security;
drop policy if exists models_select on models;
create policy models_select on models for select to authenticated
  using (app_can_access_model(id));
drop policy if exists models_insert on models;
create policy models_insert on models for insert to authenticated
  with check (agency_user_id = auth.uid());
drop policy if exists models_update on models;
create policy models_update on models for update to authenticated
  using (agency_user_id = auth.uid()) with check (agency_user_id = auth.uid());
drop policy if exists models_delete on models;
create policy models_delete on models for delete to authenticated
  using (agency_user_id = auth.uid());

-- ── agency_chatters ─────────────────────────────────────────────────────────
alter table agency_chatters enable row level security;
drop policy if exists agency_chatters_select on agency_chatters;
create policy agency_chatters_select on agency_chatters for select to authenticated
  using (agency_id = auth.uid() or chatter_id = auth.uid());
drop policy if exists agency_chatters_write on agency_chatters;
create policy agency_chatters_write on agency_chatters for all to authenticated
  using (agency_id = auth.uid()) with check (agency_id = auth.uid());

-- ── invitations ─────────────────────────────────────────────────────────────
alter table invitations enable row level security;
drop policy if exists invitations_select on invitations;
create policy invitations_select on invitations for select to authenticated
  using (agency_id = auth.uid() or chatter_id = auth.uid());
drop policy if exists invitations_write on invitations;
create policy invitations_write on invitations for all to authenticated
  using (agency_id = auth.uid()) with check (agency_id = auth.uid());

-- ── model-scoped tables (read+write if you can access the model) ────────────
-- ppvs / groups / tags / sends / tips / fan data / templates / conversation
-- state / fan-group memberships / mass-DM campaigns all key off model_id.
do $$
declare t text;
begin
  foreach t in array array[
    'ppvs','ppv_groups','ppv_tags','ppv_sends','tips','fans','fan_notes',
    'fan_activity_hours','quick_reply_templates','conversation_status',
    'fan_group_memberships','mass_dm_campaigns'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_model_rw', t);
    execute format(
      'create policy %I on %I for all to authenticated using (app_can_access_model(model_id)) with check (app_can_access_model(model_id))',
      t || '_model_rw', t
    );
  end loop;
end $$;

-- ── agency-owner-scoped tables (agency_user_id = auth.uid()) ────────────────
do $$
declare t text;
begin
  foreach t in array array['fan_groups','conversation_labels','payouts']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_owner_rw', t);
    execute format(
      'create policy %I on %I for all to authenticated using (agency_user_id = auth.uid()) with check (agency_user_id = auth.uid())',
      t || '_owner_rw', t
    );
  end loop;
end $$;

-- payout_splits: agency owner OR the chatter the split belongs to (read).
alter table payout_splits enable row level security;
drop policy if exists payout_splits_select on payout_splits;
create policy payout_splits_select on payout_splits for select to authenticated
  using (agency_user_id = auth.uid() or chatter_user_id = auth.uid());
drop policy if exists payout_splits_write on payout_splits;
create policy payout_splits_write on payout_splits for all to authenticated
  using (agency_user_id = auth.uid()) with check (agency_user_id = auth.uid());

-- ── user-owned tables (user_id = auth.uid()) ────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['chatter_presence','ppv_links','vault_items','agency_settings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_user_rw', t);
    execute format(
      'create policy %I on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_user_rw', t
    );
  end loop;
end $$;

-- ── junction tables (scope via parent's model access) ───────────────────────
alter table ppv_item_tags enable row level security;
drop policy if exists ppv_item_tags_rw on ppv_item_tags;
create policy ppv_item_tags_rw on ppv_item_tags for all to authenticated
  using (exists (select 1 from ppvs p where p.id = ppv_item_tags.ppv_id and app_can_access_model(p.model_id)))
  with check (exists (select 1 from ppvs p where p.id = ppv_item_tags.ppv_id and app_can_access_model(p.model_id)));

alter table ppv_group_tags enable row level security;
drop policy if exists ppv_group_tags_rw on ppv_group_tags;
create policy ppv_group_tags_rw on ppv_group_tags for all to authenticated
  using (exists (select 1 from ppv_groups g where g.id = ppv_group_tags.group_id and app_can_access_model(g.model_id)))
  with check (exists (select 1 from ppv_groups g where g.id = ppv_group_tags.group_id and app_can_access_model(g.model_id)));

alter table ppv_send_items enable row level security;
drop policy if exists ppv_send_items_rw on ppv_send_items;
create policy ppv_send_items_rw on ppv_send_items for all to authenticated
  using (exists (select 1 from ppv_sends s where s.id = ppv_send_items.send_id and app_can_access_model(s.model_id)))
  with check (exists (select 1 from ppv_sends s where s.id = ppv_send_items.send_id and app_can_access_model(s.model_id)));

alter table mass_dm_recipients enable row level security;
drop policy if exists mass_dm_recipients_rw on mass_dm_recipients;
create policy mass_dm_recipients_rw on mass_dm_recipients for all to authenticated
  using (exists (select 1 from mass_dm_campaigns c where c.id = mass_dm_recipients.campaign_id and app_can_access_model(c.model_id)))
  with check (exists (select 1 from mass_dm_campaigns c where c.id = mass_dm_recipients.campaign_id and app_can_access_model(c.model_id)));

-- NOTE: `users` is intentionally NOT touched — admin code reads it via the
-- auth.admin API (service_role), and it may be a view (RLS would error).
