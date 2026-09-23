-- One team, one key. MLB picks are written both ways ("Padres ML" and
-- "San Diego Padres ML +110"), and a few carry a word after the club
-- ("Miami Marlins moneyline", "Braves Spread"). Keyed on the raw text, the
-- full-name losses sat under a different team, so a streak survived its own
-- loss (Padres 5 after the Sep 22 "San Diego Padres ML +110" loss; Cardinals 3
-- after Sep 15). MLB keys are now the club nickname; NFL and NCAAF picks are
-- always written with the full name and keep it.
begin;

create or replace function public.gary_graded_games(p_from date, p_to date)
returns table(league text, game_date date, pick_text text, result text, created_at timestamptz, team text, price integer)
language sql stable security definer set search_path = '' as $$
  with g as (
    select upper(g.league) as league, g.game_date, g.pick_text, lower(g.result) as result, g.created_at
    from public.game_results g
    where g.game_date between p_from and p_to and lower(g.result) in ('won', 'lost', 'push')
    union all
    select 'NFL', n.game_date, n.pick_text, lower(n.result), n.created_at
    from public.nfl_results n
    where n.game_date between p_from and p_to and lower(n.result) in ('won', 'lost', 'push')
      and coalesce(n.season_type, 2) = 2),
  named as (
    select g.*,
           regexp_replace(
             regexp_replace(g.pick_text, '\s+(ML|[+-]?\d+(\.\d+)?)(\s.*)?$', ''),
             '\s+(moneyline|spread)\M.*$', '', 'i') as side
    from g)
  select n.league, n.game_date, n.pick_text, n.result, n.created_at,
         case when n.league = 'MLB' then coalesce(substring(n.side from '((?:Red|White) Sox|Blue Jays|\S+)$'), n.side)
              else n.side end as team,
         (regexp_match(n.pick_text, '([+-]\d+)\s*$'))[1]::int as price
  from named n
$$;
revoke all on function public.gary_graded_games(date, date) from public;

commit;
