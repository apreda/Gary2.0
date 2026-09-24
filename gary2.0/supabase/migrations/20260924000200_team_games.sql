-- Every final, one row a game (founder, Sep 24 2026: the Winners game-pick
-- breakdown should look like the prop breakdown, whose centerpiece is the
-- player's games on the yardstick; a game pick reads its team's games the same
-- way). The team-streaks edge function writes the finals it already reads every
-- five minutes: MLB from the Stats API schedule, the NFL from nflverse plus
-- ESPN's scoreboard.

create table if not exists public.team_games (
  league text not null,
  game_id text not null,
  game_date date not null,
  start_time timestamptz,
  game_type text,
  season int,
  home_team text not null,
  away_team text not null,
  home_abbr text,
  away_abbr text,
  home_score int not null,
  away_score int not null,
  updated_at timestamptz not null default now(),
  primary key (league, game_id)
);
create index if not exists team_games_home_idx on public.team_games (league, home_team, game_date desc);
create index if not exists team_games_away_idx on public.team_games (league, away_team, game_date desc);
alter table public.team_games enable row level security;

-- One club's games, newest first: the date, where, who, the score from its
-- side. A name matches the club's full name or its nickname ("Angels", "White
-- Sox", "Athletics"). MLB reads this calendar year; the NFL this season and
-- last, each game marked with whether it is this season's.
create or replace function public.get_team_games(p_league text, p_team text)
returns jsonb
language sql
stable security definer
set search_path to ''
as $function$
  with team as (select lower(trim(p_team)) as t),
  now_season as (
    select case when upper(p_league) = 'NFL'
      then case when extract(month from (now() at time zone 'America/New_York')) <= 2
                then extract(year from (now() at time zone 'America/New_York'))::int - 1
                else extract(year from (now() at time zone 'America/New_York'))::int end
      else extract(year from (now() at time zone 'America/New_York'))::int end as s
  ),
  mine as (
    select g.*, (lower(g.home_team) = t.t or lower(g.home_team) like '% ' || t.t) as is_home
    from public.team_games g, team t, now_season ns
    where g.league = upper(p_league)
      and (lower(g.home_team) = t.t or lower(g.home_team) like '% ' || t.t
        or lower(g.away_team) = t.t or lower(g.away_team) like '% ' || t.t)
      and coalesce(g.season, extract(year from g.game_date)::int) >= ns.s - case when upper(p_league) = 'NFL' then 1 else 0 end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'd', m.game_date,
      'home', m.is_home,
      'opp', case when m.is_home then m.away_team else m.home_team end,
      'oa', case when m.is_home then m.away_abbr else m.home_abbr end,
      'f', case when m.is_home then m.home_score else m.away_score end,
      'a', case when m.is_home then m.away_score else m.home_score end,
      'cur', coalesce(m.season, extract(year from m.game_date)::int) = (select s from now_season))
    order by m.game_date desc, m.start_time desc nulls last), '[]'::jsonb)
  from mine m;
$function$;

grant execute on function public.get_team_games(text, text) to anon, authenticated;
