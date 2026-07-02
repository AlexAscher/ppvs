-- v3 brief: statistics must exclude free content sends (total_price = 0).
-- fn_dashboard_core's `paid` CTE was pulling every paid/delivered send; add
-- the price filter so free gifts stop distorting revenue, sales counts, and
-- the per-model / per-chatter / top-fan breakdowns.

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
      and coalesce(s.total_price::numeric, 0) > 0
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

grant execute on function fn_dashboard_core(uuid[], timestamptz, timestamptz, timestamptz, numeric) to service_role;
