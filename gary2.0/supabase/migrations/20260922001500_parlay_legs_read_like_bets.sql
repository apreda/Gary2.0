-- A leg reads the way a fan would say it, not as a market key: a dart by its
-- category ("Mike Trout 2+ hits and a run", "Junior Caminero to homer", "Rockies
-- game: a run in the 1st"), a prop with its market in words.

create or replace function gary_private.parlay_leg_words(p_player text, p_bet text, p_prop text, p_kind text, p_matchup text) returns text
language sql immutable as $$
  select case p_kind
    when 'hr' then p_player || ' to homer'
    when 'hits_run' then p_player || ' 2+ hits and a run'
    when 'first_inning' then coalesce(split_part(p_matchup, ' @ ', 2), p_matchup) || ' game: ' || case when lower(p_bet) = 'under' then 'no run in the 1st' else 'a run in the 1st' end
    when 'td' then p_player || ' anytime touchdown'
    when 'tetd' then p_player || ' anytime touchdown'
    when 'qbtd' then p_player || ' rushing touchdown'
    when 'ftd' then p_player || ' first touchdown'
    when 'int' then p_player || ' to throw an interception'
    else concat_ws(' ', p_player, lower(p_bet), substring(p_prop from '[0-9.]+$'),
           replace(regexp_replace(regexp_replace(coalesce(p_prop,''), '\s+[0-9.]+$', ''), '^(pitcher|batter|player)_', ''), '_', ' '))
  end
$$;

create or replace function gary_private.parlay_legs(p_date date)
returns table(key text, source text, league text, text text, odds integer, matchup text, game_id text, commence_time timestamptz, grade jsonb)
language sql stable set search_path = '' as $$
  with w as (
    select 'winners:' || c.id as key, 'winners' as source, c.league,
      case when c.kind = 'prop'
        then gary_private.parlay_leg_words(c.pick_snapshot->>'player', c.pick_snapshot->>'bet',
               concat_ws(' ', regexp_replace(coalesce(c.pick_snapshot->>'prop',''), '\s+[0-9.]+$', ''), c.pick_snapshot->>'line'), null, null)
        else regexp_replace(c.pick_text, '\s*[+-][0-9]{3,4}\s*$', '') end as text,
      c.odds, coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')) as matchup,
      c.game_id, c.commence_time,
      jsonb_build_object('kind', c.kind, 'candidate_id', c.id, 'pick_text', c.pick_text, 'snapshot', c.pick_snapshot) as grade
    from public.winners_board b join public.winners_candidates c on c.id = b.candidate_id
    where b.game_date = to_char(p_date, 'YYYY-MM-DD') and c.odds is not null and abs(c.odds) >= 100
  ), p as (
    select 'prop:' || md5(coalesce(pk->>'player','') || coalesce(pk->>'prop','') || coalesce(pk->>'bet','')) as key, 'prop' as source,
      case when pk->>'sport' ilike '%mlb%' then 'MLB' when pk->>'sport' ilike '%ncaaf%' then 'NCAAF' when pk->>'sport' ilike '%nfl%' then 'NFL' else upper(coalesce(pk->>'league', pk->>'sport')) end as league,
      gary_private.parlay_leg_words(pk->>'player', pk->>'bet',
        concat_ws(' ', regexp_replace(coalesce(pk->>'prop',''), '\s+[0-9.]+$', ''), coalesce(pk->>'line', substring(pk->>'prop' from '[0-9.]+$'))), null, null) as text,
      (pk->>'odds')::integer as odds, pk->>'matchup' as matchup, pk->>'game_id' as game_id,
      (pk->>'commence_time')::timestamptz as commence_time,
      jsonb_build_object('kind', 'prop', 'snapshot', jsonb_build_object('player', pk->>'player', 'prop', pk->>'prop', 'bet', pk->>'bet', 'line', pk->>'line')) as grade
    from public.prop_picks pp, jsonb_array_elements(pp.picks) pk
    where pp.date = to_char(p_date, 'YYYY-MM-DD') and (pk->>'odds') ~ '^-?[0-9]+$' and abs((pk->>'odds')::integer) >= 100
  ), d as (
    select 'dart:' || d.id as key, 'dart' as source, d.league,
      gary_private.parlay_leg_words(d.player, d.bet, d.prop, d.kind, d.matchup) as text,
      d.odds, d.matchup, d.game_id, d.commence_time,
      jsonb_build_object('kind', 'prop', 'snapshot', jsonb_build_object('player', d.player, 'prop', d.prop, 'bet', d.bet)) as grade
    from public.darts d where d.game_date = p_date and d.scratched_at is null and d.odds is not null and abs(d.odds) >= 100
  )
  select * from (select * from w union all select * from p union all select * from d) x
  where x.commence_time > now()
  order by x.commence_time, x.key
$$;

-- Today's stored slip takes the new wording.
update public.parlay_of_the_day p set legs = (
  select jsonb_agg(l || jsonb_build_object('text', coalesce(
      (select gary_private.parlay_leg_words(d.player, d.bet, d.prop, d.kind, d.matchup) from public.darts d where 'dart:' || d.id = l->>'key'),
      l->>'text')) order by (l->>'n')::int)
  from jsonb_array_elements(p.legs) l)
where p.game_date = current_date;
