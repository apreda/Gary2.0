-- Gary's run and his last ten results, for the Winners header (founder GO, Oct 7 2026:
-- the logo turns hot or cold on a run of two, and a small line of his money over his
-- last plays sits by the profile). Read-only: no pick, price or stake leaves here.
--
-- run_result / run_count: every Winners play in game order (first pitch or kickoff;
-- settled_at is when a grading batch ran, and one batch can settle several days),
-- across days, sports, games and props; a push or a void neither extends nor breaks it.
-- recent: the net units of his last ten settled plays (pushes included, at zero),
-- oldest first, so the app draws the line by adding them up.
create or replace function public.get_winners_run()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with settled as (
    select candidate_id, coalesce(commence_time, settled_at) as played_at, result, stake_units * flat_net_units as net
    from gary_private.bankroll_ledger
    where result in ('won', 'lost', 'push')
  ),
  decided as (
    select result, row_number() over (order by played_at desc, candidate_id desc) as rn
    from settled
    where result in ('won', 'lost')
  ),
  head as (select result from decided where rn = 1),
  first_break as (
    select min(d.rn) as rn from decided d cross join head h where d.result <> h.result
  ),
  recent as (
    select candidate_id, played_at, net
    from settled
    order by played_at desc, candidate_id desc
    limit 10
  )
  select jsonb_build_object(
    'run_result', (select result from head),
    'run_count', coalesce((select rn - 1 from first_break where rn is not null), (select count(*) from decided)),
    'recent', coalesce((select jsonb_agg(round(net, 4) order by played_at, candidate_id) from recent), '[]'::jsonb)
  );
$$;

revoke all on function public.get_winners_run() from public;
grant execute on function public.get_winners_run() to anon, authenticated;
