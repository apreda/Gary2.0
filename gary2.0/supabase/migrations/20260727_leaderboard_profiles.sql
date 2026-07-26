-- Leaderboard (Jul 26 2026, founder green-light).
--
-- Standings computed from ledgers nobody can fake: rankings read ONLY the
-- verified WITH-GARY ledger (system-graded tail/fade rows) + the
-- server-written streak bests. Self-graded YOUR PLAYS never rank — that
-- line is the product's honesty and the review story. Opt-in by handle:
-- nobody appears without claiming a display name. Units only, never dollars.

create table if not exists public.public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text unique not null
    check (char_length(display_name) between 3 and 18
           and display_name ~ '^[A-Za-z0-9_]+$'),
  created_at timestamptz not null default now()
);

alter table public.public_profiles enable row level security;
create policy public_profiles_own on public.public_profiles
  for select using (auth.uid() = user_id);
-- Writes go through claim_handle only; the board RPC exposes names in
-- aggregate — there is deliberately NO public row-level select.

-- Handle claim/rename. SECURITY DEFINER upsert-own with a hygiene blocklist.
create or replace function public.claim_handle(p_name text)
returns public.public_profiles
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_row public.public_profiles;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if char_length(v_name) < 3 or char_length(v_name) > 18
     or v_name !~ '^[A-Za-z0-9_]+$' then
    raise exception 'handles are 3-18 letters, numbers, or underscores';
  end if;
  if lower(v_name) ~ '(gary|admin|official|mod)' then
    raise exception 'that handle is reserved';
  end if;
  insert into public.public_profiles (user_id, display_name)
  values (v_uid, v_name)
  on conflict (user_id) do update set display_name = excluded.display_name
  returning * into v_row;
  return v_row;
exception when unique_violation then
  raise exception 'that handle is taken';
end $$;

grant execute on function public.claim_handle(text) to authenticated;
revoke execute on function public.claim_handle(text) from anon;

-- The standings. Aggregate-only over opted-in users' VERIFIED ledgers:
-- tail/fade rows, system-graded, inside the window. 5 decided bets to
-- appear (kills one-lucky-bet boards). Units at stake-weighted settle
-- values — the same numbers the Billfold shows.
create or replace function public.your_book_leaderboard(p_window text default '30d')
returns table(
  display_name text, wins bigint, losses bigint, pushes bigint,
  units numeric, best_streak int
)
language sql security definer set search_path = public as $$
  with window_start as (
    select case lower(coalesce(p_window, '30d'))
      when '7d' then (now() at time zone 'America/New_York')::date - 7
      when 'season' then date '2026-03-01'
      else (now() at time zone 'America/New_York')::date - 30
    end as d
  )
  select
    pp.display_name,
    count(*) filter (where ub.status = 'won')  as wins,
    count(*) filter (where ub.status = 'lost') as losses,
    count(*) filter (where ub.status = 'push') as pushes,
    coalesce(sum(ub.units_net), 0)::numeric(10,2) as units,
    coalesce(max(us.best), 0) as best_streak
  from public.public_profiles pp
  join public.user_bets ub
    on ub.user_id = pp.user_id
   and ub.kind in ('tail','fade')
   and ub.graded_by = 'system'
   and ub.status in ('won','lost','push')
   and ub.game_date >= (select d from window_start)
  left join public.user_streaks us on us.user_id = pp.user_id
  group by pp.user_id, pp.display_name
  having count(*) filter (where ub.status in ('won','lost')) >= 5
  order by units desc
  limit 50
$$;

grant execute on function public.your_book_leaderboard(text) to authenticated, anon;
