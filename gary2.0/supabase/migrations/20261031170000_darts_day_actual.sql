-- Darts graded on the board (founder, Oct 31 2026, mock 4.5: "do the 4.5 after the game result thing"): once a
-- dart is graded the wheel shows a check or a cross and the player's final number, so the day's read now carries
-- `actual` beside `result`. Otherwise the function is as it was.
CREATE OR REPLACE FUNCTION public.darts_day(p_day date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'game_date', d.game_date, 'league', d.league, 'kind', d.kind, 'player', d.player,
    'player_id', d.player_id, 'team', d.team, 'position', d.position, 'matchup', d.matchup, 'game_id', d.game_id,
    'commence_time', d.commence_time, 'prop', d.prop, 'bet', d.bet, 'odds', d.odds, 'odds_alt', d.odds_alt,
    'book', d.book, 'reason', d.reason, 'scratched', d.scratched_at is not null, 'scratch_reason', d.scratch_reason,
    'form', d.form, 'rank', d.rank, 'result', d.result, 'actual', d.actual)
    order by d.rank nulls last, d.commence_time nulls last, d.id), '[]'::jsonb)
  from public.darts d
  where d.game_date = p_day
    and d.replaced_by is null
    and d.scratched_at is null
    and d.kind <> 'multihit'
    and not (d.league = 'NFL' and d.kind in ('qbtd', 'int') and extract(isodow from d.game_date) <> 7)
$function$;
