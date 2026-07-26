-- THE STREAK (Jul 26 2026, founder green-light).
--
-- One play a day: a user designates ONE tail-or-fade per ET day as their
-- streak play. Win extends, loss resets, push/void holds, a missed day holds
-- (only a loss breaks a streak). user_streaks is written ONLY by the settle
-- path (service role) — like everything in Your Book, the number is
-- unfakeable because the client never computes it. prev_current makes a
-- re-graded day reversible (the grader's re-grade-every-run doctrine).

alter table public.user_bets add column if not exists streak_pick boolean not null default false;

create unique index if not exists user_bets_one_streak_per_day
  on public.user_bets (user_id, game_date)
  where streak_pick;

create table if not exists public.user_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current int not null default 0,
  best int not null default 0,
  prev_current int not null default 0,
  last_counted_date date,
  last_result text,
  updated_at timestamptz not null default now()
);

alter table public.user_streaks enable row level security;
create policy user_streaks_select on public.user_streaks
  for select using (auth.uid() = user_id);
-- no insert/update/delete policies: only the service role writes.

-- Guard trigger: allow the RPC to flip streak_pick pre-lock; block direct
-- user writes to it on tail/fade rows post-lock (covered by the existing
-- update policy's lock check + this function's RPC-flag path).
create or replace function public.user_bets_guard()
returns trigger language plpgsql as $$
begin
  if current_setting('request.jwt.claims', true) is null
     or auth.role() = 'service_role'
     or current_setting('app.user_bets_rpc', true) = '1' then
    return new;  -- graders + the place RPCs are unrestricted
  end if;
  if old.kind = 'manual' and new.kind <> 'manual' then
    raise exception 'manual bets cannot become tail/fade';
  end if;
  if old.kind in ('tail','fade') then
    if new.kind = 'manual' then
      raise exception 'tail/fade bets cannot become manual';
    end if;
    if new.status <> 'pending' then
      raise exception 'tail/fade bets are graded by the system';
    end if;
    if new.odds_american is distinct from old.odds_american
       or new.odds_estimated is distinct from old.odds_estimated then
      raise exception 'odds are server-resolved';
    end if;
  end if;
  if new.user_id <> old.user_id
     or new.placed_at <> old.placed_at
     or new.lock_at is distinct from old.lock_at
     or new.game_date <> old.game_date then
    raise exception 'immutable field';
  end if;
  return new;
end $$;

-- The 5-arg originals are DROPPED, not overloaded: two same-named functions
-- make PostgREST's named-argument resolution ambiguous and every rpc call
-- 500s (the exact register_push_token lesson from the Jul 2 migration).
drop function if exists public.place_user_bet(date, text, text, text, numeric);
drop function if exists public.place_user_prop_bet(date, text, text, text, numeric);

-- place_user_bet: full replace — the verified Jul 26 body + p_streak.
-- Marking a pick as the streak play clears any other streak flag that day
-- (one per day, and the partial unique index enforces it at the DB line).
create or replace function public.place_user_bet(
  p_game_date date, p_pick_id text, p_pick_text text, p_kind text,
  p_stake numeric default 1.0, p_streak boolean default false
) returns public.user_bets
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pick jsonb; v_lock timestamptz; v_odds integer; v_est boolean := false;
  v_home text; v_away text; v_picked_home boolean; v_row public.user_bets;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_kind not in ('tail','fade') then raise exception 'kind must be tail or fade'; end if;
  if p_stake is null or p_stake <= 0 or p_stake > 10 then raise exception 'stake out of range'; end if;

  select p into v_pick
  from public.daily_picks dp, lateral jsonb_array_elements(dp.picks) p
  where dp.date::text = p_game_date::text
    and ((p_pick_id is not null and p_pick_id <> '' and p->>'pick_id' = p_pick_id)
         or p->>'pick' = p_pick_text)
  limit 1;
  if v_pick is null then raise exception 'pick not found'; end if;

  v_lock := nullif(v_pick->>'commence_time','')::timestamptz;
  if v_lock is null then raise exception 'lock time unavailable'; end if;
  if now() >= v_lock then raise exception 'game is locked'; end if;

  v_home := v_pick->>'homeTeam'; v_away := v_pick->>'awayTeam';
  if p_kind = 'tail' then
    v_odds := nullif(regexp_replace(coalesce(v_pick->>'odds',''), '[^0-9+-]', '', 'g'),'')::integer;
    if v_odds is null then v_est := true; end if;
  else
    v_picked_home := v_home is not null
      and position(lower(v_home) in lower(coalesce(v_pick->>'pick',''))) > 0;
    if coalesce(v_pick->>'pick','') ilike '%ML%'
       and nullif(v_pick->>'moneylineHome','') is not null
       and nullif(v_pick->>'moneylineAway','') is not null then
      v_odds := round(case when v_picked_home
        then (v_pick->>'moneylineAway')::numeric
        else (v_pick->>'moneylineHome')::numeric end)::integer;
    else
      v_odds := null; v_est := true;
    end if;
  end if;

  -- Mark this transaction as the trusted place-RPC so the guard trigger
  -- permits the side-switch upsert (SECURITY DEFINER keeps the caller's JWT).
  perform set_config('app.user_bets_rpc', '1', true);

  -- One streak play per day: claiming it here releases any other pre-lock
  -- claim the user holds for the date. (A locked streak play stays locked —
  -- the update below refuses via the lock check, and the insert then fails
  -- on the partial unique index, surfacing "streak play already locked".)
  if p_streak then
    begin
      update public.user_bets
        set streak_pick = false
        where user_id = v_uid and game_date = p_game_date and streak_pick
          and (lock_at is null or now() < lock_at)
          and pick_text <> coalesce(v_pick->>'pick', p_pick_text);
    end;
  end if;

  insert into public.user_bets
    (user_id, kind, pick_type, game_date, league, pick_text, matchup,
     odds_american, odds_estimated, stake_units, lock_at, gary_confidence, streak_pick)
  values
    (v_uid, p_kind, 'game', p_game_date, v_pick->>'league',
     coalesce(v_pick->>'pick', p_pick_text),
     coalesce(v_away,'') || ' @ ' || coalesce(v_home,''),
     v_odds, v_est, p_stake, v_lock,
     nullif(v_pick->>'confidence','')::numeric, coalesce(p_streak, false))
  on conflict (user_id, game_date, pick_type, pick_text)
    where kind in ('tail','fade')
  do update set kind = excluded.kind, stake_units = excluded.stake_units,
    odds_american = excluded.odds_american, odds_estimated = excluded.odds_estimated,
    streak_pick = excluded.streak_pick
  returning * into v_row;
  return v_row;
end $$;

-- place_user_prop_bet: full replace — verified Jul 26 body + p_streak.
create or replace function public.place_user_prop_bet(
  p_game_date date, p_player text, p_prop_type text, p_kind text,
  p_stake numeric default 1.0, p_streak boolean default false
) returns public.user_bets
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pick jsonb; v_lock timestamptz; v_odds integer; v_est boolean := false;
  v_text text; v_row public.user_bets;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_kind not in ('tail','fade') then raise exception 'kind must be tail or fade'; end if;
  if p_stake is null or p_stake <= 0 or p_stake > 10 then raise exception 'stake out of range'; end if;

  select p into v_pick
  from public.prop_picks pp, lateral jsonb_array_elements(pp.picks) p
  where pp.date::text = p_game_date::text
    and lower(coalesce(p->>'player', p->>'player_name','')) = lower(p_player)
    and lower(split_part(coalesce(p->>'prop', p->>'prop_type',''), ' ', 1)) = lower(p_prop_type)
  limit 1;
  if v_pick is null then raise exception 'pick not found'; end if;

  select ds.commence_time into v_lock
  from public.daily_slate ds
  where ds.date::text = p_game_date::text
    and ds.bdl_game_id = nullif(v_pick->>'game_id','')::bigint
  limit 1;
  if v_lock is null then raise exception 'lock time unavailable'; end if;
  if now() >= v_lock then raise exception 'game is locked'; end if;

  if p_kind = 'tail' then
    v_odds := nullif(regexp_replace(coalesce(v_pick->>'odds',''), '[^0-9+-]', '', 'g'),'')::integer;
    if v_odds is null then v_est := true; end if;
  else
    v_odds := null; v_est := true;
  end if;

  v_text := coalesce(p_player,'') || ' ' || coalesce(v_pick->>'bet','over') || ' '
    || coalesce(v_pick->>'line','') || ' ' || p_prop_type;

  perform set_config('app.user_bets_rpc', '1', true);

  if p_streak then
    update public.user_bets
      set streak_pick = false
      where user_id = v_uid and game_date = p_game_date and streak_pick
        and (lock_at is null or now() < lock_at)
        and pick_text <> v_text;
  end if;

  insert into public.user_bets
    (user_id, kind, pick_type, game_date, league, pick_text, matchup,
     player_name, prop_type, odds_american, odds_estimated, stake_units, lock_at, streak_pick)
  values
    (v_uid, p_kind, 'prop', p_game_date,
     upper(coalesce(v_pick->>'sport','MLB')), v_text, v_pick->>'matchup',
     p_player, p_prop_type, v_odds, v_est, p_stake, v_lock, coalesce(p_streak, false))
  on conflict (user_id, game_date, pick_type, pick_text)
    where kind in ('tail','fade')
  do update set kind = excluded.kind, stake_units = excluded.stake_units,
    odds_american = excluded.odds_american, odds_estimated = excluded.odds_estimated,
    streak_pick = excluded.streak_pick
  returning * into v_row;
  return v_row;
end $$;

grant execute on function public.place_user_bet(date, text, text, text, numeric, boolean) to authenticated;
grant execute on function public.place_user_prop_bet(date, text, text, text, numeric, boolean) to authenticated;
