-- QB rushing touchdowns are a Sunday category (founder, Sep 24 2026: "on
-- Sunday we're going to pick three quarterbacks for the whole Sunday day to
-- have there, but no need to have it here"). The lane asked for one more
-- quarterback than games on other days, so a one-game night named both
-- starters. The Darts page shows the category on Sundays only, and tonight's
-- two are scratched so they are never graded or shown on the hit tape.
create or replace function public.darts_day(p_day date)
returns jsonb
language sql
stable security definer
set search_path to ''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'game_date', d.game_date, 'league', d.league, 'kind', d.kind, 'player', d.player,
    'player_id', d.player_id, 'team', d.team, 'position', d.position, 'matchup', d.matchup, 'game_id', d.game_id,
    'commence_time', d.commence_time, 'prop', d.prop, 'bet', d.bet, 'odds', d.odds, 'odds_alt', d.odds_alt,
    'book', d.book, 'reason', d.reason, 'scratched', d.scratched_at is not null, 'scratch_reason', d.scratch_reason,
    'form', d.form)
    order by d.commence_time nulls last, d.id), '[]'::jsonb)
  from public.darts d
  where d.game_date = p_day
    and not (d.league = 'NFL' and d.kind = 'qbtd' and extract(isodow from d.game_date) <> 7)
$function$;

update public.darts
   set scratched_at = now(), scratch_reason = 'QB rushing TDs are a Sunday category'
 where game_date = date '2026-09-24' and league = 'NFL' and kind = 'qbtd' and scratched_at is null;
