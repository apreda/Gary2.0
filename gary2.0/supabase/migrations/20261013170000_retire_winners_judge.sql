-- THE WINNERS JUDGE IS RETIRED (founder, Oct 13 2026: "If we're not doing the Winners judge anymore, retire it, clean up
-- all that code, delete it, and get rid of it"). Since Oct 8 its grade decided nothing (a big game was on at Gary's
-- number whatever it said); since Oct 12 it read big games only, and its one effect was that a big game waited for
-- the read. Now a big game goes on Winners when the card's picks do: once the late-news check has cleared it or Gary
-- has kept it (75 minutes before an NFL, college or MLB start, 28 before an NBA tip), at the amount Gary bet, or his
-- number when he passed (garyBigGameStake.js). The read functions are dropped; winnersReader.js is deleted.

create or replace function gary_private.admit_winners_candidate(p_id bigint)
 returns text language plpgsql set search_path='' as $function$
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
 big:=exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id);
 select e.detail into seat from public.winners_decision_events e where e.candidate_id=p_id and e.event='card_seated' order by e.occurred_at desc limit 1;
 if not big and seat is null then return 'not_seated'; end if;          -- only his book seats an ordinary game pick
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
 policy:=case when big then 'winners-big-game-v1' else 'winners-card-v1' end;
 label:=case when big then 'Big game' else format('Gary''s book: #%s of %s on his card', seat->>'rank', seat->>'of') end;
 insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
  values(c.id,c.game_date,c.league,c.kind,c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),policy,
   case when forced then format('%s, Gary''s number: $%s', label, trunc(stake))
        else format('%s; Gary plays it, $%s', label, trunc(stake)) end
   );
 update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
 insert into public.winners_decision_events(candidate_id,event,detail)
  values(c.id,'admitted',jsonb_build_object('gate',case when big then 'big_game' else 'card' end,'assessment',grade,'card',seat,
         'stake_dollars',stake,'forced',forced,'policy_version',policy));
 return 'admitted';
end $function$;

create or replace function public.admit_winners_pending(p_date text)
 returns integer language plpgsql set search_path='' as $function$
declare n integer:=0; r record;
begin
 for r in select c.id from public.winners_candidates c
   where c.game_date=p_date and c.kind='game' and c.admitted_at is null and c.commence_time>clock_timestamp()
     and (c.status='graded' or exists(select 1 from public.winners_decision_events e where e.candidate_id=c.id and e.event='card_seated')
          or exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id))
     and not exists(
       select 1 from public.winners_decision_events e
       where e.candidate_id=c.id and e.event='not_admitted' and e.detail->>'why' in ('unsupported','declined_price','grade_toss_up')
         and not exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id))
 loop
  if gary_private.admit_winners_candidate(r.id)='admitted' then n:=n+1; end if;
 end loop;
 return n;
end $function$;

create or replace function public.claim_big_game_stakes(p_date text)
 returns table(id bigint, league text, pick_text text, odds integer, commence_time timestamp with time zone, matchup text, rationale text, case_home text, case_away text, grade text, attempts integer, minutes_to_kickoff numeric)
 language plpgsql set search_path='' as $function$
declare r record;
begin
 for r in
  select c.id, c.league, c.pick_text, c.odds, c.commence_time,
   coalesce(c.pick_snapshot->>'awayTeam','')||' @ '||coalesce(c.pick_snapshot->>'homeTeam','') as matchup,
   c.pick_snapshot->>'rationale' as rationale, c.evidence_snapshot->>'caseHome' as case_home, c.evidence_snapshot->>'caseAway' as case_away,
   c.review->>'assessment' as grade,
   (select count(*)::integer from public.winners_decision_events e where e.candidate_id=c.id and e.event='big_game_ask') as attempts,
   round(extract(epoch from (c.commence_time-clock_timestamp()))/60,1) as minutes_to_kickoff
  from public.winners_candidates c
  where c.game_date=p_date and c.kind='game' and c.admitted_at is null
   and (c.status='graded' or exists(select 1 from public.winners_decision_events e where e.candidate_id=c.id and e.event='card_seated')
        or exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id))
   and c.commence_time>clock_timestamp()+interval '30 seconds'
   and not coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false)
   and exists(select 1 from public.winners_decision_events e where e.candidate_id=c.id and e.event='needs_gary_number')
   and not exists(select 1 from public.winners_decision_events e where e.candidate_id=c.id and e.event='big_game_ask' and e.occurred_at>clock_timestamp()-interval '8 minutes')
  order by c.commence_time, c.id
 loop
  insert into public.winners_decision_events(candidate_id,event,detail) values(r.id,'big_game_ask',jsonb_build_object('attempt',r.attempts+1,'minutes_to_kickoff',r.minutes_to_kickoff));
  id:=r.id; league:=r.league; pick_text:=r.pick_text; odds:=r.odds; commence_time:=r.commence_time; matchup:=r.matchup; rationale:=r.rationale;
  case_home:=r.case_home; case_away:=r.case_away; grade:=r.grade; attempts:=r.attempts+1; minutes_to_kickoff:=r.minutes_to_kickoff;
  return next;
 end loop;
end $function$;

drop function if exists public.claim_winners_read();
drop function if exists public.finish_winners_read(bigint, integer, text, jsonb, jsonb, text, integer);
