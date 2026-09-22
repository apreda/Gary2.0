-- The streak pick is the day's FREE play (founder, Sep 22 2026), so a locked
-- board must not count it: a non-member was shown "MLB · 1 PLAY · LOCKED"
-- for the very play sitting unlocked above it, and unlocking bought nothing.
-- Counts now exclude it, a league whose only play is the streak pick stops
-- drawing a locked module, and the ticket itself rides along even when the
-- league is locked, so the free pick opens for everyone.

create or replace function public.get_winners_board(p_date text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_historical boolean; v_free bigint;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  if to_char(p_date::date,'YYYY-MM-DD') <> p_date then raise exception 'Invalid date'; end if;
  v_historical := p_date::date < (now() at time zone 'America/New_York')::date;
  select s.candidate_id into v_free from public.streak_picks s where s.game_date = p_date::date;
  return jsonb_build_object(
    'access', public.get_my_access(),
    'free_candidate_id', v_free,
    'boards', coalesce((select jsonb_agg(to_jsonb(b)) from (
      select w.league,w.kind,count(*) filter (where w.candidate_id is distinct from v_free)::bigint as count,
        not (v_historical or gary_private.has_winners_access(w.league)) as locked
      from public.winners_board w where w.game_date=p_date group by w.league,w.kind
      having count(*) filter (where w.candidate_id is distinct from v_free) > 0
      order by w.league,w.kind) b),'[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(to_jsonb(w) order by w.admitted_at,w.candidate_id)
      from public.winners_board w where w.game_date=p_date
      and (v_historical or w.candidate_id = v_free or gary_private.has_winners_access(w.league))),'[]'::jsonb));
end $$;
revoke all on function public.get_winners_board(text) from public;
grant execute on function public.get_winners_board(text) to anon, authenticated, service_role;
