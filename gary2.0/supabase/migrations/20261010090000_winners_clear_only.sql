-- CLEAR ONLY (founder, Oct 10 2026: "maybe we don't let lean go through only clear ... so far every pick has
-- made it to winners and that's not good"). A game pick is on Winners when the judge says clear, at Gary's amount;
-- a clear pick he passed goes to the needs_gary_number ask. Lean, toss-up and unsupported stay off. Big games
-- (winners_big_games) are unchanged: on at his number whatever the judge said. Every sport, college included.

create or replace function gary_private.admit_winners_candidate(p_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.winners_candidates; grade text; play boolean:=false; big boolean:=false; forced boolean:=false; ok boolean:=false; why text; stake numeric;
begin
 select * into c from public.winners_candidates where id=p_id for update;
 if not found then return 'missing'; end if;
 if c.admitted_at is not null then return 'already'; end if;
 if c.kind='prop' then return 'props_selection'; end if;   -- props: public.finish_winners_props
 if c.commence_time is null or c.commence_time<=clock_timestamp() then return 'kickoff'; end if;
 grade:=c.review->>'assessment';
 if grade is null or c.status<>'graded' then return 'unread'; end if;
 if c.policy_version='mlb-conviction-v4' and coalesce(c.pick_snapshot->>'price_endorsement','')<>'endorse' then
  why:='declined_price';
 else
  play:=coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false)
    and jsonb_typeof(c.pick_snapshot->'gary_bet'->'stake_dollars')='number'
    and (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric>=100;
  stake:=case when play then (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric else 0 end;
  forced:=coalesce((c.pick_snapshot->'gary_bet'->>'forced')::boolean,false);
  big:=exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id);
  if big then
   ok:=play;   -- on at Gary's number whatever the judge said; the grade is recorded on the board
  else
   ok:=play and grade='clear';
  end if;
  why:=case when ok then 'admitted'
            when not play and (big or grade='clear') then 'needs_gary_number'
            when grade='unsupported' then 'unsupported' when grade='toss_up' then 'grade_toss_up' when grade='lean' then 'grade_lean'
            else 'grade_'||grade end;
 end if;
 if not ok then
  if why='needs_gary_number' then
   if not exists(select 1 from public.winners_decision_events e where e.candidate_id=p_id and e.event='needs_gary_number') then
    insert into public.winners_decision_events(candidate_id,event,detail) values(p_id,'needs_gary_number',jsonb_build_object('assessment',grade,'big_game',big));
   end if;
   return why;
  end if;
  insert into public.winners_decision_events(candidate_id,event,detail)
   values(p_id,'not_admitted',jsonb_build_object('why',why,'assessment',grade,'play',play,'big_game',big,'stake_dollars',stake));
  return why;
 end if;
 insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
  values(c.id,c.game_date,c.league,c.kind,c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),'winners-coach-v1',
   case when big and forced then format('Big game, Gary''s number: $%s; judge: %s',trunc(stake),grade)
        when big then format('Big game; Gary plays it, $%s; judge: %s',trunc(stake),grade)
        when forced then format('Gary''s number: $%s; judge: %s',trunc(stake),grade)
        else format('Gary plays it, $%s; judge: %s',trunc(stake),grade) end);
 update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
 insert into public.winners_decision_events(candidate_id,event,detail)
  values(c.id,'admitted',jsonb_build_object('gate',case when big then 'big_game' else 'judge' end,'assessment',grade,'stake_dollars',stake,'forced',forced,'policy_version','winners-coach-v1'));
 return 'admitted';
end $function$;
