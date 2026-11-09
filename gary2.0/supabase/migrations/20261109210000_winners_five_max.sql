-- NOT YET APPLIED as of Nov 9 2026: the apply to the live database was blocked and waits for Adam's OK. Remove this
-- line once it has run. The college cap already holds without it (the college board no longer runs).
-- WINNERS: THE WATCHED GAMES ARE THE BOARD, FIVE GAME PLAYS A DAY AT MOST (founder, Nov 9 2026: "it has to be with a
-- fan and gamblers mindset"; "i just really hate when the winners picks are games i could really care less about";
-- "i want 5 max"). By how a play got on the board since Sep 16, outside college, the watched games (prime time, the
-- best game of a Sunday window, national TV) are 22-16 and the extra games Gary adds himself are 61-60. College lost
-- both ways (5-12 and 15-26).
--   * College: the day's watched games only (two ranked, up to three on the broadcast networks): five at most. His
--     own college board seats nothing new; a play it had already seated still goes on when its number arrives.
--   * NFL and NBA: his two extras a day stay, and no league's game plays pass five in a day.
--   * A watched game he passed on still waits for his own number (set_big_game_stake); no amount is set for him.
--   * gary_private.winners_watched_vs_extras: the two records side by side, by league, before and from this change.

CREATE OR REPLACE FUNCTION public.seat_ncaaf_board(p_date text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r record; n integer := 0; why text; n_on integer; cap constant integer := 0;   -- Nov 9 2026: the watched games only
 plan jsonb; cohort integer; n_early integer; n_middle integer;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  plan := public.winners_props_plan(p_date, 'NCAAF');
  for r in
    select c.id, c.commence_time, b.rank, b.bets, b.games, b.why as board_why
    from public.winners_candidates c
    join public.winners_ncaaf_board b on b.game_id = c.game_id and b.decision = 'bet' and c.pick_text like b.side || ' %'
    where c.game_date = p_date and c.league = 'NCAAF' and c.kind = 'game' and c.admitted_at is null
      and not exists (select 1 from public.winners_big_games g where g.game_date = c.game_date and g.league = c.league and g.game_id = c.game_id)
    order by b.rank
  loop
    if exists (select 1 from public.winners_decision_events e where e.candidate_id = r.id and e.event = 'card_seated') then
      why := gary_private.admit_winners_candidate(r.id);   -- a seated pass whose number arrived
      if why = 'admitted' then n := n + 1; end if;
      continue;
    end if;
    if r.rank is null or r.rank > cap then continue; end if;
    select count(*) into n_on from public.winners_board w
    where w.game_date = p_date and w.league = 'NCAAF' and w.kind = 'game' and w.scratched_at is null and w.policy_version = 'winners-ncaaf-board-v1';
    if n_on >= cap then continue; end if;
    cohort := coalesce((select (v->>'cohort')::integer from jsonb_array_elements(plan) v where (v->>'start')::timestamptz = r.commence_time limit 1), 3);
    select count(*) filter (where k = 1), count(*) filter (where k <= 2) into n_early, n_middle from (
      select coalesce((select (v->>'cohort')::integer from jsonb_array_elements(plan) v where (v->>'start')::timestamptz = c.commence_time limit 1), 3) k
      from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
      where w.game_date = p_date and w.league = 'NCAAF' and w.kind = 'game' and w.scratched_at is null and w.policy_version = 'winners-ncaaf-board-v1') seated;
    if (cohort = 1 and n_early >= 1) or (cohort <= 2 and n_middle >= 2) then continue; end if;
    if r.commence_time is null or r.commence_time <= clock_timestamp() + interval '20 minutes' then continue; end if;
    insert into public.winners_decision_events(candidate_id, event, detail)
    values (r.id, 'card_seated', jsonb_build_object('board', true, 'league', 'NCAAF', 'rank', r.rank, 'of', r.bets, 'games', r.games, 'why', r.board_why));
    why := gary_private.admit_winners_candidate(r.id);
    if why = 'admitted' then n := n + 1; end if;
  end loop;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.seat_nfl_board(p_date text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r record; n integer := 0; why text; n_on integer; cap constant integer := 2;
 day_cap constant integer := 5; n_day integer;   -- Nov 9 2026: five game plays a day at most
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  for r in
    select c.id, c.commence_time, b.rank, b.bets, b.games, b.why as board_why
    from public.winners_candidates c
    join public.winners_nfl_board b on b.game_id = c.game_id and b.decision = 'bet' and c.pick_text like b.side || ' %'
    where c.game_date = p_date and c.league = 'NFL' and c.kind = 'game' and c.admitted_at is null
      and not exists (select 1 from public.winners_big_games g where g.game_date = c.game_date and g.league = c.league and g.game_id = c.game_id)
    order by b.rank
  loop
    if exists (select 1 from public.winners_decision_events e where e.candidate_id = r.id and e.event = 'card_seated') then
      why := gary_private.admit_winners_candidate(r.id);   -- a seated pass whose number arrived
      if why = 'admitted' then n := n + 1; end if;
      continue;
    end if;
    if r.rank is null or r.rank > cap then continue; end if;
    select count(*) into n_on from public.winners_board w
    where w.game_date = p_date and w.league = 'NFL' and w.kind = 'game' and w.scratched_at is null and w.policy_version = 'winners-nfl-board-v1';
    if n_on >= cap then continue; end if;
    select count(*) into n_day from public.winners_board w
    where w.game_date = p_date and w.league = 'NFL' and w.kind = 'game' and w.scratched_at is null;
    if n_day >= day_cap then continue; end if;
    if r.commence_time is null or r.commence_time <= clock_timestamp() + interval '20 minutes' then continue; end if;
    insert into public.winners_decision_events(candidate_id, event, detail)
    values (r.id, 'card_seated', jsonb_build_object('board', true, 'rank', r.rank, 'of', r.bets, 'games', r.games, 'why', r.board_why));
    why := gary_private.admit_winners_candidate(r.id);
    if why = 'admitted' then n := n + 1; end if;
  end loop;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.seat_nba_board(p_date text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r record; n integer := 0; why text; n_on integer; cap constant integer := 2;
 day_cap constant integer := 5; n_day integer;   -- Nov 9 2026: five game plays a day at most
 plan jsonb; cohort integer; n_early integer; n_middle integer;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  plan := public.winners_props_plan(p_date, 'NBA');
  for r in
    select c.id, c.commence_time, b.rank, b.bets, b.games, b.why as board_why
    from public.winners_candidates c
    join public.winners_nba_board b on b.game_id = c.game_id and b.decision = 'bet' and c.pick_text like b.side || ' %'
    where c.game_date = p_date and c.league = 'NBA' and c.kind = 'game' and c.admitted_at is null
      and not exists (select 1 from public.winners_big_games g where g.game_date = c.game_date and g.league = c.league and g.game_id = c.game_id)
    order by b.rank
  loop
    if exists (select 1 from public.winners_decision_events e where e.candidate_id = r.id and e.event = 'card_seated') then
      why := gary_private.admit_winners_candidate(r.id);   -- a seated pass whose number arrived
      if why = 'admitted' then n := n + 1; end if;
      continue;
    end if;
    if r.rank is null or r.rank > cap then continue; end if;
    select count(*) into n_on from public.winners_board w
    where w.game_date = p_date and w.league = 'NBA' and w.kind = 'game' and w.scratched_at is null and w.policy_version = 'winners-nba-board-v1';
    if n_on >= cap then continue; end if;
    select count(*) into n_day from public.winners_board w
    where w.game_date = p_date and w.league = 'NBA' and w.kind = 'game' and w.scratched_at is null;
    if n_day >= day_cap then continue; end if;
    cohort := coalesce((select (v->>'cohort')::integer from jsonb_array_elements(plan) v where (v->>'start')::timestamptz = r.commence_time limit 1), 3);
    select count(*) filter (where k = 1), count(*) filter (where k <= 2) into n_early, n_middle from (
      select coalesce((select (v->>'cohort')::integer from jsonb_array_elements(plan) v where (v->>'start')::timestamptz = c.commence_time limit 1), 3) k
      from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
      where w.game_date = p_date and w.league = 'NBA' and w.kind = 'game' and w.scratched_at is null and w.policy_version = 'winners-nba-board-v1') seated;
    if (cohort = 1 and n_early >= 1) or (cohort <= 2 and n_middle >= 2) then continue; end if;
    if r.commence_time is null or r.commence_time <= clock_timestamp() + interval '10 minutes' then continue; end if;
    insert into public.winners_decision_events(candidate_id, event, detail)
    values (r.id, 'card_seated', jsonb_build_object('board', true, 'league', 'NBA', 'rank', r.rank, 'of', r.bets, 'games', r.games, 'why', r.board_why));
    why := gary_private.admit_winners_candidate(r.id);
    if why = 'admitted' then n := n + 1; end if;
  end loop;
  return n;
end $function$;

create or replace view gary_private.winners_watched_vs_extras as
select b.league,
       case when w.policy_version = 'winners-big-game-v1' then 'watched game' else 'his own extra' end as how_it_got_on,
       case when b.game_date >= '2026-11-10' then 'from Nov 10 2026' else 'before' end as period,
       count(*) filter (where b.result = 'won') as won,
       count(*) filter (where b.result = 'lost') as lost,
       round(100 * sum(case when b.result = 'won' then b.stake_units * (case when b.odds < 0 then 100.0 / abs(b.odds) else b.odds / 100.0 end)
                            when b.result = 'lost' then -b.stake_units else 0 end)) as net_dollars,
       min(b.game_date) as first_day, max(b.game_date) as last_day
from gary_private.bankroll_ledger b
join public.winners_board w on w.candidate_id = b.candidate_id
where b.kind = 'game' and b.result in ('won', 'lost')
group by 1, 2, 3;

revoke all on gary_private.winners_watched_vs_extras from public, anon, authenticated;
grant select on gary_private.winners_watched_vs_extras to service_role;
