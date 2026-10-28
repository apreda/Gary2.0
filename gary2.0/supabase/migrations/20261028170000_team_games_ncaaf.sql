-- College on the team card (founder, Oct 28 2026: a tapped team name opens its team card, college too). College
-- finals now land in team_games (ncaafTeamGames.js). A school's name is not a key ("Michigan" begins "Michigan
-- State Spartans"), so for the NCAAF the app asks by the provider's abbreviation, matched exactly; the full name
-- still matches as for the pro leagues.
create or replace function public.get_team_games(p_league text, p_team text)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  with team as (select lower(trim(p_team)) as t),
  now_season as (
    select case when upper(p_league) in ('NFL', 'NCAAF')
      then case when extract(month from (now() at time zone 'America/New_York')) <= 2
                then extract(year from (now() at time zone 'America/New_York'))::int - 1
                else extract(year from (now() at time zone 'America/New_York'))::int end
      -- The NBA season runs October to June under the year it starts (BDL's season).
      when upper(p_league) = 'NBA'
      then case when extract(month from (now() at time zone 'America/New_York')) <= 7
                then extract(year from (now() at time zone 'America/New_York'))::int - 1
                else extract(year from (now() at time zone 'America/New_York'))::int end
      else extract(year from (now() at time zone 'America/New_York'))::int end as s
  ),
  mine as (
    select g.*, (lower(g.home_team) = t.t or (upper(p_league) <> 'NCAAF' and lower(g.home_team) like '% ' || t.t)
                 or (upper(p_league) = 'NCAAF' and lower(g.home_abbr) = t.t)) as is_home
    from public.team_games g, team t, now_season ns
    where g.league = upper(p_league)
      and (lower(g.home_team) = t.t or lower(g.away_team) = t.t
        or (upper(p_league) <> 'NCAAF' and (lower(g.home_team) like '% ' || t.t or lower(g.away_team) like '% ' || t.t))
        or (upper(p_league) = 'NCAAF' and (lower(g.home_abbr) = t.t or lower(g.away_abbr) = t.t)))
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
