-- WINNERS SEATS AS SOON AS A PICK POSTS (Oct 25 2026, founder: "as soon as they post and it's a winners qualifying pick
-- it should be in winners"). The late-news check no longer scratches anything (a published pick is final, Oct 23), so
-- waiting for it, and for the 75-minute (NBA 28-minute) window, held picks back for nothing. A big game goes on when its
-- pick posts (and Gary's amount is in); a board bet when the board names it. The floors stay: nothing seats inside 20
-- minutes of a kickoff (10 of an NBA tip). The late-news check still runs and records what changed for the data check.

CREATE OR REPLACE FUNCTION gary_private.admit_winners_candidate(p_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.winners_candidates; grade text; play boolean:=false; big boolean:=false; forced boolean:=false; ok boolean:=false;
        why text; stake numeric; seat jsonb; policy text; label text;
begin
 select * into c from public.winners_candidates where id=p_id for update;
 if not found then return 'missing'; end if;
 if c.admitted_at is not null then return 'already'; end if;
 if c.kind='prop' then return 'props_selection'; end if;   -- props: public.finish_winners_props
 if c.commence_time is null or c.commence_time<=clock_timestamp() then return 'kickoff'; end if;
 -- Late news (Oct 13 2026): a pick Gary scratched after the news never goes on Winners, by any route.
 if exists(select 1 from public.winners_late_news l where l.candidate_id=p_id and l.decision='scratch') then return 'late_news_scratched'; end if;
 grade:=c.review->>'assessment';
 -- BIG GAMES ONLY (Oct 23 2026): a big game goes on in every league (TNF/SNF/MNF, college's top two, the NBA's
 -- national-TV games, MLB playoff games). The boards and the card no longer seat (scripts/run-winners-board.js).
 big:=exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id);
 select e.detail into seat from public.winners_decision_events e where e.candidate_id=p_id and e.event='card_seated' order by e.occurred_at desc limit 1;
 if not big and seat is null then return 'not_seated'; end if;          -- only his book (or board) seats an ordinary game pick
 -- A big game goes on when its pick posts (Oct 25 2026; the late-news check only records).
 if c.policy_version='mlb-conviction-v4' and coalesce(c.pick_snapshot->>'price_endorsement','')<>'endorse' then
  why:='declined_price';
 else
  play:=coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false)
    and jsonb_typeof(c.pick_snapshot->'gary_bet'->'stake_dollars')='number'
    and (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric>=100;
  stake:=case when play then (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric else 0 end;
  forced:=coalesce((c.pick_snapshot->'gary_bet'->>'forced')::boolean,false);
  ok:=play;   -- on at Gary's number; a pass takes the number ask
  why:=case when ok then 'admitted' else 'needs_gary_number' end;
 end if;
 if not ok then
  if why='needs_gary_number' then
   if not exists(select 1 from public.winners_decision_events e where e.candidate_id=p_id and e.event='needs_gary_number') then
    insert into public.winners_decision_events(candidate_id,event,detail) values(p_id,'needs_gary_number',jsonb_build_object('assessment',grade,'big_game',big,'card',seat));
   end if;
   return why;
  end if;
  insert into public.winners_decision_events(candidate_id,event,detail)
   values(p_id,'not_admitted',jsonb_build_object('why',why,'assessment',grade,'play',play,'big_game',big,'stake_dollars',stake));
  return why;
 end if;
 policy:=case when big then 'winners-big-game-v1' when coalesce((seat->>'board')::boolean,false) then case when c.league='NBA' then 'winners-nba-board-v1' when c.league='NCAAF' then 'winners-ncaaf-board-v1' else 'winners-nfl-board-v1' end else 'winners-card-v1' end;
 label:=case when big then 'Big game'
             when coalesce((seat->>'opening_night')::boolean,false) then 'NBA opening night'
             when coalesce((seat->>'board')::boolean,false) then format('Gary''s board: #%s of the %s games he bet', seat->>'rank', seat->>'of')
             else format('Gary''s book: #%s of %s on his card', seat->>'rank', seat->>'of') end;
 insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
  values(c.id,c.game_date,c.league,c.kind,c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),policy,
   case when forced then format('%s, Gary''s number: $%s', label, trunc(stake))
        else format('%s; Gary plays it, $%s', label, trunc(stake)) end
   );
 update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
 insert into public.winners_decision_events(candidate_id,event,detail)
  values(c.id,'admitted',jsonb_build_object('gate',case when big then 'big_game' when coalesce((seat->>'board')::boolean,false) then 'nfl_board' else 'card' end,'assessment',grade,'card',seat,
         'stake_dollars',stake,'forced',forced,'policy_version',policy));
 return 'admitted';
end $function$;

CREATE OR REPLACE FUNCTION public.seat_nfl_board(p_date text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r record; n integer := 0; why text; n_on integer; cap constant integer := 2;
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
    if r.commence_time is null or r.commence_time <= clock_timestamp() + interval '20 minutes' then continue; end if;
    insert into public.winners_decision_events(candidate_id, event, detail)
    values (r.id, 'card_seated', jsonb_build_object('board', true, 'rank', r.rank, 'of', r.bets, 'games', r.games, 'why', r.board_why));
    why := gary_private.admit_winners_candidate(r.id);
    if why = 'admitted' then n := n + 1; end if;
  end loop;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.seat_ncaaf_board(p_date text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r record; n integer := 0; why text; n_on integer; cap constant integer := 3;
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

CREATE OR REPLACE FUNCTION public.seat_nba_board(p_date text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r record; n integer := 0; why text; n_on integer; cap constant integer := 2;
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
