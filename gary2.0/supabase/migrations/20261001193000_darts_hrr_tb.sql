-- MLB darts (founder, Oct 1 2026): H+R+RBI and total bases, over or under,
-- replace 2+ hits for good; the first inning reads YRFI / NRFI. The words a
-- parlay leg, the price history and the daily email use for the two new
-- kinds. 2+ hits keeps its words for the darts already thrown.

create or replace function gary_private.parlay_leg_words(p_player text, p_bet text, p_prop text, p_kind text, p_matchup text)
 returns text
 language sql
 immutable
as $function$
  select case p_kind
    when 'hr' then p_player || ' to homer'
    when 'hrr' then concat_ws(' ', p_player, lower(p_bet), substring(p_prop from '[0-9.]+$'), 'H+R+RBI')
    when 'tb' then concat_ws(' ', p_player, lower(p_bet), substring(p_prop from '[0-9.]+$'), 'total bases')
    when 'multihit' then p_player || ' 2+ hits'
    when 'hits_run' then p_player || ' 2+ hits and a run'
    when 'first_inning' then case when lower(p_bet) = 'under' then 'NRFI' else 'YRFI' end
    when 'td' then p_player || ' anytime touchdown'
    when 'tetd' then p_player || ' anytime touchdown'
    when 'qbtd' then p_player || ' rushing touchdown'
    when 'ftd' then p_player || ' first touchdown'
    when 'int' then p_player || ' to throw an interception'
    else concat_ws(' ', p_player, lower(p_bet), substring(p_prop from '[0-9.]+$'),
           replace(regexp_replace(regexp_replace(coalesce(p_prop,''), '\s+[0-9.]+$', ''), '^(pitcher|batter|player)_', ''), '_', ' '))
  end
$function$;

create or replace function public.player_price_history(p_league text, p_players text[], p_from date, p_to date)
 returns table(player text, prop_type text, line numeric, over_odds integer, under_odds integer, game_date date, matchup text, source text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with names as (select lower(x) as n from unnest(p_players) x),
  menu as (
    select m->>'player' as player, m->>'prop_type' as prop_type,
      case when m->>'line' ~ '^-?[0-9]+(\.[0-9]+)?$' then (m->>'line')::numeric end as line,
      case when m->>'over' ~ '^-?[0-9]+(\.0+)?$' then (m->>'over')::numeric::integer end as over_odds,
      case when m->>'under' ~ '^-?[0-9]+(\.0+)?$' then (m->>'under')::numeric::integer end as under_odds,
      pm.game_date, pm.matchup, 'props menu'::text as source
    from public.prop_menu pm, jsonb_array_elements(pm.markets) m
    where pm.league = p_league and pm.game_date between p_from and p_to
      and lower(m->>'player') in (select n from names)
  ),
  board as (
    select b.player, case b.kind when 'hr' then 'home_runs' when 'hrr' then 'hits_runs_rbis' when 'tb' then 'total_bases'
                                 when 'multihit' then 'hits' else b.kind end as prop_type,
      b.line, b.over_odds, b.under_odds, b.game_date, null::text as matchup, 'darts board'::text as source
    from public.dart_board_prices b
    where b.league = p_league and b.game_date between p_from and p_to and lower(b.player) in (select n from names)
  )
  select * from menu union all select * from board
  order by 1, 2, 6
$function$;

-- The daily email's category words: the one label line, edited in place.
do $$
declare
  v_def text := pg_get_functiondef('gary_ops.performance_mail'::regproc);
  v_old text := $q$when 'hr' then 'home runs' when 'multihit' then '2+ hits' when 'first_inning' then '1st inning run'$q$;
  v_new text := $q$when 'hrr' then 'H+R+RBI' when 'tb' then 'total bases' when 'hr' then 'home runs' when 'multihit' then '2+ hits' when 'first_inning' then 'YRFI / NRFI'$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'performance_mail: the darts label line was not found';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;
