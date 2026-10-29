-- Sunday's three free picks, second game = Sunday Night Football itself (Oct 29 2026).
--
-- The Oct 4 rule is "the morning NFL game, the SNF game and then a normal free pick of the day.
-- That is 3 free picks on Sunday." sunday_nfl_free_games stood in for SNF with every NFL game on
-- winners_big_games, so a Sunday with four big games posted five "Free Pick of the Day" posts on X
-- (Oct 25: Steelers, Falcons, Lions, Chiefs + the day's pick). SNF is the Sunday NFL game that
-- kicks off at 7 PM ET or later.

create or replace function gary_private.sunday_nfl_free_games(p_day date)
returns table (game_id text)
language sql stable
set search_path to ''
as $$
  select distinct s.bdl_game_id::text
  from public.daily_slate s
  where extract(dow from p_day) = 0 and s.date = p_day and s.league = 'NFL' and s.bdl_game_id is not null
    and ((s.commence_time at time zone 'America/New_York')::time < time '12:00'
      or (s.commence_time at time zone 'America/New_York')::time >= time '19:00')
$$;
revoke all on function gary_private.sunday_nfl_free_games(date) from public;
