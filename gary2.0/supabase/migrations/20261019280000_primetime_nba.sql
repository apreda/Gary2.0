-- NBA Primetime (Oct 19 2026): the Darts featured row gets an NBA game card like the NFL and MLB ones: a 7 PM-or-later
-- game Winners calls big, and every night game on opening night ("OPENING NIGHT"). The material and the write-up job
-- are league-agnostic already.
create or replace function gary_private.primetime_games(p_date date)
returns table(league text, game_id text, away_team text, home_team text, commence_time timestamptz,
              venue text, spread numeric, total numeric, slot text)
language sql stable set search_path = '' as $$
  select distinct on (s.league, s.bdl_game_id)
    s.league, s.bdl_game_id::text, s.away_team, s.home_team, s.commence_time, s.venue, s.spread, s.total,
    case
      when s.league = 'NFL' then upper(to_char(s.commence_time at time zone 'America/New_York', 'FMDay')) || ' NIGHT FOOTBALL'
      when s.league = 'NBA' and p_date = date '2026-10-20' then 'OPENING NIGHT'
      when s.league = 'NBA' then upper(to_char(s.commence_time at time zone 'America/New_York', 'FMDay')) || ' NIGHT BASKETBALL'
      when coalesce(s.postseason, false) then 'PLAYOFF BASEBALL'
      when exists (select 1 from public.marquee_games m
                   where m.game_date = p_date and m.league = 'MLB' and m.game_id = s.bdl_game_id::text) then 'MARQUEE GAME'
      else upper(to_char(s.commence_time at time zone 'America/New_York', 'FMDay')) || ' NIGHT BASEBALL'
    end
  from public.daily_slate s
  where s.date = p_date and s.commence_time is not null and s.bdl_game_id is not null
    and ((extract(hour from s.commence_time at time zone 'America/New_York') >= 19
          and (s.league = 'NFL'
            -- NBA (Oct 19 2026): a night game Winners calls big, and every night game on opening night.
            or (s.league = 'NBA' and (p_date = date '2026-10-20' or exists (select 1 from public.winners_big_games b
                           where b.game_date = to_char(p_date, 'YYYY-MM-DD') and b.league = 'NBA' and b.game_id = s.bdl_game_id::text)))
            or (s.league = 'MLB' and exists (select 1 from public.winners_big_games b
                           where b.game_date = to_char(p_date, 'YYYY-MM-DD') and b.league = 'MLB' and b.game_id = s.bdl_game_id::text))))
      or (s.league = 'MLB' and coalesce(s.postseason, false))
      or (s.league = 'MLB' and exists (select 1 from public.marquee_games m
                                       where m.game_date = p_date and m.league = 'MLB' and m.game_id = s.bdl_game_id::text)))
  order by s.league, s.bdl_game_id, s.created_at desc
$$;
