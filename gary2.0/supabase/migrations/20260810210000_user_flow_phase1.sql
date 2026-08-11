-- USER FLOW PHASE 1 (founder-delegated, Aug 10 2026): profile identity +
-- the honest leaderboard.
--
-- Additive only — nullable columns, one SECURITY DEFINER reader. No rows
-- touched, RLS on base tables unchanged: the reader exposes ranked
-- AGGREGATES plus public display fields, never individual bet rows.
--
-- Leaderboard doctrine (the anti-Pikkit design): rank by UNITS for logged
-- bets and by net wins for tail/fade, over a ROLLING window, behind a
-- minimum-graded floor — raw win% rewards whoever bet three favorites
-- once, and that is exactly the board we refuse to ship.

alter table public.public_profiles
  add column if not exists handle text,
  add column if not exists avatar text,
  add column if not exists bio text;

create unique index if not exists public_profiles_handle_key
  on public.public_profiles (lower(handle))
  where handle is not null;

create or replace function public.leaderboard(
  p_lane text default 'tail',      -- 'tail' | 'fade' | 'log'
  p_days int default 30,
  p_min_graded int default 5
) returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  handle text,
  avatar text,
  graded bigint,
  wins bigint,
  losses bigint,
  units numeric
)
language sql
security definer
set search_path = public
as $$
  with tf as (
    -- Tail/fade lanes ride user_picks. Decision strings are 'bet' (tail)
    -- and 'fade' — live values verified Aug 10. Outcome spellings tolerant
    -- by design: never let an enum drift silently zero a lane.
    select up.user_id,
           count(*) filter (where up.outcome in ('win','won','loss','lost')) as graded,
           count(*) filter (where up.outcome in ('win','won')) as wins,
           count(*) filter (where up.outcome in ('loss','lost')) as losses,
           null::numeric as units
    from user_picks up
    where up.decision = case when p_lane = 'fade' then 'fade' else 'bet' end
      and up.created_at >= now() - make_interval(days => p_days)
    group by up.user_id
  ),
  lg as (
    -- Logged-bet lane rides user_bets; graded truth = graded_at + units_net.
    select ub.user_id,
           count(*) filter (where ub.graded_at is not null) as graded,
           count(*) filter (where ub.units_net > 0) as wins,
           count(*) filter (where ub.units_net < 0) as losses,
           coalesce(sum(ub.units_net), 0) as units
    from user_bets ub
    where ub.placed_at >= now() - make_interval(days => p_days)
    group by ub.user_id
  ),
  base as (
    select * from tf where p_lane in ('tail','fade')
    union all
    select * from lg where p_lane = 'log'
  )
  select row_number() over (
           order by case when p_lane = 'log' then base.units
                         else (base.wins - base.losses)::numeric end desc,
                    base.wins desc,
                    base.graded desc
         ) as rank,
         base.user_id,
         coalesce(pp.display_name, 'Bettor ' || right(base.user_id::text, 4)) as display_name,
         pp.handle,
         pp.avatar,
         base.graded,
         base.wins,
         base.losses,
         base.units
  from base
  left join public.public_profiles pp on pp.user_id = base.user_id
  where base.graded >= p_min_graded
  order by 1
  limit 100;
$$;

revoke all on function public.leaderboard(text, int, int) from public;
grant execute on function public.leaderboard(text, int, int) to anon, authenticated;
