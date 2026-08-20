-- Classic leaderboard v2 (Aug 20 2026, founder build order).
--
-- The Book tab's standings: name, record, win%, and THE STREAK a player is
-- riding — both winning and losing runs. Streaks read the player's
-- DESIGNATED plays (streak_pick rows: the founder's "they decide which bet
-- contributes" mechanic, live since Jul 26). Players who have never starred
-- a play fall back to their full verified run so the board breathes from
-- day one; the moment they star one, only designated plays count.
--
-- Honesty rules carry over verbatim from your_book_leaderboard v1:
-- verified WITH-GARY ledger only (system-graded tail/fade), opt-in by
-- claimed handle, 5 decided bets in-window to appear, aggregate-only.
-- Self-graded manual rows NEVER rank — that line is the product.

create or replace function public.your_book_leaderboard_v2(p_window text default 'season')
returns table(
  display_name text, wins bigint, losses bigint, pushes bigint,
  units numeric, win_pct numeric, streak_len int, streak_kind text,
  best_streak int
)
language sql security definer set search_path = public as $$
  with window_start as (
    select case lower(coalesce(p_window, 'season'))
      when '7d' then (now() at time zone 'America/New_York')::date - 7
      when '30d' then (now() at time zone 'America/New_York')::date - 30
      else date '2026-03-01'
    end as d
  ),
  -- A streak is absolute — it never resets because the board window moved —
  -- so runs read the full verified history, not the window.
  verified as (
    select ub.user_id, ub.status, ub.streak_pick,
           ub.game_date, ub.graded_at, ub.placed_at
    from public.user_bets ub
    where ub.kind in ('tail','fade')
      and ub.graded_by = 'system'
      and ub.status in ('won','lost')
  ),
  has_star as (
    select user_id, bool_or(coalesce(streak_pick, false)) as any_star
    from verified group by user_id
  ),
  streak_src as (
    select v.user_id, v.status, v.game_date, v.graded_at, v.placed_at
    from verified v
    join has_star h using (user_id)
    where (h.any_star and coalesce(v.streak_pick, false)) or (not h.any_star)
  ),
  ordered as (
    select user_id, status,
           row_number() over (partition by user_id
             order by game_date desc, graded_at desc nulls last, placed_at desc) as rn
    from streak_src
  ),
  latest as (
    select distinct on (user_id) user_id, status as cur
    from ordered order by user_id, rn
  ),
  runs as (
    select l.user_id, l.cur,
           coalesce(min(o.rn) filter (where o.status <> l.cur) - 1, max(o.rn))::int as len
    from latest l
    join ordered o using (user_id)
    group by l.user_id, l.cur
  )
  select
    pp.display_name,
    count(*) filter (where ub.status = 'won')  as wins,
    count(*) filter (where ub.status = 'lost') as losses,
    count(*) filter (where ub.status = 'push') as pushes,
    coalesce(sum(ub.units_net), 0)::numeric(10,2) as units,
    coalesce(round(100.0 * (count(*) filter (where ub.status = 'won'))
      / nullif(count(*) filter (where ub.status in ('won','lost')), 0), 1), 0) as win_pct,
    coalesce(r.len, 0) as streak_len,
    coalesce(case r.cur when 'won' then 'W' when 'lost' then 'L' end, '') as streak_kind,
    coalesce(max(us.best), 0) as best_streak
  from public.public_profiles pp
  join public.user_bets ub
    on ub.user_id = pp.user_id
   and ub.kind in ('tail','fade')
   and ub.graded_by = 'system'
   and ub.status in ('won','lost','push')
   and ub.game_date >= (select d from window_start)
  left join runs r on r.user_id = pp.user_id
  left join public.user_streaks us on us.user_id = pp.user_id
  group by pp.user_id, pp.display_name, r.len, r.cur
  having count(*) filter (where ub.status in ('won','lost')) >= 5
  order by (case when r.cur = 'won' then r.len else -coalesce(r.len, 0) end) desc nulls last,
           wins desc
  limit 100
$$;

grant execute on function public.your_book_leaderboard_v2(text) to authenticated, anon;
