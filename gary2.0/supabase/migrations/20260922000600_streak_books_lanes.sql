-- Sep 22 2026 (midday): the books as they stand now, the streak pick, and
-- the extra dart lanes.
begin;

-- THE BOOKS, NOW. Every book's latest quote on a game from odds_snapshots
-- (the scheduler's closing watch records every book), so the breakdown's
-- book table is live, never the pick-time snapshot alone.
create or replace function public.get_books_now(p_league text, p_date text, p_game_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'book', s.line_vendor, 'seen_at', s.seen_at,
      'spread_home', s.spread_home, 'spread_home_odds', s.spread_home_odds,
      'spread_away', s.spread_away, 'spread_away_odds', s.spread_away_odds,
      'ml_home', s.moneyline_home, 'ml_away', s.moneyline_away,
      'total', s.total, 'over', s.total_over_odds, 'under', s.total_under_odds) order by s.line_vendor), '[]'::jsonb)
  from (
    select distinct on (o.line_vendor) o.*
    from public.odds_snapshots o
    where o.game_date = p_date and o.game_id = p_game_id
      and (upper(o.sport) = upper(p_league) or o.sport = case upper(p_league)
        when 'MLB' then 'baseball_mlb' when 'NFL' then 'americanfootball_nfl'
        when 'NCAAF' then 'americanfootball_ncaaf' when 'NBA' then 'basketball_nba' else o.sport end)
      and o.line_vendor is not null and o.line_vendor not in ('polymarket', 'kalshi')
    order by o.line_vendor, o.seen_at desc) s
$$;
revoke all on function public.get_books_now(text, text, text) from public;
grant execute on function public.get_books_now(text, text, text) to anon, authenticated, service_role;

-- THE STREAK PICK (founder, Sep 22 2026): one Winners play a day that counts
-- toward Gary's streak and doubles as the top free pick. Chosen from the
-- day's board by his own stake (the biggest stake is his conviction; a game
-- pick wins a tie, then the earlier admission), locked once the day's first
-- admitted play is an hour from starting. Immutable for the day.
create table if not exists public.streak_picks (
  game_date date primary key,
  candidate_id bigint not null,
  league text not null,
  kind text not null,
  pick_text text not null,
  odds integer,
  matchup text,
  game_id text,
  commence_time timestamptz,
  stake_units numeric,
  player text,
  prop text,
  bet text,
  chosen_at timestamptz not null default now()
);
alter table public.streak_picks enable row level security;
drop policy if exists streak_picks_read on public.streak_picks;
create policy streak_picks_read on public.streak_picks for select to anon, authenticated using (true);

create or replace function public.select_streak_pick(p_date text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_first timestamptz; r record;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  if exists (select 1 from public.streak_picks where game_date = p_date::date) then return false; end if;
  select min(c.commence_time) into v_first
  from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
  where w.game_date = p_date;
  if v_first is null or v_first > now() + interval '60 minutes' then return false; end if;
  select w.candidate_id, w.league, w.kind, c.pick_text, c.odds, c.game_id, c.commence_time, w.stake_units,
         coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')) as matchup,
         c.pick_snapshot->>'player' as player, c.pick_snapshot->>'prop' as prop, c.pick_snapshot->>'bet' as bet
    into r
  from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
  where w.game_date = p_date
  order by coalesce(w.stake_units, 0) desc, (w.kind = 'game') desc, w.admitted_at asc
  limit 1;
  if r is null then return false; end if;
  insert into public.streak_picks (game_date, candidate_id, league, kind, pick_text, odds, matchup, game_id, commence_time, stake_units, player, prop, bet)
  values (p_date::date, r.candidate_id, r.league, r.kind, r.pick_text, r.odds, r.matchup, r.game_id, r.commence_time, r.stake_units, r.player, r.prop, r.bet)
  on conflict do nothing;
  return found;
end $$;
revoke all on function public.select_streak_pick(text) from public;
grant execute on function public.select_streak_pick(text) to service_role;

-- One streak pick with its grade.
create or replace function public.streak_pick_day(p_day date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'game_date', s.game_date, 'candidate_id', s.candidate_id, 'league', s.league, 'kind', s.kind,
    'pick_text', s.pick_text, 'odds', s.odds, 'matchup', s.matchup, 'game_id', s.game_id,
    'commence_time', s.commence_time, 'stake_units', s.stake_units, 'player', s.player, 'prop', s.prop, 'bet', s.bet,
    'result', coalesce(pg.result, pr.result))
  from public.streak_picks s
  left join lateral (select g.result from public.gary_graded_games(s.game_date, s.game_date) g
                     where g.pick_text = s.pick_text and g.league = s.league limit 1) pg on s.kind = 'game'
  left join lateral (select lower(x.result) as result from public.prop_results x
                     where x.game_date = s.game_date and lower(x.player_name) = lower(coalesce(s.player, ''))
                       and x.prop_type = split_part(coalesce(s.prop, ''), ' ', 1)
                       and lower(coalesce(x.bet, 'over')) = lower(coalesce(s.bet, 'over'))
                     order by x.updated_at desc nulls last limit 1) pr on s.kind = 'prop'
  where s.game_date = p_day
$$;
revoke all on function public.streak_pick_day(date) from public;

create or replace function public.get_streak(p_date text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_day date; v_current int := 0; v_best int := 0; v_run int := 0; r record;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  v_day := p_date::date;
  -- Graded picks newest first: the current streak is the leading run of wins
  -- (a push or an ungraded day is skipped, never a break).
  for r in
    select (public.streak_pick_day(d.game_date)->>'result') as result
    from public.streak_picks d where d.game_date <= v_day order by d.game_date desc
  loop
    if r.result = 'won' then v_current := v_current + 1;
    elsif r.result = 'lost' then exit;
    end if;
  end loop;
  for r in
    select (public.streak_pick_day(d.game_date)->>'result') as result
    from public.streak_picks d where d.game_date <= v_day order by d.game_date asc
  loop
    if r.result = 'won' then v_run := v_run + 1; v_best := greatest(v_best, v_run);
    elsif r.result = 'lost' then v_run := 0;
    end if;
  end loop;
  return jsonb_build_object(
    'current', v_current, 'best', v_best,
    'today', public.streak_pick_day(v_day),
    'yesterday', public.streak_pick_day(v_day - 1));
end $$;
revoke all on function public.get_streak(text) from public;
grant execute on function public.get_streak(text) to anon, authenticated, service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'streak-pick-select';
select cron.schedule('streak-pick-select', '*/10 * * * *',
  $cron$select public.select_streak_pick(to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD'))$cron$);

-- DART LANES (founder's picks, Sep 22): beside HR and TD, the multi-hit
-- (2+ hits) and, for the NFL, receiving yards over and passing touchdowns
-- over, from Gary's core prop lane. At most two darts of one kind a day.
create or replace function public.select_darts(p_date text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_inserted int := 0; v_league text; v_cap int; v_have int; v_games text[]; v_bands int[]; v_band int; r record;
  v_lo int; v_hi int; v_kinds jsonb;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  for v_league, v_cap, v_lo, v_hi in select * from (values ('MLB', 4, 400, 600), ('NFL', 4, 200, 400)) t(l, c, lo, hi) loop
    select count(*), coalesce(array_agg(game_id) filter (where game_id is not null), '{}'),
           array[count(*) filter (where odds < v_lo), count(*) filter (where odds >= v_lo and odds < v_hi), count(*) filter (where odds >= v_hi)],
           coalesce(jsonb_object_agg(kind, n) filter (where kind is not null), '{}'::jsonb)
      into v_have, v_games, v_bands, v_kinds
      from (select d.*, count(*) over (partition by d.kind) as n from public.darts d where d.game_date = p_date::date and d.league = v_league) x;
    for r in
      select pk->>'player' as player, pk->>'player_id' as player_id, pk->>'team' as team, pk->>'matchup' as matchup,
             pk->>'game_id' as game_id, nullif(pk->>'commence_time', '')::timestamptz as commence_time,
             pk->>'prop' as prop, coalesce(pk->>'bet', 'over') as bet, (pk->>'odds')::int as odds,
             nullif(pk->>'confidence', '')::numeric as confidence, pk->>'rationale' as reason,
             case when pk->>'lane' = 'HR' then 'hr'
                  when pk->>'lane' = 'TD' then 'td'
                  when pk->>'prop' like 'hits 1.5%' then 'multihit'
                  when pk->>'prop' like 'receiving_yards%' then 'recyds'
                  when pk->>'prop' like 'passing_touchdowns%' then 'passtd'
             end as kind
      from public.prop_picks d, jsonb_array_elements(d.picks) pk
      where d.date = p_date
        and ((v_league = 'MLB' and (pk->>'lane' = 'HR' or (pk->>'lane' = 'CORE' and upper(pk->>'sport') = 'MLB' and pk->>'prop' like 'hits 1.5%' and lower(coalesce(pk->>'bet', 'over')) = 'over')))
          or (v_league = 'NFL' and upper(pk->>'sport') = 'NFL' and (pk->>'lane' = 'TD'
              or (pk->>'lane' = 'CORE' and lower(coalesce(pk->>'bet', 'over')) = 'over'
                  and (pk->>'prop' like 'receiving_yards%' or pk->>'prop' like 'passing_touchdowns%')))))
        and (pk->>'odds') ~ '^-?\d+$'
        and coalesce(pk->>'player', '') <> ''
      order by nullif(pk->>'confidence', '')::numeric desc nulls last, (pk->>'odds')::int desc
    loop
      exit when v_have >= v_cap;
      continue when r.kind is null;
      continue when r.game_id is not null and r.game_id = any(v_games);
      continue when coalesce((v_kinds->>r.kind)::int, 0) >= 2;
      v_band := case when r.odds < v_lo then 1 when r.odds < v_hi then 2 else 3 end;
      continue when v_bands[v_band] >= 2;
      insert into public.darts (game_date, league, kind, player, player_id, team, matchup, game_id, commence_time, prop, bet, odds, confidence, reason)
      values (p_date::date, v_league, r.kind, r.player, r.player_id, r.team, r.matchup, r.game_id, r.commence_time, r.prop, r.bet, r.odds, r.confidence, r.reason)
      on conflict do nothing;
      if found then
        v_have := v_have + 1; v_inserted := v_inserted + 1;
        if r.game_id is not null then v_games := v_games || r.game_id; end if;
        v_bands[v_band] := v_bands[v_band] + 1;
        v_kinds := v_kinds || jsonb_build_object(r.kind, coalesce((v_kinds->>r.kind)::int, 0) + 1);
      end if;
    end loop;
  end loop;
  return v_inserted;
end $$;

commit;
