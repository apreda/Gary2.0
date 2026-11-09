-- WINNERS: THE ONLY GAME ON IS LOCKED, THE REST IS GARY'S BEST FROM GAMES PEOPLE CARE ABOUT (founder, Nov 9 2026,
-- later the same day as 20261109210000: "it needs to be a mix of relevant games and the biggest game but really only
-- if there arent other games in that window and then dropping games nobody cares about either team"; "i want 5 max").
-- The Sunday afternoon windows and college's Saturday games are no longer locked, so his boards seat more: college
-- his top five (spread over the day), the NFL his top four, the NBA two as before. No league passes five game plays
-- a day. Which games a board may show him is decided in the worker (src/services/winners/powerRatings.js and
-- ncaafBoard.js).

CREATE OR REPLACE FUNCTION public.seat_ncaaf_board(p_date text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r record; n integer := 0; why text; n_on integer; cap constant integer := 5;
 day_cap constant integer := 5; n_day integer;   -- five game plays a day at most
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
    select count(*) into n_day from public.winners_board w
    where w.game_date = p_date and w.league = 'NCAAF' and w.kind = 'game' and w.scratched_at is null;
    if n_day >= day_cap then continue; end if;
    cohort := coalesce((select (v->>'cohort')::integer from jsonb_array_elements(plan) v where (v->>'start')::timestamptz = r.commence_time limit 1), 3);
    select count(*) filter (where k = 1), count(*) filter (where k <= 2) into n_early, n_middle from (
      select coalesce((select (v->>'cohort')::integer from jsonb_array_elements(plan) v where (v->>'start')::timestamptz = c.commence_time limit 1), 3) k
      from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
      where w.game_date = p_date and w.league = 'NCAAF' and w.kind = 'game' and w.scratched_at is null and w.policy_version = 'winners-ncaaf-board-v1') seated;
    -- spread over the day: two from the early kickoffs at most, four through the middle ones
    if (cohort = 1 and n_early >= 2) or (cohort <= 2 and n_middle >= 4) then continue; end if;
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
declare r record; n integer := 0; why text; n_on integer; cap constant integer := 4;
 day_cap constant integer := 5; n_day integer;   -- five game plays a day at most
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
