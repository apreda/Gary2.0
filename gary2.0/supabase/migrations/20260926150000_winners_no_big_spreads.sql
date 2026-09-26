-- WINNERS = POWER-CONFERENCE TEAMS ONLY, NO BIG SPREADS (founder, Sep 26 2026):
-- "i dont want the no name low d1 conference teams to be winners picks" and "i dont want any
-- spread higher than like 21.5 to qualify". A college game pick reaches the Winners board only
-- when the team Gary takes is in the SEC, Big Ten, Big 12 or ACC, or is Notre Dame or Boise State (a total
-- needs both teams there), and the posted spread is within 21.5 either way. The pick itself
-- still publishes; the gate logs small_conference / spread_over_21_5.
-- (Applied as two MCP migrations, winners_no_big_spreads then winners_power_conferences_only;
-- this file is the final state.)
create or replace function gary_private.winners_power_team(p_conf text, p_team text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_conf,'') in ('SEC','Big Ten','Big 12','ACC')
      or (coalesce(p_conf,'') = 'Independents' and coalesce(p_team,'') ilike 'Notre Dame%')
      -- "no rebuilt Pac-12 outside of Colorado (Buffs) and Boise State" (Colorado is Big 12 already).
      or coalesce(p_team,'') ilike 'Boise State%';
$$;

create or replace function gary_private.admit_winners_candidate(p_id bigint) returns text
language plpgsql set search_path = '' as $$
declare c public.winners_candidates; grade text; play boolean:=false; big boolean:=false; ok boolean:=false; why text; stake numeric;
        big_spread boolean:=false; small boolean:=false; pick text; away text; home text; away_ok boolean; home_ok boolean;
begin
 select * into c from public.winners_candidates where id=p_id for update;
 if not found then return 'missing'; end if;
 if c.admitted_at is not null then return 'already'; end if;
 if c.commence_time is null or c.commence_time<=clock_timestamp() then return 'kickoff'; end if;
 grade:=c.review->>'assessment';
 if grade is null or c.status<>'graded' then return 'unread'; end if;
 big_spread:=c.kind='game' and abs(coalesce(nullif(c.pick_snapshot->>'spread','')::numeric,0))>21.5;
 if c.kind='game' and c.league='NCAAF' then
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
  big:=c.kind='game' and exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id);
  if c.kind='game' then ok:=(play and grade in ('clear','lean')) or (big and grade<>'unsupported');
  else ok:=play and grade<>'unsupported'; end if;
  why:=case when ok then 'admitted' when grade='unsupported' then 'unsupported' when not play then 'gary_pass' else 'grade_'||grade end;
 end if;
 if not ok then
  insert into public.winners_decision_events(candidate_id,event,detail)
   values(p_id,'not_admitted',jsonb_build_object('why',why,'assessment',grade,'play',play,'big_game',big,'spread',c.pick_snapshot->>'spread',
          'away_conference',c.pick_snapshot->>'awayConference','home_conference',c.pick_snapshot->>'homeConference'));
  return why;
 end if;
 stake:=case when play then (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric else 100 end;
 insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
  values(c.id,c.game_date,c.league,c.kind,c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),'winners-gate-v1',
   case when play then format('Gary plays it, $%s; reader: %s',trunc(stake),grade) else format('Big game; reader: %s',grade) end);
 update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
 insert into public.winners_decision_events(candidate_id,event,detail)
  values(c.id,'admitted',jsonb_build_object('gate',case when play then 'play_and_grade' else 'big_game' end,'assessment',grade,'stake_dollars',stake,'policy_version','winners-gate-v1'));
 return 'admitted';
end $$;
