-- PLAYOFF BASEBALL ALL DAY (founder, Sep 29 2026): every postseason MLB game gets its
-- featured card, whatever the first pitch. The evening-only window left the 2 PM and 5 PM
-- Wild Card games without one. Regular-season baseball and NFL keep their rules.
create or replace function gary_private.primetime_games(p_date date)
returns table(league text, game_id text, away_team text, home_team text, commence_time timestamptz,
              venue text, spread numeric, total numeric, slot text)
language sql stable set search_path = '' as $$
  select distinct on (s.league, s.bdl_game_id)
    s.league, s.bdl_game_id::text, s.away_team, s.home_team, s.commence_time, s.venue, s.spread, s.total,
    case
      when s.league = 'NFL' then upper(to_char(s.commence_time at time zone 'America/New_York', 'FMDay')) || ' NIGHT FOOTBALL'
      when coalesce(s.postseason, false) then 'PLAYOFF BASEBALL'
      when exists (select 1 from public.marquee_games m
                   where m.game_date = p_date and m.league = 'MLB' and m.game_id = s.bdl_game_id::text) then 'MARQUEE GAME'
      else upper(to_char(s.commence_time at time zone 'America/New_York', 'FMDay')) || ' NIGHT BASEBALL'
    end
  from public.daily_slate s
  where s.date = p_date and s.commence_time is not null and s.bdl_game_id is not null
    and ((extract(hour from s.commence_time at time zone 'America/New_York') >= 19
          and (s.league = 'NFL'
            or (s.league = 'MLB' and exists (select 1 from public.winners_big_games b
                           where b.game_date = to_char(p_date, 'YYYY-MM-DD') and b.league = 'MLB' and b.game_id = s.bdl_game_id::text))))
      or (s.league = 'MLB' and coalesce(s.postseason, false))
      or (s.league = 'MLB' and exists (select 1 from public.marquee_games m
                                       where m.game_date = p_date and m.league = 'MLB' and m.game_id = s.bdl_game_id::text)))
  order by s.league, s.bdl_game_id, s.created_at desc
$$;
