-- Your Book addendum (Jul 26 2026, founder green-light round):
-- 1. gary_confidence stored on tail/fade rows at place time — powers the
--    "Gary went LEAN, you put 2u" conviction-vs-Gary read on slips.
-- 2. pick_tail_counts(): public aggregate riders/faders per pick for a date
--    ("3 riding · 1 fading" on the card). Counts only — no user data leaves
--    the table; RLS on user_bets stays owner-only for row reads.

alter table public.user_bets add column if not exists gary_confidence numeric(4,2);

create or replace function public.pick_tail_counts(p_game_date date)
returns table(pick_text text, tails bigint, fades bigint)
language sql security definer set search_path = public as $$
  select ub.pick_text,
         count(*) filter (where ub.kind = 'tail') as tails,
         count(*) filter (where ub.kind = 'fade') as fades
  from public.user_bets ub
  where ub.game_date = p_game_date
    and ub.kind in ('tail','fade')
  group by ub.pick_text
$$;

grant execute on function public.pick_tail_counts(date) to authenticated, anon;

-- place_user_bet learns to store Gary's confidence (full replace; body is the
-- verified Jul 26 version + the one gary_confidence line).
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
     odds_american, odds_estimated, stake_units, lock_at, gary_confidence)
  values
    (v_uid, p_kind, 'game', p_game_date, v_pick->>'league',
     coalesce(v_pick->>'pick', p_pick_text),
     coalesce(v_away,'') || ' @ ' || coalesce(v_home,''),
     v_odds, v_est, p_stake, v_lock,
     nullif(v_pick->>'confidence','')::numeric)
  on conflict (user_id, game_date, pick_type, pick_text)
    where kind in ('tail','fade')
  do update set kind = excluded.kind, stake_units = excluded.stake_units,
    odds_american = excluded.odds_american, odds_estimated = excluded.odds_estimated
  returning * into v_row;
  return v_row;
end $$;
