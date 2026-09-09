-- Sep 9 2026 — line_movers opens each market at the first rung that carries
-- it (the ledger learned totals today, so a game first seen before that has a
-- spread open earlier than its total open), and says when the total was first
-- seen. Aggregates replace the first/last-row joins so a partial row can never
-- blank a market. Return type changes, so the function is dropped first.

drop function if exists public.line_movers(text, text, text);

create function public.line_movers(p_sport text, p_from text, p_to text)
returns table (
  game_date text,
  game_id text,
  home_team text,
  away_team text,
  vendor text,
  commence_time timestamptz,
  first_seen timestamptz,
  last_seen timestamptz,
  rungs integer,
  open_spread_home numeric,
  now_spread_home numeric,
  open_spread_home_odds integer,
  now_spread_home_odds integer,
  open_total numeric,
  now_total numeric,
  open_total_seen timestamptz,
  open_ml_home integer,
  now_ml_home integer,
  open_ml_away integer,
  now_ml_away integer
)
language sql stable security definer
set search_path = ''
as $$
  with games as (
    select distinct s.game_date, s.game_id
    from public.odds_snapshots s
    where s.sport = p_sport and s.game_date between p_from and p_to
  ), chosen as (
    select g.game_date, g.game_id,
           public.line_ladder_vendor(p_sport, g.game_date, g.game_id) as vendor
    from games g
  ), book as (
    select s.*
    from public.odds_snapshots s
    join chosen c on c.game_date = s.game_date and c.game_id = s.game_id and c.vendor = s.line_vendor
    where s.sport = p_sport
  )
  select b.game_date, b.game_id,
         max(b.home_team), max(b.away_team), max(b.line_vendor),
         max(b.commence_time), min(b.seen_at), max(b.seen_at), count(*)::integer,
         (array_agg(b.spread_home order by b.seen_at) filter (where b.spread_home is not null))[1],
         (array_agg(b.spread_home order by b.seen_at desc) filter (where b.spread_home is not null))[1],
         (array_agg(b.spread_home_odds order by b.seen_at) filter (where b.spread_home_odds is not null))[1],
         (array_agg(b.spread_home_odds order by b.seen_at desc) filter (where b.spread_home_odds is not null))[1],
         (array_agg(b.total order by b.seen_at) filter (where b.total is not null))[1],
         (array_agg(b.total order by b.seen_at desc) filter (where b.total is not null))[1],
         min(b.seen_at) filter (where b.total is not null),
         (array_agg(b.moneyline_home order by b.seen_at) filter (where b.moneyline_home is not null))[1],
         (array_agg(b.moneyline_home order by b.seen_at desc) filter (where b.moneyline_home is not null))[1],
         (array_agg(b.moneyline_away order by b.seen_at) filter (where b.moneyline_away is not null))[1],
         (array_agg(b.moneyline_away order by b.seen_at desc) filter (where b.moneyline_away is not null))[1]
  from book b
  group by b.game_date, b.game_id
  order by b.game_date, max(b.commence_time) nulls last, b.game_id
$$;

revoke all on function public.line_movers(text, text, text) from public;
grant execute on function public.line_movers(text, text, text) to anon, authenticated, service_role;
