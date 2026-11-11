-- Where Gary's Winners money has come from, for the Record view of the Winners page
-- (founder GO, Nov 10 2026): props against game picks, and bets of $500 or more against
-- the rest. Read-only: counts and net units, no pick, price or stake leaves here.
--
-- Both pairs cover every settled Winners play, so each pair adds up to his record. The
-- scrubbed-day charge is a bankroll adjustment and sits in neither pair.
create or replace function public.get_winners_splits()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with settled as (
    select kind, stake_units, result, stake_units * flat_net_units as net
    from gary_private.bankroll_ledger
    where result in ('won', 'lost', 'push') and kind in ('game', 'prop')
  ),
  side as (
    select 'props' as name, result, net from settled where kind = 'prop'
    union all select 'games', result, net from settled where kind = 'game'
    union all select 'big', result, net from settled where stake_units >= 5
    union all select 'small', result, net from settled where stake_units < 5
  ),
  totals as (
    select name,
           count(*) filter (where result = 'won') as wins,
           count(*) filter (where result = 'lost') as losses,
           coalesce(round(sum(net), 4), 0) as net_units
    from side
    group by name
  )
  select jsonb_build_object(
    'props', coalesce((select jsonb_build_object('wins', wins, 'losses', losses, 'net_units', net_units) from totals where name = 'props'), jsonb_build_object('wins', 0, 'losses', 0, 'net_units', 0)),
    'games', coalesce((select jsonb_build_object('wins', wins, 'losses', losses, 'net_units', net_units) from totals where name = 'games'), jsonb_build_object('wins', 0, 'losses', 0, 'net_units', 0)),
    'big', coalesce((select jsonb_build_object('wins', wins, 'losses', losses, 'net_units', net_units) from totals where name = 'big'), jsonb_build_object('wins', 0, 'losses', 0, 'net_units', 0)),
    'small', coalesce((select jsonb_build_object('wins', wins, 'losses', losses, 'net_units', net_units) from totals where name = 'small'), jsonb_build_object('wins', 0, 'losses', 0, 'net_units', 0)),
    'big_from_dollars', 500
  );
$$;

revoke all on function public.get_winners_splits() from public;
grant execute on function public.get_winners_splits() to anon, authenticated;
