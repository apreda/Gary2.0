-- BIG GAMES AT GARY'S NUMBER (founder GO, Oct 8 2026 evening). A big game (winners_big_games: TNF, SNF and MNF, the
-- nights with one NFL game, and MLB playoff games) is on Winners so users never sit out the game. That overrides the
-- judge's grade, which is still read and recorded. The amount is Gary's: his own bet when he played it; when he
-- passed, the worker asks him once more (garyBigGameStake.js: the house is playing it, how much and why) and books
-- his number; $100 only when he cannot be reached before kickoff. No default while he can still be asked.

create or replace function gary_private.admit_winners_candidate(p_id bigint) returns text
language plpgsql set search_path to '' as $function$
declare c public.winners_candidates; grade text; play boolean:=false; big boolean:=false; forced boolean:=false; ok boolean:=false; why text; stake numeric;
        big_spread boolean:=false; small boolean:=false; pick text; away text; home text; away_ok boolean; home_ok boolean;
begin
 select * into c from public.winners_candidates where id=p_id for update;
 if not found then return 'missing'; end if;
 if c.admitted_at is not null then return 'already'; end if;
 if c.kind='prop' then return 'props_selection'; end if;   -- props: public.finish_winners_props
 if c.commence_time is null or c.commence_time<=clock_timestamp() then return 'kickoff'; end if;
 grade:=c.review->>'assessment';
 if grade is null or c.status<>'graded' then return 'unread'; end if;
 big_spread:=abs(coalesce(nullif(c.pick_snapshot->>'spread','')::numeric,0))>21.5;
 if c.league='NCAAF' then
  pick:=coalesce(c.pick_snapshot->>'pick', c.pick_text, '');
  away:=coalesce(c.pick_snapshot->>'awayTeam',''); home:=coalesce(c.pick_snapshot->>'homeTeam','');
  away_ok:=gary_private.winners_power_team(c.pick_snapshot->>'awayConference', away);
  home_ok:=gary_private.winners_power_team(c.pick_snapshot->>'homeConference', home);
  if away<>'' and pick ilike away||'%' then small:=not away_ok;
  elsif home<>'' and pick ilike home||'%' then small:=not home_ok;
  else small:=not (away_ok and home_ok); end if;   -- a total, or a side we cannot name
 end if;
 if c.policy_version='mlb-conviction-v4' and coalesce(c.pick_snapshot->>'price_endorsement','')<>'endorse' then
  why:='declined_price';
 elsif big_spread then
  why:='spread_over_21_5';
 elsif small then
  why:='small_conference';
 else
  play:=coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false)
    and jsonb_typeof(c.pick_snapshot->'gary_bet'->'stake_dollars')='number'
    and (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric>=100;
  stake:=case when play then (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric else 0 end;
  forced:=coalesce((c.pick_snapshot->'gary_bet'->>'forced')::boolean,false);
  big:=exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id);
  if c.league='NCAAF' then
   ok:=play and (grade='clear' or (grade='lean' and stake>300));
  elsif big then
   ok:=play;   -- on at Gary's number whatever the judge said; the grade is recorded on the board
  else
   ok:=play and grade in ('clear','lean');
  end if;
  why:=case when ok then 'admitted'
            when big and c.league<>'NCAAF' and not play then 'needs_gary_number'
            when grade='unsupported' then 'unsupported' when grade='toss_up' then 'grade_toss_up'
            when not play then 'gary_pass' when c.league='NCAAF' and grade='lean' then 'lean_under_300' else 'grade_'||grade end;
 end if;
 if not ok then
  if why='needs_gary_number' then
   if not exists(select 1 from public.winners_decision_events e where e.candidate_id=p_id and e.event='needs_gary_number') then
    insert into public.winners_decision_events(candidate_id,event,detail) values(p_id,'needs_gary_number',jsonb_build_object('assessment',grade,'big_game',true));
   end if;
   return why;
  end if;
  insert into public.winners_decision_events(candidate_id,event,detail)
   values(p_id,'not_admitted',jsonb_build_object('why',why,'assessment',grade,'play',play,'big_game',big,'stake_dollars',stake,'spread',c.pick_snapshot->>'spread',
          'away_conference',c.pick_snapshot->>'awayConference','home_conference',c.pick_snapshot->>'homeConference'));
  return why;
 end if;
 insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
  values(c.id,c.game_date,c.league,c.kind,c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),'winners-coach-v1',
   case when big and forced then format('Big game, Gary''s number: $%s; judge: %s',trunc(stake),grade)
        when big then format('Big game; Gary plays it, $%s; judge: %s',trunc(stake),grade)
        else format('Gary plays it, $%s; judge: %s',trunc(stake),grade) end);
 update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
 insert into public.winners_decision_events(candidate_id,event,detail)
  values(c.id,'admitted',jsonb_build_object('gate',case when big then 'big_game' else 'play_and_grade' end,'assessment',grade,'stake_dollars',stake,'forced',forced,'policy_version','winners-coach-v1'));
 return 'admitted';
end $function$;

-- The ask's queue: big games the judge has read where Gary passed. Claiming marks an attempt (an 8-minute lease).
create or replace function public.claim_big_game_stakes(p_date text)
returns table(id bigint, league text, pick_text text, odds integer, commence_time timestamptz, matchup text, rationale text, case_home text, case_away text, grade text, attempts integer, minutes_to_kickoff numeric)
language plpgsql set search_path to '' as $$
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
  where c.game_date=p_date and c.kind='game' and c.league<>'NCAAF' and c.status='graded' and c.admitted_at is null
   and c.commence_time>clock_timestamp()+interval '30 seconds'
   and not coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false)
   and exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id)
   and not exists(select 1 from public.winners_decision_events e where e.candidate_id=c.id and e.event='big_game_ask' and e.occurred_at>clock_timestamp()-interval '8 minutes')
  order by c.commence_time, c.id
 loop
  insert into public.winners_decision_events(candidate_id,event,detail) values(r.id,'big_game_ask',jsonb_build_object('attempt',r.attempts+1,'minutes_to_kickoff',r.minutes_to_kickoff));
  id:=r.id; league:=r.league; pick_text:=r.pick_text; odds:=r.odds; commence_time:=r.commence_time; matchup:=r.matchup; rationale:=r.rationale;
  case_home:=r.case_home; case_away:=r.case_away; grade:=r.grade; attempts:=r.attempts+1; minutes_to_kickoff:=r.minutes_to_kickoff;
  return next;
 end loop;
end $$;

-- His number on a big game he passed on; the gate books it. p_net marks the $100 net when he could not be reached.
create or replace function public.set_big_game_stake(p_id bigint, p_stake integer, p_why text, p_model text, p_net boolean default false) returns jsonb
language plpgsql set search_path to '' as $$
declare c public.winners_candidates; why text;
begin
 select * into c from public.winners_candidates where id=p_id for update;
 if not found then return jsonb_build_object('stored',false,'why','missing'); end if;
 if c.admitted_at is not null then return jsonb_build_object('stored',false,'why','already'); end if;
 if c.kind<>'game' or c.commence_time is null or c.commence_time<=clock_timestamp() then return jsonb_build_object('stored',false,'why','kickoff'); end if;
 if coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false) then return jsonb_build_object('stored',false,'why','gary_played_it'); end if;
 if not exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id) then return jsonb_build_object('stored',false,'why','not_a_big_game'); end if;
 if p_stake is null or p_stake<100 then return jsonb_build_object('stored',false,'why','stake_under_100'); end if;
 update public.winners_candidates set pick_snapshot=jsonb_set(pick_snapshot,'{gary_bet}',
   coalesce(pick_snapshot->'gary_bet','{}'::jsonb)||jsonb_build_object('play',true,'stake_dollars',p_stake,'why',coalesce(p_why,''),'forced',true,'net',p_net,'model',p_model,'decided_at',clock_timestamp()))
  where id=p_id;
 insert into public.winners_decision_events(candidate_id,event,detail) values(p_id,'big_game_stake',jsonb_build_object('stake_dollars',p_stake,'net',p_net,'model',p_model));
 why:=gary_private.admit_winners_candidate(p_id);
 return jsonb_build_object('stored',true,'admitted',why='admitted','why',why);
end $$;

-- A wrongly booked game play comes off whole (founder law: deleted, never shown as Scratched): the board row (the
-- bankroll ledger is a view over the board, so its commitment goes with it) and the admission mark, with a receipt.
-- Only before it settles. Owner-run; never from the app.
create or replace function gary_private.unbook_winners_game(p_candidate_id bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare n_board integer:=0;
begin
 if exists(select 1 from gary_private.bankroll_ledger l where l.candidate_id=p_candidate_id and l.result<>'pending') then raise exception 'already settled'; end if;
 alter table public.winners_board disable trigger winners_board_immutable;
 alter table public.winners_candidates disable trigger winners_candidate_admitted_immutable;
 begin
  delete from public.winners_board where candidate_id=p_candidate_id; get diagnostics n_board=row_count;
  update public.winners_candidates set admitted_at=null where id=p_candidate_id;
  insert into public.winners_decision_events(candidate_id,event,detail) values(p_candidate_id,'unbooked',jsonb_build_object('reason',p_reason,'board_rows',n_board));
 exception when others then
  alter table public.winners_board enable trigger winners_board_immutable;
  alter table public.winners_candidates enable trigger winners_candidate_admitted_immutable;
  raise;
 end;
 alter table public.winners_board enable trigger winners_board_immutable;
 alter table public.winners_candidates enable trigger winners_candidate_admitted_immutable;
 return jsonb_build_object('board_rows',n_board);
end $$;

revoke all on function public.claim_big_game_stakes(text), public.set_big_game_stake(bigint,integer,text,text,boolean), gary_private.unbook_winners_game(bigint,text) from public,anon,authenticated;
grant execute on function public.claim_big_game_stakes(text), public.set_big_game_stake(bigint,integer,text,text,boolean) to service_role;
