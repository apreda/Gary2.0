-- TOP FREE PICK locks when the qualifying ticket lands (Sep 24 2026), not on
-- the first page read after it: the same rule, moved into one chooser that
-- the admission trigger and the page read both call. The trigger never
-- blocks a Winners ticket; any failure is swallowed and the read retries.

create or replace function public.top_free_pick_choose(p_date text, p_league text)
returns void language plpgsql security definer set search_path = '' as $$
declare lg text := upper(coalesce(p_league, '')); games integer; last_start timestamptz; tickets integer;
begin
  if lg not in ('MLB', 'NFL') then return; end if;
  if exists (select 1 from public.top_free_picks where game_date = p_date and league = lg) then return; end if;
  select count(*), max(s.commence_time) into games, last_start
    from public.daily_slate s where s.date = p_date::date and upper(s.league) = lg;
  if games = 0 then return; end if;
  select count(*) into tickets from public.winners_board b
   where b.game_date = p_date and upper(b.league) = lg and b.scratched_at is null;
  if tickets = 0 or (tickets < least(4, games) and clock_timestamp() < last_start - interval '60 minutes') then return; end if;
  insert into public.top_free_picks (game_date, league, candidate_id, kind, pick_snapshot, stake_units, commence_time)
  select b.game_date, lg, b.candidate_id, b.kind, b.pick_snapshot, b.stake_units, (b.pick_snapshot->>'commence_time')::timestamptz
    from public.winners_board b
   where b.game_date = p_date and upper(b.league) = lg and b.scratched_at is null
   order by b.stake_units desc nulls last, (b.pick_snapshot->>'commence_time')::timestamptz asc nulls last, b.admitted_at asc
   limit 1
  on conflict (game_date, league) do nothing;
end;
$$;
revoke all on function public.top_free_pick_choose(text, text) from public, anon, authenticated;

create or replace function public.get_top_free_pick(p_date text, p_league text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare lg text := upper(coalesce(p_league, '')); chosen public.top_free_picks; games integer; next_date date;
begin
  if lg not in ('MLB', 'NFL') or p_date !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('status', 'unavailable');
  end if;
  perform public.top_free_pick_choose(p_date, lg);
  select * into chosen from public.top_free_picks where game_date = p_date and league = lg;
  if found then
    return jsonb_build_object('status', 'pick', 'league', lg, 'kind', chosen.kind, 'candidate_id', chosen.candidate_id,
      'pick', chosen.pick_snapshot, 'stake_units', chosen.stake_units, 'commence_time', chosen.commence_time);
  end if;
  select count(*) into games from public.daily_slate s where s.date = p_date::date and upper(s.league) = lg;
  if games = 0 then
    select min(s.date) into next_date from public.daily_slate s where s.date > p_date::date and upper(s.league) = lg;
    return jsonb_build_object('status', 'no_games', 'league', lg, 'next_game_date', next_date);
  end if;
  return jsonb_build_object('status', 'pending', 'league', lg);
end;
$$;
revoke all on function public.get_top_free_pick(text, text) from public;
grant execute on function public.get_top_free_pick(text, text) to anon, authenticated, service_role;

create or replace function public.top_free_pick_on_admission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public.top_free_pick_choose(new.game_date, new.league);
  exception when others then
    null;
  end;
  return null;
end;
$$;
drop trigger if exists top_free_pick_on_admission on public.winners_board;
create trigger top_free_pick_on_admission after insert on public.winners_board
for each row execute function public.top_free_pick_on_admission();
