-- Tail/Fade + Your Book (Jul 26 2026).
--
-- One table for all three entry points: a TAIL, a FADE, and a manually
-- LOGGED outside bet are the same row with a different kind. Tail/fade rows
-- are the product's credibility: they insert ONLY through the SECURITY
-- DEFINER RPCs below, which resolve the pick server-side (odds, lock time
-- from the pick JSON's commence_time) and refuse any write at/after lock —
-- you cannot retro-tail a winner, and placed_at is always the server clock.
-- Manual rows are the user's own self-graded ledger (honest, labeled,
-- never mixed into the verified WITH-GARY record).

create table public.user_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('tail','fade','manual')),
  pick_type text check (pick_type in ('game','prop')),
  game_date date not null,
  league text,
  pick_text text not null,
  matchup text,
  player_name text,
  prop_type text,
  description text,
  odds_american integer,
  odds_estimated boolean not null default false,
  stake_units numeric(6,2) not null default 1.0
    check (stake_units > 0 and stake_units <= 10),
  status text not null default 'pending'
    check (status in ('pending','won','lost','push','void')),
  units_net numeric(8,2),
  lock_at timestamptz,
  placed_at timestamptz not null default now(),
  graded_at timestamptz,
  graded_by text check (graded_by in ('system','user'))
);

comment on table public.user_bets is
  'Personal bet ledger: tail/fade rows (system-graded, lock-immutable) + manual self-logged bets.';

-- One live tail-or-fade per user per pick (switching sides = update kind pre-lock).
create unique index user_bets_one_tailfade
  on public.user_bets (user_id, game_date, pick_type, pick_text)
  where kind in ('tail','fade');
create index user_bets_grading on public.user_bets (game_date, pick_type, status);
create index user_bets_owner on public.user_bets (user_id, placed_at desc);

alter table public.user_bets enable row level security;

-- Owner-only reads. Direct INSERT is manual-only (tail/fade must come through
-- the RPCs so lock/odds are server-resolved). UPDATE/DELETE: manual rows are
-- freely editable by their owner; tail/fade rows only before lock.
create policy user_bets_select on public.user_bets
  for select using (auth.uid() = user_id);
create policy user_bets_insert_manual on public.user_bets
  for insert with check (auth.uid() = user_id and kind = 'manual');
create policy user_bets_update on public.user_bets
  for update using (
    auth.uid() = user_id
    and (kind = 'manual' or (lock_at is not null and now() < lock_at))
  ) with check (auth.uid() = user_id);
create policy user_bets_delete on public.user_bets
  for delete using (
    auth.uid() = user_id
    and (kind = 'manual' or (lock_at is not null and now() < lock_at))
  );

-- Belt-and-suspenders invariants RLS cannot express (needs OLD row):
-- authenticated users may never move a row across the manual/verified line,
-- never self-grade a tail/fade, never touch server-owned fields.
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
create trigger user_bets_guard before update on public.user_bets
  for each row execute function public.user_bets_guard();

-- ── place a tail/fade on a GAME pick ────────────────────────────────────────
-- Resolves the pick inside daily_picks.picks (jsonb array) by pick_id, falling
-- back to exact pick text. Lock = the pick's commence_time (server clock
-- comparison). Odds: tail = the pick's own price; fade = the OPPOSITE
-- moneyline when this is an ML pick and both prices were captured, else
-- unknown → grades at -110 with odds_estimated = true.
create or replace function public.place_user_bet(
  p_game_date date, p_pick_id text, p_pick_text text, p_kind text,
  p_stake numeric default 1.0
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
  insert into public.user_bets
    (user_id, kind, pick_type, game_date, league, pick_text, matchup,
     odds_american, odds_estimated, stake_units, lock_at)
  values
    (v_uid, p_kind, 'game', p_game_date, v_pick->>'league',
     coalesce(v_pick->>'pick', p_pick_text),
     coalesce(v_away,'') || ' @ ' || coalesce(v_home,''),
     v_odds, v_est, p_stake, v_lock)
  on conflict (user_id, game_date, pick_type, pick_text)
    where kind in ('tail','fade')
  do update set kind = excluded.kind, stake_units = excluded.stake_units,
    odds_american = excluded.odds_american, odds_estimated = excluded.odds_estimated
  returning * into v_row;
  return v_row;
end $$;

-- ── place a tail/fade on a PROP pick ────────────────────────────────────────
-- Resolves inside prop_picks.picks by player + prop first-token (the same
-- identity grade-props uses). Lock time comes from daily_slate via the prop's
-- bdl game_id (doubleheader-safe). Fade odds are unknown for props → est -110.
create or replace function public.place_user_prop_bet(
  p_game_date date, p_player text, p_prop_type text, p_kind text,
  p_stake numeric default 1.0
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

  -- Mark this transaction as the trusted place-RPC so the guard trigger
  -- permits the side-switch upsert (SECURITY DEFINER keeps the caller's JWT).
  perform set_config('app.user_bets_rpc', '1', true);
  insert into public.user_bets
    (user_id, kind, pick_type, game_date, league, pick_text, matchup,
     player_name, prop_type, odds_american, odds_estimated, stake_units, lock_at)
  values
    (v_uid, p_kind, 'prop', p_game_date,
     upper(coalesce(v_pick->>'sport','MLB')), v_text, v_pick->>'matchup',
     p_player, p_prop_type, v_odds, v_est, p_stake, v_lock)
  on conflict (user_id, game_date, pick_type, pick_text)
    where kind in ('tail','fade')
  do update set kind = excluded.kind, stake_units = excluded.stake_units,
    odds_american = excluded.odds_american, odds_estimated = excluded.odds_estimated
  returning * into v_row;
  return v_row;
end $$;

grant execute on function public.place_user_bet(date, text, text, text, numeric) to authenticated;
grant execute on function public.place_user_prop_bet(date, text, text, text, numeric) to authenticated;
revoke execute on function public.place_user_bet(date, text, text, text, numeric) from anon;
revoke execute on function public.place_user_prop_bet(date, text, text, text, numeric) from anon;
