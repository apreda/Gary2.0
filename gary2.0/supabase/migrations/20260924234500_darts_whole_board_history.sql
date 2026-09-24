-- DARTS, THE WHOLE BOARD (founder GO, Sep 24 2026 evening).
--
-- 1. A player's own line history on his sheet (Adam: the line lags a
--    breakout; the divergence between what he is doing and where his line
--    sits is the whole opportunity). The props lane stores every market's
--    line and price per game at seal time (prop_menu); the dart board keeps
--    its own prices here (home runs and 2+ hits left the props menu Sep 23).
--    player_price_history returns both, small, for the named players only.
-- 2. The lineup-time review: Gary reviews his morning darts for a game once
--    its props desk is built and may swap one. The morning row stays, marked
--    scratched with replaced_by pointing at the new dart, and leaves the page.

create table if not exists public.dart_board_prices (
  game_date date not null,
  league text not null,
  kind text not null,
  player text not null,
  player_id text,
  game_id text not null,
  line numeric,
  over_odds integer,
  under_odds integer,
  book text,
  seen_at timestamptz not null default now(),
  primary key (game_date, league, kind, player, game_id)
);
alter table public.dart_board_prices enable row level security;
revoke all on public.dart_board_prices from anon, authenticated;

alter table public.darts add column if not exists reviewed_at timestamptz;
alter table public.darts add column if not exists replaced_by bigint references public.darts(id);

create or replace function public.player_price_history(p_league text, p_players text[], p_from date, p_to date)
returns table(player text, prop_type text, line numeric, over_odds integer, under_odds integer, game_date date, matchup text, source text)
language sql stable security definer set search_path = '' as $$
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
    select b.player, case b.kind when 'hr' then 'home_runs' when 'multihit' then 'hits' else b.kind end as prop_type,
      b.line, b.over_odds, b.under_odds, b.game_date, null::text as matchup, 'darts board'::text as source
    from public.dart_board_prices b
    where b.league = p_league and b.game_date between p_from and p_to and lower(b.player) in (select n from names)
  )
  select * from menu union all select * from board
  order by 1, 2, 6
$$;
revoke all on function public.player_price_history(text, text[], date, date) from public, anon, authenticated;
grant execute on function public.player_price_history(text, text[], date, date) to service_role;

-- The page shows the darts that stand: a dart swapped at lineup time leaves it.
create or replace function public.darts_day(p_day date)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'game_date', d.game_date, 'league', d.league, 'kind', d.kind, 'player', d.player,
    'player_id', d.player_id, 'team', d.team, 'position', d.position, 'matchup', d.matchup, 'game_id', d.game_id,
    'commence_time', d.commence_time, 'prop', d.prop, 'bet', d.bet, 'odds', d.odds, 'odds_alt', d.odds_alt,
    'book', d.book, 'reason', d.reason, 'scratched', d.scratched_at is not null, 'scratch_reason', d.scratch_reason,
    'form', d.form, 'rank', d.rank)
    order by d.rank nulls last, d.commence_time nulls last, d.id), '[]'::jsonb)
  from public.darts d
  where d.game_date = p_day
    and d.replaced_by is null
    and not (d.league = 'NFL' and d.kind in ('qbtd', 'int') and extract(isodow from d.game_date) <> 7)
$function$;
