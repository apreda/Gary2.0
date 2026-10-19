-- GARY'S NFL BOARD (Oct 19 2026, the new NFL system; founder: "solve this so he doesnt have to bet every game he only
-- bets the ones he actaully wants to bet"). Gary picks every NFL game for the Picks page. Separately, before the first
-- kickoff of a slate, he looks at the whole board fresh (every game's line and how it moved, the quarterbacks, who's
-- out, how good both teams are, the spot, the news) and names the games he would put his own money on, any number of
-- them or none, in the order he likes them (src/services/winners/nflBoard.js). An NFL pick goes on Winners only when
-- its game is on his board on the same side, at his amount, at most five a day, after the late-news check.
-- The card, the big-game sweep and the daily floor no longer put NFL picks on Winners. Other sports are unchanged
-- (their card takes the bottom five per sport, 20261019220000).

create table if not exists public.winners_nfl_board (
  id bigserial primary key,
  game_date text not null,
  game_id text not null,
  matchup text not null,
  decision text not null check (decision in ('bet', 'pass')),
  side text,                -- the full team name he backs when decision = 'bet'
  why text,
  rank integer,             -- his order among the games he bets, 1 = the one he likes most
  bets integer,             -- how many games he bet on this board
  games integer,            -- how many games were on this board
  board_at timestamptz not null default now(),
  model text,
  unique (game_id)
);
alter table public.winners_nfl_board enable row level security;
revoke all on public.winners_nfl_board from anon, authenticated;
grant select, insert on public.winners_nfl_board to service_role;
grant usage, select on sequence public.winners_nfl_board_id_seq to service_role;

-- The board's bets seat 75 minutes before kickoff (no closer than 20), once the late-news check has cleared them, on
-- the same side as the pick, his top five a day. A seat is final; admit_winners_candidate does the rest at his amount.
create or replace function public.seat_nfl_board(p_date text)
returns integer language plpgsql set search_path='' as $$
declare r record; n integer := 0; why text; n_on integer; cap constant integer := 5;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  for r in
    select c.id, c.commence_time, b.rank, b.bets, b.games, b.why as board_why
    from public.winners_candidates c
    join public.winners_nfl_board b on b.game_id = c.game_id and b.decision = 'bet' and c.pick_text like b.side || ' %'
    where c.game_date = p_date and c.league = 'NFL' and c.kind = 'game' and c.admitted_at is null
    order by b.rank
  loop
    if exists (select 1 from public.winners_decision_events e where e.candidate_id = r.id and e.event = 'card_seated') then
      why := gary_private.admit_winners_candidate(r.id);   -- a seated pass whose number arrived
      if why = 'admitted' then n := n + 1; end if;
      continue;
    end if;
    if r.rank is null or r.rank > cap then continue; end if;
    select count(*) into n_on from public.winners_board w
    where w.game_date = p_date and w.league = 'NFL' and w.kind = 'game' and w.scratched_at is null;
    if n_on >= cap then continue; end if;
    if r.commence_time is null or r.commence_time <= clock_timestamp() + interval '20 minutes'
       or r.commence_time > clock_timestamp() + interval '75 minutes' then continue; end if;
    if not exists (select 1 from public.winners_late_news x where x.candidate_id = r.id
                   and x.decision in ('clear', 'stand', 'no_feed', 'failed')) then continue; end if;
    insert into public.winners_decision_events(candidate_id, event, detail)
    values (r.id, 'card_seated', jsonb_build_object('board', true, 'rank', r.rank, 'of', r.bets, 'games', r.games, 'why', r.board_why));
    why := gary_private.admit_winners_candidate(r.id);
    if why = 'admitted' then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.seat_nfl_board(text) from public, anon, authenticated;
grant execute on function public.seat_nfl_board(text) to service_role;

-- The card leaves NFL to the board; the rest is 20261019220000 (bottom five per sport).
create or replace function public.seat_the_card(p_date text)
returns integer language plpgsql set search_path='' as $$
declare book bigint[]; n_card integer; r record; n integer := 0; why text; lead interval; floor_ interval;
        cap constant integer := 5; n_on integer;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  select count(*) into n_card from public.winners_card_placements p where p.game_date = p_date;
  if n_card < 1 then return 0; end if;   -- Oct 13 2026: the first pick answers its own book, so one pick is a card
  book := gary_private.card_book(p_date);
  for r in
    select c.id, c.league, c.admitted_at, c.commence_time, o.rank, o.of,
           row_number() over (partition by c.league order by o.rank desc) as from_bottom
    from gary_private.card_order(p_date) o join public.winners_candidates c on c.id = o.candidate_id
    where c.league <> 'NFL'
      and not exists (select 1 from public.winners_big_games g where g.game_date = p_date and g.league = c.league and g.game_id = c.game_id)
    order by o.rank desc
  loop
    if r.admitted_at is not null then continue; end if;
    if exists (select 1 from public.winners_decision_events e where e.candidate_id = r.id and e.event = 'card_seated') then
      why := gary_private.admit_winners_candidate(r.id);   -- a seated pass whose number arrived
      if why = 'admitted' then n := n + 1; end if;
      continue;
    end if;
    if not (r.id = any(book)) then continue; end if;
    if r.from_bottom > cap then continue; end if;
    select count(*) into n_on from public.winners_board w
    where w.game_date = p_date and w.league = r.league and w.kind = 'game' and w.scratched_at is null
      and w.policy_version in ('winners-card-v1', 'winners-floor-v1');
    if n_on >= cap then continue; end if;
    -- An NBA pick seats after the final statuses, about 30 minutes before tip (Oct 13 2026, late news).
    lead := case when r.league = 'NBA' then interval '28 minutes' else interval '75 minutes' end;
    floor_ := case when r.league = 'NBA' then interval '10 minutes' else interval '20 minutes' end;
    if r.commence_time is null or r.commence_time <= clock_timestamp() + floor_
       or r.commence_time > clock_timestamp() + lead then continue; end if;
    -- The late-news check runs first (lateNews.js): only a pick it cleared, or Gary kept, seats.
    if not exists (select 1 from public.winners_late_news x where x.candidate_id = r.id
                   and x.decision in ('clear', 'stand', 'no_feed', 'failed')) then continue; end if;
    insert into public.winners_decision_events(candidate_id, event, detail)
    values (r.id, 'card_seated', jsonb_build_object('rank', r.rank, 'of', r.of, 'from_bottom', r.from_bottom,
            'book', coalesce(array_length(book,1),0), 'card', n_card));
    why := gary_private.admit_winners_candidate(r.id);
    if why = 'admitted' then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.seat_the_card(text) from public, anon, authenticated;
grant execute on function public.seat_the_card(text) to service_role;

-- Admission: an NFL pick goes on only through the board (no big-game route), and its reason names the board.
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
 -- NFL (Oct 19 2026): his board is the only way on; a prime-time NFL game is not a big game here.
 big:=c.league<>'NFL' and exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id);
 select e.detail into seat from public.winners_decision_events e where e.candidate_id=p_id and e.event='card_seated' order by e.occurred_at desc limit 1;
 if not big and seat is null then return 'not_seated'; end if;          -- only his book (or board) seats an ordinary game pick
 -- A big game goes on with the card, after the late-news check (the judge that read it first is retired, Oct 13 2026).
 if big and not exists(select 1 from public.winners_late_news l where l.candidate_id=p_id and l.decision in ('clear','stand','no_feed','failed')) then return 'awaiting_late_news'; end if;
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
 policy:=case when big then 'winners-big-game-v1' when coalesce((seat->>'board')::boolean,false) then 'winners-nfl-board-v1' else 'winners-card-v1' end;
 label:=case when big then 'Big game'
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

-- The daily floor (nothing else on Winners today) never takes an NFL pick, and elsewhere takes the lowest card pick.
CREATE OR REPLACE FUNCTION gary_private.winners_daily_floor(p_date text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_when timestamptz; c public.winners_candidates; v_own text[]; slot text; play boolean; stake numeric;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  if exists (select 1 from public.winners_board w
             where w.game_date = p_date and w.policy_version <> 'darts-top-v1' and w.scratched_at is null) then
    return 'has_play';
  end if;
  v_when := coalesce(gary_private.day_pass_at(p_date::date),
                     (select min(x.commence_time) - interval '45 minutes' from public.winners_candidates x
                      where x.game_date = p_date and x.kind = 'game'));
  if v_when is null then return 'no_games'; end if;
  if clock_timestamp() < v_when then return 'waiting'; end if;
  -- Sunday's NFL games post as their own free picks and never become the day's free pick.
  v_own := array(select f.game_id from gary_private.sunday_nfl_free_games(p_date::date) f);

  select * into c from public.winners_candidates x
  where x.game_date = p_date and x.kind = 'game' and x.admitted_at is null
    and x.commence_time > clock_timestamp() + interval '20 minutes'
    and x.odds is not null and abs(x.odds) >= 100
    and x.league <> 'NFL'   -- Oct 19 2026: NFL goes on Winners only from Gary's board
    and not exists (select 1 from public.winners_late_news l where l.candidate_id = x.id and l.decision = 'scratch')
  order by (select o.rank from gary_private.card_order(p_date) o where o.candidate_id = x.id) desc nulls last,
           coalesce((x.pick_snapshot->'gary_bet'->>'play')::boolean, false) desc,
           coalesce(case when jsonb_typeof(x.pick_snapshot->'gary_bet'->'stake_dollars') = 'number'
                         then (x.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric end, 0) desc,
           x.commence_time asc
  limit 1
  for update;
  if not found then return 'no_pick'; end if;
  -- The floor seats a pick only after its late-news check, as Gary's card does: until then it waits.
  if not exists (select 1 from public.winners_late_news l where l.candidate_id = c.id
                 and l.decision in ('clear', 'stand', 'no_feed', 'failed')) then
    return 'waiting_late_news';
  end if;

  slot := coalesce((select '#'||o.rank||' of '||o.of from gary_private.card_order(p_date) o where o.candidate_id = c.id), 'not on the card');
  play := coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean, false)
          and jsonb_typeof(c.pick_snapshot->'gary_bet'->'stake_dollars') = 'number'
          and (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric >= 100;
  stake := case when play then (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric else 100 end;

  begin   -- a floor failure is logged and never stops the free pick that runs after it
  insert into public.winners_board(candidate_id, game_date, league, kind, game_id, ticket_key, market_key, pick_snapshot,
                                   admitted_at, policy_version, reason)
  values (c.id, c.game_date, c.league, c.kind, c.game_id, c.ticket_key, c.market_key, c.pick_snapshot, clock_timestamp(),
          'winners-floor-v1',
          case when play then format('Daily floor: nothing else on Winners today. Gary plays it, $%s; card: %s', trunc(stake), slot)
               else format('Daily floor: nothing else on Winners today. Gary passed, $100 minimum; card: %s', slot) end);
  update public.winners_candidates set admitted_at = clock_timestamp() where id = c.id;
  insert into public.winners_decision_events(candidate_id, event, detail)
  values (c.id, 'admitted', jsonb_build_object('gate', 'daily_floor', 'card', slot, 'stake_dollars', stake,
          'play', play, 'policy_version', 'winners-floor-v1', 'floor_at', v_when));
  exception when others then
    insert into public.winners_decision_events(candidate_id, event, detail)
    values (c.id, 'floor_failed', jsonb_build_object('error', sqlerrm, 'floor_at', v_when));
    return 'failed: ' || sqlerrm;
  end;
  return 'admitted ' || c.id;
end $function$;
