-- Weekends build from the first big wave (founder, Sep 26 2026): the parlay
-- and the streak pick are out before the noon college kickoffs and the 1 PM
-- NFL window, when the weekend starts. The first wave is the earliest two
-- hours holding at least half as many starts as the day's busiest two hours
-- (a lone London game or noon MLB start is not a wave): 11:15 AM on a
-- college Saturday, 11:25 AM or 12:15 PM on an NFL Sunday. Weekdays keep the
-- busiest window.
create or replace function gary_private.day_pass_at(p_day date)
returns timestamptz language sql stable set search_path = '' as $$
  with g as (
    select s.commence_time from public.daily_slate s
    where s.date = p_day and s.commence_time is not null
      and lower(coalesce(s.game_status, '')) not in ('cancelled', 'canceled', 'postponed')
  ), w as (
    select a.commence_time as s,
      (select count(*) from g b where b.commence_time between a.commence_time and a.commence_time + interval '2 hours') as n2,
      (select count(*) from g b where b.commence_time between a.commence_time and a.commence_time + interval '3 hours') as n3
    from g a
  )
  select w.s - interval '45 minutes'
  from w
  where extract(isodow from p_day) not in (6, 7) or w.n2 * 2 >= (select max(x.n2) from w x)
  order by case when extract(isodow from p_day) in (6, 7) then w.s end asc nulls last,
           w.n2 desc, w.n3 desc, w.s asc
  limit 1
$$;
revoke all on function gary_private.day_pass_at(date) from public;
