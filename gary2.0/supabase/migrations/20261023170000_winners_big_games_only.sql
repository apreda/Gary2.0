-- WINNERS GAME BETS = THE BIG GAMES ONLY (founder GO, Oct 23 2026). Since Sep 1 Winners game bets went 70-87
-- (-$7,750) while props went 87-59 (+$3,000); most of the game-bet volume came from Gary's card and his NFL, NBA and
-- college boards. From today a game pick goes on Winners only when it is one of the day's big games
-- (winners_big_games), in every league, at Gary's amount or his number, after the late-news check. The worker stops
-- running the boards and stops calling seat_the_card (code kept). Only admit_winners_candidate changes here.

create or replace function gary_private.admit_winners_candidate(p_id bigint)
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
