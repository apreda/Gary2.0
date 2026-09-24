-- The daily Winners recap tweet (founder, Sep 24 2026: "each day i want to
-- post a recap tweet of the Winners page - the picks Gary had, the money he
-- had on them, the record"). One read for the social poster: a day's board
-- tickets from the bankroll ledger, biggest stake first, with each ticket's
-- dollars, plus the bankroll through that day. The ledger is the money book,
-- so the day's record, its net and the bankroll line always add up.
-- Service role only: the poster reads it, the app never does.

create or replace function public.winners_recap(p_date date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with ledger as (
    select l.*, b.pick_snapshot
    from gary_private.bankroll_ledger l
    join public.winners_board b on b.candidate_id = l.candidate_id
  )
  select jsonb_build_object(
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
          'league', l.league, 'kind', l.kind, 'pick_text', l.pick_text, 'odds', l.odds,
          'player', l.pick_snapshot->>'player',
          'prop', coalesce(l.pick_snapshot->>'prop', l.pick_snapshot->>'prop_type'),
          'line', l.pick_snapshot->>'line', 'bet', l.pick_snapshot->>'bet',
          'stake_dollars', round(l.stake_units * 100, 2),
          'result', l.result,
          'net_dollars', round(l.stake_units * l.flat_net_units * 100, 2))
        order by l.stake_units desc, l.commence_time, l.candidate_id)
      from ledger l where l.game_date = p_date::text), '[]'::jsonb),
    'bankroll_dollars', round((cfg.initial_units + coalesce((
      select sum(l.stake_units * l.flat_net_units) from ledger l
      where l.game_date ~ '^\d{4}-\d{2}-\d{2}$' and l.game_date::date <= p_date), 0)) * 100, 2),
    'initial_dollars', round(cfg.initial_units * 100, 2),
    'started_date', (cfg.started_at at time zone 'America/New_York')::date)
  from public.gary_bankroll cfg where cfg.id
$$;

revoke all on function public.winners_recap(date) from public, anon, authenticated;
grant execute on function public.winners_recap(date) to service_role;
