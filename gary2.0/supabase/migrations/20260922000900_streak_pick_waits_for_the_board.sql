-- THE FREE PICK WAITS FOR THE BOARD (founder GO, Sep 22 2026).
--
-- The picker fired when the day's first game was an hour out and took the
-- biggest stake on the board at that moment. On Sep 22 that was 11 AM with
-- exactly one play admitted, so the free pick was chosen from a sample of one;
-- by evening the board had three. Gary never revisits a decision, so the fix
-- is only in when we look: hold until just before the earliest still-unstarted
-- play seals, then choose from everything admitted by then.
--
-- A play whose game has already started is never eligible: a free pick handed
-- out after first pitch is not a pick anyone can take. If every play has
-- started, the day simply has no streak pick, which the streak already treats
-- as a skipped day rather than a break.

create or replace function public.select_streak_pick(p_date text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_seal timestamptz; r record;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  if exists (select 1 from public.streak_picks where game_date = p_date::date) then return false; end if;
  -- The last moment a still-unstarted play can be chosen and still be takeable.
  select min(c.commence_time) into v_seal
  from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
  where w.game_date = p_date and c.commence_time > now();
  if v_seal is null then return false; end if;
  -- Too early: let the rest of the day's card arrive. The cron returns in ten minutes.
  if v_seal > now() + interval '15 minutes' then return false; end if;
  select w.candidate_id, w.league, w.kind, c.pick_text, c.odds, c.game_id, c.commence_time, w.stake_units,
         coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')) as matchup,
         c.pick_snapshot->>'player' as player, c.pick_snapshot->>'prop' as prop, c.pick_snapshot->>'bet' as bet
    into r
  from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
  where w.game_date = p_date and c.commence_time > now()
  order by coalesce(w.stake_units, 0) desc, (w.kind = 'game') desc, w.admitted_at asc
  limit 1;
  if r is null then return false; end if;
  insert into public.streak_picks (game_date, candidate_id, league, kind, pick_text, odds, matchup, game_id, commence_time, stake_units, player, prop, bet)
  values (p_date::date, r.candidate_id, r.league, r.kind, r.pick_text, r.odds, r.matchup, r.game_id, r.commence_time, r.stake_units, r.player, r.prop, r.bet)
  on conflict do nothing;
  return found;
end $$;
