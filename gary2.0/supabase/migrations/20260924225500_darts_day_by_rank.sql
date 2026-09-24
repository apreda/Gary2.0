-- The board reads Gary's darts in his order (rank 1 first) now that every
-- throw carries one; darts without a rank keep their kickoff order behind.
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
    'form', d.form, 'rank', d.rank)
    order by d.rank nulls last, d.commence_time nulls last, d.id), '[]'::jsonb)
  from public.darts d
  where d.game_date = p_day
    and not (d.league = 'NFL' and d.kind in ('qbtd', 'int') and extract(isodow from d.game_date) <> 7)
$function$;
