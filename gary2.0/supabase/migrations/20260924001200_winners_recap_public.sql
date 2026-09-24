-- THE WINNERS RECAP ON DARTS (founder GO, Sep 24 2026: "The winners recap
-- should show the true transparency of what happened the day before").
-- A finished day's Winners in full, open to everyone (a past day's board is
-- already open on the Winners page): every ticket with its stake and what
-- it made or lost, the bankroll after it, and the next day's board as a
-- count, sealed for a fan without access.

create or replace function public.get_winners_recap(p_date text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_day date; v_next text;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' or to_char(p_date::date, 'YYYY-MM-DD') <> p_date then
    raise exception 'Invalid date';
  end if;
  v_day := p_date::date;
  if v_day >= (now() at time zone 'America/New_York')::date then raise exception 'Only a finished day'; end if;
  v_next := to_char(v_day + 1, 'YYYY-MM-DD');
  return public.winners_recap(v_day) || jsonb_build_object(
    'date', p_date,
    'next', jsonb_build_object(
      'date', v_next,
      'count', (select count(*) from public.winners_board w where w.game_date = v_next),
      'locked', exists (select 1 from public.winners_board w
                        where w.game_date = v_next and not gary_private.has_winners_access(w.league))));
end $$;
revoke all on function public.get_winners_recap(text) from public;
grant execute on function public.get_winners_recap(text) to anon, authenticated, service_role;
