-- GARY'S BANKROLL BY DAY (founder, Sep 26 2026): the Bankroll page shows the real $10,000
-- and a calendar of what Gary won or lost each day on Winners bets. get_gary_bankroll()
-- gains a 'days' array beside the curve; every other field is unchanged (still in units).
create or replace function public.get_gary_bankroll() returns jsonb
language sql stable security definer set search_path = '' as $$
 with ledger as materialized (select *,stake_units*flat_net_units net from gary_private.bankroll_ledger),
 totals as (select coalesce(sum(net),0) profit,
  coalesce(sum(stake_units) filter(where result='pending'),0) risk,
  coalesce(sum(stake_units) filter(where result in ('won','lost','push')),0) wagered,
  count(*) bets,count(*) filter(where result='won') wins,count(*) filter(where result='lost') losses,
  count(*) filter(where result='push') pushes,count(*) filter(where result='void') voids,
  count(*) filter(where result='pending') pending,
  coalesce(sum(flat_net_units),0) flat_profit from ledger),
 steps as (select candidate_id,settled_at,net,sum(net) over(order by settled_at,candidate_id) cumulative
  from ledger where result<>'pending'),
 drawdowns as (select cumulative,greatest(0,max(cumulative) over(order by settled_at,candidate_id))-cumulative drawdown from steps),
 days as (select (settled_at at time zone 'America/New_York')::date::text date,sum(net) net,sum(flat_net_units) flat_net,
  count(*) filter(where result in ('won','lost','push')) settled,
  count(*) filter(where result='won') wins,count(*) filter(where result='lost') losses,count(*) filter(where result='push') pushes
  from ledger where result<>'pending' group by 1),
 curve as (select date,sum(net) over(order by date) net_units,sum(flat_net) over(order by date) flat_units from days)
 select jsonb_build_object('policy_version',cfg.policy_version,'started_at',cfg.started_at,'started_date',(cfg.started_at at time zone 'America/New_York')::date::text,'initial_units',cfg.initial_units,
  'bankroll_units',cfg.initial_units+t.profit,'profit_units',t.profit,'growth_pct',100*t.profit/cfg.initial_units,
  'available_units',cfg.initial_units+t.profit-t.risk,'at_risk_units',t.risk,'wagered_units',t.wagered,
  'roi_pct',case when t.wagered>0 then 100*t.profit/t.wagered else null end,
  'win_pct',case when t.wins+t.losses>0 then 100.0*t.wins/(t.wins+t.losses) else null end,
  'bets',t.bets,'wins',t.wins,'losses',t.losses,'pushes',t.pushes,'voids',t.voids,'pending',t.pending,
  'flat_profit_units',t.flat_profit,'max_drawdown_units',coalesce((select max(drawdown) from drawdowns),0),
  'curve',coalesce((select jsonb_agg(to_jsonb(curve) order by date) from curve),'[]'::jsonb),
  'days',coalesce((select jsonb_agg(jsonb_build_object('date',date,'net_units',net,'flat_units',flat_net,'settled',settled,'wins',wins,'losses',losses,'pushes',pushes) order by date) from days),'[]'::jsonb))
 from public.gary_bankroll cfg cross join totals t where cfg.id;
$$;
