-- The day pass on a split day (Sep 24: four games from 12:35, four from
-- 18:05, and so on) tied on the two-hour count and fell to the afternoon.
-- A tie goes to the window whose three hours hold more starts; that puts
-- Sep 24 on the 6:45 PM window (pass at 6:00).
create or replace function gary_private.day_pass_at(p_day date)
returns timestamptz language sql stable set search_path = '' as $$
  with g as (
    select s.commence_time from public.daily_slate s
    where s.date = p_day and s.commence_time is not null
      and lower(coalesce(s.game_status, '')) not in ('cancelled', 'canceled', 'postponed')
  )
  select w.s - interval '45 minutes'
  from (select a.commence_time as s,
          (select count(*) from g b where b.commence_time between a.commence_time and a.commence_time + interval '2 hours') as n2,
          (select count(*) from g b where b.commence_time between a.commence_time and a.commence_time + interval '3 hours') as n3
        from g a) w
  order by w.n2 desc, w.n3 desc, w.s asc
  limit 1
$$;
revoke all on function gary_private.day_pass_at(date) from public;
