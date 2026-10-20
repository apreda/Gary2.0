-- NBA win/loss runs (Oct 19 2026): the live-score poller writes them from BDL finals (nbaTeamGames.js) through the
-- same RPC the team-streaks edge function uses for MLB and NFL.
CREATE OR REPLACE FUNCTION public.replace_team_runs(p_date date, p_league text, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_n integer;
begin
  if p_league not in ('MLB', 'NFL', 'NBA') then raise exception 'Unknown league %', p_league; end if;
  delete from public.streaks where game_date = p_date and league = p_league and kind in ('win', 'loss');
  insert into public.streaks (game_date, league, subject_type, subject, team, kind, length, detail, next_game)
  select p_date, p_league, 'team', r->>'subject', r->>'team', r->>'kind', (r->>'length')::int, r->>'detail', r->>'next_game'
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
   where r->>'kind' in ('win', 'loss') and (r->>'length')::int >= 2 and coalesce(r->>'subject', '') <> '';
  get diagnostics v_n = row_count;
  perform public.carry_streaks_forward(p_date, p_league);
  return v_n;
end $function$;
