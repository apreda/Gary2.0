-- Gary's record by kind of reasoning (founder, Oct 4 2026: "not just from a
-- spread standpoint but from a reasoning standpoint too"). The ledger now also
-- counts his picks by what their write-up did, from gary_pick_reasons: argued
-- the number was wrong or did not, depended on a player being out or did not.
-- (This file holds the function as it stands. An earlier body, 20261005002950_gary_bet_ledger, was applied the
-- same hour and replaced by this one; it was not kept as a file. The founder's own reporting: Gary is not
-- shown this record, see src/services/pickdesk/betTurn.js.)
create or replace function public.gary_bet_ledger(p_league text, p_before date default null)
returns jsonb
language sql stable security definer
set search_path to ''
as $$
  with lim as (
    select coalesce(p_before, (now() at time zone 'America/New_York')::date) as before_day,
           make_date(extract(year from coalesce(p_before, (now() at time zone 'America/New_York')::date))::int, 8, 1) as season_start),
  g as (
    select x.game_date, x.pick_text, x.result,
           case when x.pick_text ~* '\sML\s' then null
                else (regexp_match(x.pick_text, '\s([+-]\d+(?:\.\d+)?)\s+[+-]\d{3,4}\s*$'))[1]::numeric end as spread
    from lim, public.gary_graded_games(lim.season_start, lim.before_day - 1) x
    where x.league = p_league and x.result in ('won', 'lost', 'push')),
  c as (
    select distinct on (c.game_date, c.pick_text) c.id, c.game_date::date as d, c.pick_text, c.pick_snapshot->'gary_bet' as gb
    from public.winners_candidates c, lim
    where c.kind = 'game' and c.league = p_league
      and c.game_date::date >= lim.season_start and c.game_date::date < lim.before_day
    order by c.game_date, c.pick_text, c.id desc),
  j as (
    select g.*, (c.gb is not null and c.gb <> 'null'::jsonb) as asked,
           coalesce((c.gb->>'winners')::boolean, (c.gb->>'play')::boolean, false) as bet,
           (c.gb->>'stake_dollars')::numeric as stake,
           (r.candidate_id is not null) as tagged, r.number_wrong, r.relies_on_absence
    from g left join c on c.d = g.game_date and c.pick_text = g.pick_text
    left join public.gary_pick_reasons r on r.candidate_id = c.id),
  r as (
    select k, jsonb_build_object('won', count(*) filter (where result = 'won'), 'lost', count(*) filter (where result = 'lost'),
                                 'push', count(*) filter (where result = 'push')) as rec
    from j cross join lateral (values
      ('picks', true),
      ('laying_points', spread < 0),
      ('getting_points', spread > 0),
      ('moneyline', spread is null),
      ('argued_number_wrong', tagged and number_wrong >= 0.5),
      ('no_number_argument', tagged and number_wrong < 0.5),
      ('depended_on_absence', tagged and relies_on_absence >= 0.5),
      ('no_absence', tagged and relies_on_absence < 0.5),
      ('bet', asked and bet),
      ('bet_300_plus', asked and bet and stake >= 300),
      ('bet_200_299', asked and bet and stake >= 200 and stake < 300),
      ('bet_100_199', asked and bet and stake < 200),
      ('passed', asked and not bet)) v(k, hit)
    where v.hit group by k)
  select jsonb_build_object('league', p_league, 'through', (select before_day - 1 from lim))
         || coalesce((select jsonb_object_agg(k, rec) from r), '{}'::jsonb);
$$;
revoke all on function public.gary_bet_ledger(text, date) from public, anon, authenticated;
grant execute on function public.gary_bet_ledger(text, date) to service_role;
