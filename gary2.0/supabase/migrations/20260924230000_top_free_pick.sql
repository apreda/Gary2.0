-- TOP FREE PICK OF THE DAY (founder GO, Sep 24 2026). One free pick per sport
-- per day on the Picks page (MLB on Today, NFL on the week page): that sport's
-- biggest-stake Winners ticket, ties to the earliest start, then the earliest
-- admission. It is chosen only once enough of the day's board is in (at
-- least four tickets, or one per game on a smaller slate), or an hour before
-- the sport's last game if the board never gets there, and it is locked: the
-- pick users saw never changes. Before that the card reads "lands soon"; a
-- sport with no games today names its next game day.

create table if not exists public.top_free_picks (
  game_date text not null,
  league text not null,
  candidate_id bigint not null,
  kind text not null,
  pick_snapshot jsonb not null,
  stake_units numeric,
  commence_time timestamptz,
  chosen_at timestamptz not null default now(),
  primary key (game_date, league)
);
alter table public.top_free_picks enable row level security;
revoke all on public.top_free_picks from anon, authenticated;
grant all on public.top_free_picks to service_role;

create or replace function public.get_top_free_pick(p_date text, p_league text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  lg text := upper(coalesce(p_league, ''));
  chosen public.top_free_picks;
  games integer;
  last_start timestamptz;
  tickets integer;
  next_date date;
  need integer;
begin
  if lg not in ('MLB', 'NFL') or p_date !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select * into chosen from public.top_free_picks where game_date = p_date and league = lg;
  if found then
    return jsonb_build_object('status', 'pick', 'league', lg, 'kind', chosen.kind,
      'pick', chosen.pick_snapshot, 'stake_units', chosen.stake_units, 'commence_time', chosen.commence_time);
  end if;

  select count(*), max(s.commence_time) into games, last_start
    from public.daily_slate s where s.date = p_date::date and upper(s.league) = lg;
  if games = 0 then
    select min(s.date) into next_date from public.daily_slate s
     where s.date > p_date::date and upper(s.league) = lg;
    return jsonb_build_object('status', 'no_games', 'league', lg, 'next_game_date', next_date);
  end if;

  select count(*) into tickets from public.winners_board b
   where b.game_date = p_date and upper(b.league) = lg and b.scratched_at is null;
  need := least(4, games);
  if tickets = 0 or (tickets < need and clock_timestamp() < last_start - interval '60 minutes') then
    return jsonb_build_object('status', 'pending', 'league', lg);
  end if;

  insert into public.top_free_picks (game_date, league, candidate_id, kind, pick_snapshot, stake_units, commence_time)
  select b.game_date, lg, b.candidate_id, b.kind, b.pick_snapshot, b.stake_units,
         (b.pick_snapshot->>'commence_time')::timestamptz
    from public.winners_board b
   where b.game_date = p_date and upper(b.league) = lg and b.scratched_at is null
   order by b.stake_units desc nulls last, (b.pick_snapshot->>'commence_time')::timestamptz asc nulls last, b.admitted_at asc
   limit 1
  on conflict (game_date, league) do nothing;

  select * into chosen from public.top_free_picks where game_date = p_date and league = lg;
  return jsonb_build_object('status', 'pick', 'league', lg, 'kind', chosen.kind,
    'pick', chosen.pick_snapshot, 'stake_units', chosen.stake_units, 'commence_time', chosen.commence_time);
end;
$$;

revoke all on function public.get_top_free_pick(text, text) from public;
grant execute on function public.get_top_free_pick(text, text) to anon, authenticated, service_role;
