-- The Winners board and each ticket's settled result must arrive in one read.
-- A separate prop_results request can fail while the board itself succeeds;
-- when that happened, a completed prop could fall back to an old live frame.
-- Keep the existing access gate and include only each visible ticket's grade.
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
    'tickets', coalesce((select jsonb_agg((to_jsonb(w) || jsonb_build_object(
        'reasons', r.reasons,
        'result', gary_private.lab_ticket_result(w.kind,w.league,w.game_date,w.game_id,c.pick_text,w.pick_snapshot)))
        order by w.admitted_at,w.candidate_id)
      from public.winners_board w
      join public.winners_candidates c on c.id = w.candidate_id
      left join public.winners_reasons r on r.candidate_id = w.candidate_id
      where w.game_date=p_date
      and (v_historical or w.candidate_id = v_free or gary_private.has_winners_access(w.league))),'[]'::jsonb));
end $$;
revoke all on function public.get_winners_board(text) from public;
grant execute on function public.get_winners_board(text) to anon, authenticated, service_role;
