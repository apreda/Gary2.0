-- GARY'S STREAK COUNTS FROM SEP 23 (founder, Sep 24 2026: "let's go ahead and
-- include yesterday's loss... that way there'll be at least one L and then
-- it'll be obvious"). The form guide shows Sep 23's loss before today's
-- pick; the current run and its best are unchanged by a loss.
create or replace function public.get_streak(p_date text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_start constant date := date '2026-09-23';
  v_day date; v_current int := 0; v_best int := 0; v_run int := 0; v_recent text[] := '{}'; r record;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  v_day := p_date::date;
  -- Graded picks newest first: the current streak is the leading run of wins
  -- (a push or an ungraded day is skipped, never a break).
  for r in
    select (public.streak_pick_day(d.game_date)->>'result') as result
    from public.streak_picks d where d.game_date <= v_day and d.game_date >= v_start order by d.game_date desc
  loop
    if r.result = 'won' then v_current := v_current + 1;
    elsif r.result = 'lost' then exit;
    end if;
  end loop;
  for r in
    select (public.streak_pick_day(d.game_date)->>'result') as result
    from public.streak_picks d where d.game_date <= v_day and d.game_date >= v_start order by d.game_date asc
  loop
    if r.result = 'won' then v_run := v_run + 1; v_best := greatest(v_best, v_run);
    elsif r.result = 'lost' then v_run := 0;
    end if;
    if r.result in ('won', 'lost') then
      v_recent := (v_recent || case when r.result = 'won' then 'W' else 'L' end)[greatest(1, cardinality(v_recent) - 3):];
    end if;
  end loop;
  return jsonb_build_object(
    'current', v_current, 'best', v_best, 'recent', to_jsonb(v_recent),
    'today', case when v_day >= v_start then public.streak_pick_day(v_day) end,
    'yesterday', case when v_day - 1 >= v_start then public.streak_pick_day(v_day - 1) end);
end $$;
revoke all on function public.get_streak(text) from public;
grant execute on function public.get_streak(text) to anon, authenticated, service_role;
