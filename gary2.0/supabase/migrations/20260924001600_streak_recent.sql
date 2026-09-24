-- THE STREAK FORM GUIDE (founder, Sep 24 2026: "for the streak part i want
-- to do" the count and the last five boxes). get_streak also returns
-- `recent`: the last five decided streak picks, oldest first, as 'W' / 'L'.
-- A push or an ungraded day is no box, the same as it is no break.
create or replace function public.get_streak(p_date text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_day date; v_current int := 0; v_best int := 0; v_run int := 0; v_recent text[] := '{}'; r record;
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
    if r.result in ('won', 'lost') then
      v_recent := (v_recent || case when r.result = 'won' then 'W' else 'L' end)[greatest(1, cardinality(v_recent) - 3):];
    end if;
  end loop;
  return jsonb_build_object(
    'current', v_current, 'best', v_best, 'recent', to_jsonb(v_recent),
    'today', public.streak_pick_day(v_day),
    'yesterday', public.streak_pick_day(v_day - 1));
end $$;
revoke all on function public.get_streak(text) from public;
grant execute on function public.get_streak(text) to anon, authenticated, service_role;
