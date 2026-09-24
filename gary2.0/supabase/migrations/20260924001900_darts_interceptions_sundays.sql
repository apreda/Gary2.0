-- Interceptions are a Sunday category too (founder, Sep 24 2026: "same thing
-- I said about QB rushing touchdowns is true for interceptions... On Sunday
-- we'll pick three quarterbacks or four or five to throw interceptions").
-- A one-game night asked for one per quarterback, so both starters were
-- named to meet the count. The Darts page shows both quarterback categories
-- on Sundays only, and tonight's two are scratched so they are never graded.
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
    and not (d.league = 'NFL' and d.kind in ('qbtd', 'int') and extract(isodow from d.game_date) <> 7)
$function$;

update public.darts
   set scratched_at = now(), scratch_reason = 'Interceptions are a Sunday category'
 where game_date = date '2026-09-24' and league = 'NFL' and kind = 'int' and scratched_at is null;
