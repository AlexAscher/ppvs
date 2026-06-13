-- ════════════════════════════════════════════════════════════════════════
-- Performance: aggregate RPC + supporting indexes
-- Run in the Supabase SQL editor. Re-runnable.
--
-- The agency dashboard used to pull EVERY ppv_sends + fans row across the
-- Ireland↔EU link and aggregate in Node — multi-MB transfer + CPU on each
-- load. fn_dashboard_core() does the aggregation in Postgres and returns a
-- ~5 KB JSON. The indexes also speed up the admin overview/agency screens,
-- which scan the same tables.
--
-- The app calls the RPC with a fallback to the old in-Node path, so deploy
-- order doesn't matter — nothing breaks if this hasn't run yet.
-- ════════════════════════════════════════════════════════════════════════

-- ── Indexes for the aggregate scans ─────────────────────────────────────────
create index if not exists ppv_sends_model_status_created_idx
  on ppv_sends (model_id, status, created_at desc);
create index if not exists tips_model_status_idx
  on tips (model_id, status);
create index if not exists fans_model_spent_idx
  on fans (model_id, total_spent desc);
create index if not exists ppv_sends_chatter_idx
  on ppv_sends (chatter_id) where chatter_id is not null;

-- ── Dashboard aggregate ─────────────────────────────────────────────────────
-- p_net_mult is (1 - platform_fee), passed from the app so the fee % lives in
-- one place (src/lib/platform.ts). Period boundaries are passed in too, so the
-- "today/week/month" windows match the app's local-time logic exactly.
create or replace function fn_dashboard_core(
  p_model_ids uuid[],
  p_today     timestamptz,
  p_week      timestamptz,
  p_month     timestamptz,
  p_net_mult  numeric
)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with paid as (
    select s.model_id, s.chatter_id, s.total_price::numeric as price, s.created_at
    from ppv_sends s
    where s.model_id = any(p_model_ids)
      and s.status in ('paid', 'delivered')
  )
  select json_build_object(
    'net_all',   coalesce(sum(price), 0) * p_net_mult,
    'net_today', coalesce(sum(price) filter (where created_at >= p_today), 0) * p_net_mult,
    'net_week',  coalesce(sum(price) filter (where created_at >= p_week), 0) * p_net_mult,
    'net_month', coalesce(sum(price) filter (where created_at >= p_month), 0) * p_net_mult,
    'sales',     count(*),
    'models', (
      select coalesce(json_agg(json_build_object('id', model_id, 'net', net * p_net_mult, 'sales', sales) order by net desc), '[]'::json)
      from (select model_id, sum(price) net, count(*) sales from paid group by model_id) m
    ),
    'chatters', (
      select coalesce(json_agg(json_build_object('id', chatter_id, 'net', net * p_net_mult, 'sales', sales) order by net desc), '[]'::json)
      from (select chatter_id, sum(price) net, count(*) sales from paid where chatter_id is not null group by chatter_id) c
    ),
    'paying_fans', (
      select count(*) from fans where model_id = any(p_model_ids) and total_spent > 0
    ),
    'top_fans', (
      select coalesce(json_agg(json_build_object('username', telegram_username, 'name', telegram_name, 'spent', total_spent) order by total_spent desc), '[]'::json)
      from (
        select telegram_username, telegram_name, total_spent
        from fans where model_id = any(p_model_ids) and total_spent > 0
        order by total_spent desc limit 5
      ) tf
    ),
    'series', (
      select coalesce(json_agg(json_build_object('d', d, 'value', v * p_net_mult) order by d), '[]'::json)
      from (select date_trunc('day', created_at) d, sum(price) v from paid group by 1) s
    )
  )
  from paid;
$$;

revoke all on function fn_dashboard_core(uuid[], timestamptz, timestamptz, timestamptz, numeric) from public;
grant execute on function fn_dashboard_core(uuid[], timestamptz, timestamptz, timestamptz, numeric) to service_role;
