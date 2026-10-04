-- Founder, Oct 4 2026: "Only pick that automatically qualifies is the SNF game
-- pick." Thursday and Monday night stay big games (the free pick still reads
-- them) but no longer reach Winners on that route: they need Gary at $300 or
-- more and a clear or lean read like every other NFL game. Sunday Night
-- Football is the one NFL game on the big-game route, defined as winnersRules
-- isBigGame defines it: Sunday, kickoff 8 PM ET or later.
create or replace function gary_private.nfl_sunday_night(p_kickoff timestamptz)
returns boolean
language sql immutable
set search_path to ''
as $$
  select extract(isodow from p_kickoff at time zone 'America/New_York') = 7
     and (p_kickoff at time zone 'America/New_York')::time >= time '20:00'
$$;
revoke all on function gary_private.nfl_sunday_night(timestamptz) from public;

do $$
declare d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid=p.pronamespace
   where s.nspname='gary_private' and p.proname='admit_winners_candidate';
  n := replace(d, $q$big:=c.kind='game' and exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id);$q$,
                  $q$big:=c.kind='game' and exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id)
   and (c.league<>'NFL' or gary_private.nfl_sunday_night(c.commence_time));$q$);
  if n = d then raise exception 'big-game line not found in admit_winners_candidate'; end if;
  execute n;

  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid=p.pronamespace
   where s.nspname='public' and p.proname='admit_winners_pending';
  n := replace(d, $q$(c.kind='game' and (c.league='NCAAF' or c.review->>'assessment'<>'unsupported') and exists($q$,
                  $q$(c.kind='game' and (c.league='NCAAF' or c.review->>'assessment'<>'unsupported')
           and (c.league<>'NFL' or gary_private.nfl_sunday_night(c.commence_time)) and exists($q$);
  if n = d then raise exception 'big-game line not found in admit_winners_pending'; end if;
  execute n;
end $$;
