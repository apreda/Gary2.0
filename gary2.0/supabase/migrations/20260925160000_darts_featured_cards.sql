-- THE DARTS FEATURED CARDS (founder GO, Sep 25 2026): after the parlay and the
-- Winners bankroll, the row carries the day's MARQUEE game (MLB) / PRIMETIME
-- (NFL), HOT & COLD, and ALL DARTS.

-- 1. MARQUEE. The MLB game the public would call the best one today ("the way
-- ESPN or the public would think of it ... nothing to do with what Gary
-- picks"), chosen each morning by one editor's read of the standings, national
-- TV and the probable starters (scripts/run-marquee.js), and locked for the
-- day. It opens the Primetime page. It is separate from winners_big_games,
-- which admits Winners plays.
create table if not exists public.marquee_games (
  game_date date not null,
  league text not null,
  game_id text not null,
  reason text,
  model text,
  created_at timestamptz not null default now(),
  primary key (game_date, league)
);
alter table public.marquee_games enable row level security;
revoke all on public.marquee_games from public, anon, authenticated;
grant all on public.marquee_games to service_role;

-- 2. HOT & COLD. Tonight's hottest and coldest bats (last seven games) and arms
-- (the probable starters' last three starts), told in counts. Written each
-- night beside the streaks (streaksService.js). Kept out of `streaks`: the
-- shipped 2.26 Hub lists every row of that table.
create table if not exists public.player_form (
  game_date date not null,
  league text not null,
  kind text not null check (kind in ('hot', 'cold', 'hot_arm', 'cold_arm')),
  player text not null,
  team text,
  detail text not null,
  short text,
  rank integer not null,
  next_game text,
  created_at timestamptz not null default now(),
  primary key (game_date, league, kind, player)
);
alter table public.player_form enable row level security;
revoke all on public.player_form from public, anon, authenticated;
grant all on public.player_form to service_role;

-- The latest night's form per league, never more than two days old.
create or replace function public.get_player_form(p_date text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_day date;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' or to_char(p_date::date, 'YYYY-MM-DD') <> p_date then
    raise exception 'Invalid date';
  end if;
  v_day := p_date::date;
  return coalesce((
    select jsonb_agg(jsonb_build_object('league', f.league, 'kind', f.kind, 'player', f.player, 'team', f.team,
             'detail', f.detail, 'short', f.short, 'rank', f.rank, 'next_game', f.next_game)
           order by f.league, f.kind, f.rank)
    from public.player_form f
    where f.game_date between v_day - 2 and v_day
      and f.game_date = (select max(x.game_date) from public.player_form x
                         where x.league = f.league and x.game_date between v_day - 2 and v_day)), '[]'::jsonb);
end $$;
revoke all on function public.get_player_form(text) from public;
grant execute on function public.get_player_form(text) to anon, authenticated, service_role;

-- 3. ALL DARTS marks each dart that hit: today's darts carry their result.
do $$
declare v_def text := pg_get_functiondef('public.darts_day(date)'::regprocedure);
        v_new text := replace(v_def, $o$'form', d.form, 'rank', d.rank)$o$, $n$'form', d.form, 'rank', d.rank, 'result', d.result)$n$);
begin
  if v_new = v_def then raise exception 'darts_day: the rank field was not found'; end if;
  execute v_new;
end $$;

-- 4. The marquee game joins the Primetime games at any start time, as the
-- MARQUEE GAME; the night's NFL, playoff and big-game rules are unchanged.
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
            or (s.league = 'MLB' and (coalesce(s.postseason, false)
                or exists (select 1 from public.winners_big_games b
                           where b.game_date = to_char(p_date, 'YYYY-MM-DD') and b.league = 'MLB' and b.game_id = s.bdl_game_id::text)))))
      or (s.league = 'MLB' and exists (select 1 from public.marquee_games m
                                       where m.game_date = p_date and m.league = 'MLB' and m.game_id = s.bdl_game_id::text)))
  order by s.league, s.bdl_game_id, s.created_at desc
$$;

-- 5. NFL games lead the list: a build that shows the first game (2.27) keeps
-- Sunday Night Football ahead of an afternoon marquee game.
do $$
declare v_def text := pg_get_functiondef('public.get_primetime(text)'::regprocedure);
        v_new text := replace(v_def, 'order by g.commence_time, g.game_id)', 'order by (g.league <> ''NFL''), g.commence_time, g.game_id)');
begin
  if v_new = v_def then raise exception 'get_primetime: the game order was not found'; end if;
  execute v_new;
end $$;
