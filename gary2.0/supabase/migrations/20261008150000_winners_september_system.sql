-- THE SEPTEMBER SYSTEM, BACK (founder GO, Oct 8 2026: "go back to the system that was 10-4 and 25-17 ...
-- the grader is solid and Gary has more agency on his amount ... it's worth it").
--
-- GAME PICKS (every league): the Sep 24-30 gate. Gary is asked after his case whether he plays the ticket and
-- for how much ($100 minimum, no maximum; pickdesk/garyBet.js), the reader grades the case on its own
-- (winnersReader.js), and the pick is on the board when he plays it and the grade is clear or lean, at his
-- amount. A big game (an MLB playoff game, Sunday Night Football) is on at his amount, or $100 when he passes,
-- unless the reader calls it unsupported. College keeps its September rules: clear, or lean with more than
-- $300; power-conference teams only; no spread past 21.5.
--
-- PROPS: the Sep 16-24 selection (daily-props-v1, 20260917011158_winners_daily_props.sql). Gary makes every prop
-- pick; the reader compares a window's published props and selects clear and lean ones with its own stake,
-- $100 to $1,000: at most six a day, one per player, two per game. Gary is not asked to bet props.
--
-- Retired with this (Oct 3-7): every MLB game automatic, college main games automatic, the NFL $300 rule,
-- the in-session bet step, Gary-bets-only admission, the bankroll brief and the bet scoreboard.

-- ── Retire the October admission routes ─────────────────────────────────────────────────────────────────────
drop trigger if exists winners_automatic_game_on_insert on public.winners_candidates;
drop function if exists gary_private.admit_published_automatic_game();
drop function if exists public.gary_bet_scoreboard(text, text);
drop function if exists gary_private.pick_outcome(text, text, text, text, text, jsonb);
drop function if exists public.winners_bankroll_brief();
drop function if exists public.fill_ncaaf_prop_bet(text, jsonb, jsonb);
drop function if exists gary_private.gary_named_dollars(jsonb);

-- ── Game gate: the Sep 27 function; props never pass through it now ─────────────────────────────────────────
create or replace function gary_private.admit_winners_candidate(p_id bigint) returns text
language plpgsql set search_path to '' as $function$
declare c public.winners_candidates; grade text; play boolean:=false; big boolean:=false; ok boolean:=false; why text; stake numeric;
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
  -- Big games: the founder's list (winners_big_games); in the NFL only Sunday Night Football (Oct 4 2026).
  big:=exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id)
    and (c.league<>'NFL' or gary_private.nfl_sunday_night(c.commence_time));
  if c.league='NCAAF' then
   ok:=play and (grade='clear' or (grade='lean' and stake>300));
  else
   ok:=(play and grade in ('clear','lean')) or (big and grade<>'unsupported');
  end if;
  why:=case when ok then 'admitted' when grade='unsupported' then 'unsupported' when not play then 'gary_pass'
            when c.league='NCAAF' and grade='lean' then 'lean_under_300' else 'grade_'||grade end;
 end if;
 if not ok then
  insert into public.winners_decision_events(candidate_id,event,detail)
   values(p_id,'not_admitted',jsonb_build_object('why',why,'assessment',grade,'play',play,'big_game',big,'stake_dollars',stake,'spread',c.pick_snapshot->>'spread',
          'away_conference',c.pick_snapshot->>'awayConference','home_conference',c.pick_snapshot->>'homeConference'));
  return why;
 end if;
 stake:=case when play then stake else 100 end;
 insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
  values(c.id,c.game_date,c.league,c.kind,c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),'winners-gate-v1',
   case when play then format('Gary plays it, $%s; reader: %s',trunc(stake),grade) else format('Big game; reader: %s',grade) end);
 update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
 insert into public.winners_decision_events(candidate_id,event,detail)
  values(c.id,'admitted',jsonb_build_object('gate',case when play then 'play_and_grade' else 'big_game' end,'assessment',grade,'stake_dollars',stake,'policy_version','winners-gate-v1'));
 return 'admitted';
end $function$;

-- The sweep: graded game picks whose bet or big-game status arrived after the read (the Sep 27 rule, games only).
create or replace function public.admit_winners_pending(p_date text) returns integer
language plpgsql set search_path to '' as $function$
declare n integer:=0; r record;
begin
 for r in select c.id from public.winners_candidates c
   where c.game_date=p_date and c.kind='game' and c.status='graded' and c.admitted_at is null and c.commence_time>clock_timestamp()
     and not exists(
       select 1 from public.winners_decision_events e
       where e.candidate_id=c.id and e.event='not_admitted'
         and (e.detail->>'why' in ('unsupported','declined_price','grade_toss_up')
           or (e.detail->>'why'='gary_pass'
               and not coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false)
               and not exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id))))
 loop
  if gary_private.admit_winners_candidate(r.id)='admitted' then n:=n+1; end if;
 end loop;
 return n;
end $function$;

-- The reader reads game picks one at a time; props are read side by side by the props selection.
create or replace function public.claim_winners_read() returns setof public.winners_candidates
language plpgsql set search_path to '' as $function$
declare chosen public.winners_candidates;
begin
 select * into chosen from public.winners_candidates c
 where c.kind='game'
   and (c.status='pending' or (c.status='reviewing' and c.lease_until<clock_timestamp())
     or (c.status='unavailable' and c.reviewed_at<clock_timestamp()-interval '2 minutes' and nullif(c.evidence_snapshot->>'deskText','') is not null))
   and c.admitted_at is null and c.created_at<clock_timestamp()-interval '30 seconds'
   and (nullif(c.evidence_snapshot->>'deskText','') is not null or c.created_at<clock_timestamp()-interval '5 minutes')
   and c.attempts<2 and c.commence_time>clock_timestamp()+interval '30 seconds'
 order by c.commence_time,c.created_at,c.id for update skip locked limit 1;
 if not found then return; end if;
 update public.winners_candidates set status='reviewing',attempts=attempts+1,lease_until=clock_timestamp()+interval '15 minutes' where id=chosen.id returning * into chosen;
 insert into public.winners_decision_events(candidate_id,event,detail) values(chosen.id,'read_started',jsonb_build_object('attempt',chosen.attempts));
 return next chosen;
end $function$;

-- ── The stake: Gary's amount on a game (Sept); the reader's on a selected prop (Sep 16-24) ──────────────────
create or replace function gary_private.size_winners_bet() returns trigger
language plpgsql set search_path to '' as $function$
declare cfg public.gary_bankroll; c public.winners_candidates; bet jsonb; sel jsonb;
 requested numeric:=1; equity numeric; open_risk numeric; amount numeric; dollars numeric; why text;
begin
 select * into cfg from public.gary_bankroll where id;
 if new.admitted_at<cfg.started_at or new.game_date<(cfg.started_at at time zone 'America/New_York')::date::text then return new;end if;
 perform pg_advisory_xact_lock(1616092026);
 select * into c from public.winners_candidates where id=new.candidate_id;
 if c.commence_time<=clock_timestamp() or c.commence_time is null or c.odds is null or abs(c.odds)<100 then
  raise exception 'Bankroll requires an original, priced, pregame ticket';
 end if;
 if new.kind='prop' and new.policy_version='daily-props-v1' then
  select e.detail into sel from public.winners_decision_events e
   where e.candidate_id=new.candidate_id and e.event='curated' order by e.id desc limit 1;
  why:='Minimum $100 stake; the reader gave no sizing.';
  if jsonb_typeof(sel->'stake_dollars')='number' then
   dollars:=(sel->>'stake_dollars')::numeric;
   if dollars=trunc(dollars) and dollars between 100 and 1000 then
    requested:=dollars/100;
    why:=coalesce(nullif(trim(sel->>'stake_reason'),''),'The reader sized it.');
   end if;
  end if;
 else
  bet:=c.pick_snapshot->'gary_bet';
  why:='Minimum $100 stake; Gary gave no sizing.';
  if coalesce((bet->>'play')::boolean,false) and jsonb_typeof(bet->'stake_dollars')='number' then
   dollars:=(bet->>'stake_dollars')::numeric;
   if dollars=trunc(dollars) and dollars>=100 then
    requested:=dollars/100;
    why:=coalesce(nullif(trim(bet->>'why'),''),'Gary sized it.');
   end if;
  end if;
 end if;
 select cfg.initial_units+coalesce(sum(stake_units*flat_net_units),0),
  coalesce(sum(stake_units) filter(where result='pending'),0)
 into equity,open_risk from gary_private.bankroll_ledger;
 amount:=greatest(0,trunc(least(requested,equity-open_risk)*10000)/10000);
 new.stake_units:=amount;
 new.bankroll_policy:=cfg.policy_version;
 insert into public.winners_decision_events(candidate_id,event,detail) values(new.candidate_id,'bankroll_committed',jsonb_build_object(
  'policy_version',cfg.policy_version,'requested_units',requested,'requested_dollars',requested*100,'stake_units',amount,'stake_dollars',amount*100,
  'equity_before',equity,'open_risk_before',open_risk,
  'assessment',coalesce(c.review->>'assessment',sel->>'assessment','unreviewed'),
  'stake_reason',why,
  'adjustment',case when amount=0 then 'Bankroll cash exhausted; ticket remains a prediction, no funds invented.'
   when amount<requested then 'Reduced to the bankroll''s cash on hand.' else 'Requested stake accepted.' end));
 return new;
end $function$;

-- ── Props selection (20260917011158_winners_daily_props.sql, unchanged but for its start date) ─────────────
create or replace function public.winners_props_plan(p_date text) returns jsonb
language sql stable security invoker set search_path='' as $$
 with starts as (
  select distinct commence_time from public.daily_slate where date::text=p_date and league in ('MLB','NFL','NCAAF')
   and commence_time is not null and lower(coalesce(game_status,'')) not in ('cancelled','canceled','postponed')
 ), ranked as (select commence_time,dense_rank() over(order by commence_time) r,count(*) over() n from starts)
 select coalesce(jsonb_agg(jsonb_build_object('start',commence_time,'cohort',case when n=1 then 3 when n=2 then case when r=1 then 1 else 3 end
  when r<=ceil(n/3.0) then 1 when r<=ceil(n/3.0)+floor(n/3.0)+case when n%3=2 then 1 else 0 end then 2 else 3 end)
  order by commence_time),'[]') from ranked;
$$;

create or replace function public.claim_winners_props(p_date text) returns setof public.winners_prop_selection_runs
language plpgsql security invoker set search_path='' as $$
declare plan jsonb; candidates jsonb; prior jsonb; snapshot jsonb; key text; r public.winners_prop_selection_runs; used integer;
begin
 if p_date<'2026-10-08' or p_date<>(clock_timestamp() at time zone 'America/New_York')::date::text then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('winners-props:'||p_date,0));
 if exists(select 1 from public.winners_prop_selection_runs where game_date=p_date and status='selecting' and lease_until>clock_timestamp()) then return;end if;
 update public.winners_prop_selection_runs set status='failed',error='Selection lease expired',completed_at=clock_timestamp(),lease_until=null
  where game_date=p_date and status='selecting';
 plan:=public.winners_props_plan(p_date);
 select count(*),coalesce(jsonb_agg(jsonb_build_object('candidate_id',b.candidate_id,'league',b.league,'game_id',b.game_id,
   'pick_snapshot',b.pick_snapshot,'cohort',coalesce((select (v->>'cohort')::integer from jsonb_array_elements(plan) v where (v->>'start')::timestamptz=c.commence_time),1))),'[]')
  into used,prior from public.winners_board b join public.winners_candidates c on c.id=b.candidate_id where b.game_date=p_date and b.kind='prop';
 if used>=6 then return;end if;
 select jsonb_agg(to_jsonb(c)||jsonb_build_object('cohort',(w->>'cohort')::integer) order by c.commence_time,c.id) into candidates
 from public.winners_candidates c join public.daily_slate s on s.date::text=c.game_date and s.league=c.league and s.bdl_game_id::text=c.game_id and s.commence_time=c.commence_time
 cross join lateral jsonb_array_elements(plan) w
 where c.game_date=p_date and c.kind='prop' and c.league in ('MLB','NFL','NCAAF') and c.admitted_at is null
  and (w->>'start')::timestamptz=c.commence_time and c.commence_time>clock_timestamp()+interval '3 minutes'
  and c.commence_time<=clock_timestamp()+interval '90 minutes' and c.created_at<clock_timestamp()-interval '30 seconds'
  and lower(coalesce(s.game_status,'')) in ('','scheduled','pregame','pre-game','not started')
  and not exists(select 1 from public.winners_prop_selection_runs old cross join lateral jsonb_array_elements(old.input_snapshot->'candidates') v
    where old.game_date=p_date and old.status='completed' and v->'id'=to_jsonb(c.id) and v->'pick_snapshot'=c.pick_snapshot and v->'evidence_snapshot'=c.evidence_snapshot)
  and not exists(select 1 from public.winners_board b where b.game_date=p_date and b.kind='prop' and b.league=c.league and b.market_key=c.market_key);
 if candidates is null then return;end if;
 -- Wait for peers starting together until T-65, so the fastest job does not win a slot.
 if exists(select 1 from public.daily_slate s where s.date::text=p_date and s.league in ('MLB','NFL','NCAAF')
  and s.commence_time>clock_timestamp()+interval '65 minutes' and s.commence_time<=clock_timestamp()+interval '90 minutes'
  and exists(select 1 from jsonb_array_elements(candidates) c where (c->>'commence_time')::timestamptz=s.commence_time)
  and not exists(select 1 from public.winners_candidates c where c.game_date=p_date and c.league=s.league and c.kind='prop' and c.game_id=s.bdl_game_id::text)) then return;end if;
 snapshot:=jsonb_build_object('candidates',candidates,'prior',prior,'plan',plan,'capacity',6-used,'used',used,'observed_at',clock_timestamp());
 key:=md5(jsonb_build_object('date',p_date,'candidates',candidates,'prior',prior,'plan',plan)::text);
 select * into r from public.winners_prop_selection_runs where fingerprint=key for update;
 if found then
  if r.status in ('completed','expired') or r.attempts>=3 or r.completed_at>clock_timestamp()-interval '2 minutes' then return;end if;
  return query update public.winners_prop_selection_runs set status='selecting',attempts=attempts+1,error=null,lease_until=clock_timestamp()+interval '10 minutes' where id=r.id returning *;
 else
  return query insert into public.winners_prop_selection_runs(game_date,fingerprint,input_snapshot,lease_until)
   values(p_date,key,snapshot,clock_timestamp()+interval '10 minutes') returning *;
 end if;
end; $$;

create or replace function public.finish_winners_props(p_id bigint,p_attempt integer,p_selection jsonb,p_model text,p_ms integer,p_error text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.winners_prop_selection_runs; c public.winners_candidates; original jsonb; item jsonb;
 seen bigint[]:='{}'; chosen bigint[]:='{}'; n integer:=0; used integer; early integer; middle integer; cohort integer; why text;
begin
 select * into r from public.winners_prop_selection_runs where id=p_id;
 if not found then return jsonb_build_object('completed',false,'reason','Unknown prop selection');end if;
 perform pg_advisory_xact_lock(hashtextextended('winners-props:'||r.game_date,0));
 select * into r from public.winners_prop_selection_runs where id=p_id for update;
 if r.status='completed' and r.attempts=p_attempt and r.selection=p_selection then return jsonb_build_object('completed',true,'already_recorded',true);end if;
 if r.status<>'selecting' or r.attempts<>p_attempt or r.lease_until<=clock_timestamp() then return jsonb_build_object('completed',false,'reason','Stale selection attempt');end if;
 why:=p_error;
 if why is null then
 begin
  if public.winners_props_plan(r.game_date) is distinct from r.input_snapshot->'plan' then raise exception 'Slate changed during prop selection';end if;
  select count(*) into used from public.winners_board where game_date=r.game_date and kind='prop';
  if used<>(r.input_snapshot->>'used')::integer then raise exception 'Prop board changed';end if;
  select count(*) filter(where (v->>'cohort')::integer=1),count(*) filter(where (v->>'cohort')::integer<=2)
    into early,middle from jsonb_array_elements(r.input_snapshot->'prior') v;
  if jsonb_typeof(p_selection->'ranked_candidates') is distinct from 'array' or jsonb_array_length(p_selection->'ranked_candidates')<>jsonb_array_length(r.input_snapshot->'candidates') then raise exception 'Incomplete prop comparison';end if;
  for item in select value from jsonb_array_elements(p_selection->'ranked_candidates') loop
   if (item->>'candidate_id')::bigint=any(seen) then raise exception 'Duplicate candidate';end if;
   seen:=array_append(seen,(item->>'candidate_id')::bigint);
   select value into original from jsonb_array_elements(r.input_snapshot->'candidates') v where v->'id'=item->'candidate_id';
   if original is null then raise exception 'Unknown candidate';end if;
   select * into c from public.winners_candidates where id=(item->>'candidate_id')::bigint for update;
   if to_jsonb(c)-'status'-'reason'-'review'-'reviewed_at'-'review_model'-'review_ms'-'attempts'-'lease_until' is distinct from
      original-'cohort'-'status'-'reason'-'review'-'reviewed_at'-'review_model'-'review_ms'-'attempts'-'lease_until' then raise exception 'Original prop changed during selection';end if;
   if jsonb_typeof(item->'selected') is distinct from 'boolean' or item->>'assessment' not in ('clear','lean','toss_up','unsupported')
    or length(trim(coalesce(item->>'reason','')))<10 then raise exception 'Invalid prop assessment';end if;
   if item->'selected'='true'::jsonb then
    if item->>'assessment' not in ('clear','lean') then raise exception 'Unsupported or toss-up prop cannot enter Winners';end if;
    if c.commence_time<=clock_timestamp()+interval '30 seconds' or not exists(select 1 from public.daily_slate s where s.date::text=c.game_date and s.league=c.league and s.bdl_game_id::text=c.game_id
     and s.commence_time=c.commence_time and lower(coalesce(s.game_status,'')) in ('','scheduled','pregame','pre-game','not started')) then raise exception 'Prop game is no longer pregame';end if;
    if nullif(trim(c.evidence_snapshot->>'deskText'),'') is null or nullif(trim(c.pick_snapshot->>'rationale'),'') is null
     or (c.evidence_snapshot->>'observedAt')::timestamptz is null or (c.evidence_snapshot->>'observedAt')::timestamptz>=c.commence_time
     or (c.evidence_snapshot->>'observedAt')::timestamptz>r.created_at then raise exception 'Missing original pregame evidence';end if;
    if c.odds is null or abs(c.odds)<100 or nullif(trim(c.pick_snapshot->>'player'),'') is null
     or lower(coalesce(c.pick_snapshot->>'bet','')) not in ('over','under') or coalesce(c.pick_snapshot->>'line','') !~ '^[0-9]+([.][0-9]+)?$'
     or nullif(coalesce(c.pick_snapshot->>'prop',c.pick_snapshot->>'prop_type'),'') is null
     or upper(coalesce(c.pick_snapshot->>'lane','')) in ('HR','TD')
     or coalesce(c.pick_snapshot->>'prop',c.pick_snapshot->>'prop_type','') ~* '(home.?run|anytime.?t|first.?t)' then raise exception 'Not an exact core prop';end if;
    if length(trim(coalesce(item->>'source_quote','')))<12 or position(item->>'source_quote' in c.evidence_snapshot->>'deskText')=0
     or length(trim(coalesce(item->>'rationale_quote','')))<12 or position(item->>'rationale_quote' in c.pick_snapshot->>'rationale')=0
     or length(trim(coalesce(item->>'price_reason','')))<10 then raise exception 'Unsupported prop citations or price judgment';end if;
    if exists(select 1 from public.winners_candidates prev where (prev.id=any(chosen) or exists(select 1 from public.winners_board b where b.game_date=r.game_date and b.kind='prop' and b.candidate_id=prev.id))
     and prev.league=c.league and lower(trim(prev.pick_snapshot->>'player'))=lower(trim(c.pick_snapshot->>'player'))) then raise exception 'Daily player exposure exceeded';end if;
    if (select count(*) from public.winners_candidates prev where (prev.id=any(chosen) or exists(select 1 from public.winners_board b where b.game_date=r.game_date and b.kind='prop' and b.candidate_id=prev.id))
     and prev.league=c.league and prev.game_id=c.game_id)>=2 then raise exception 'Game prop exposure exceeded';end if;
    cohort:=(original->>'cohort')::integer;
    if cohort=1 then early:=early+1;end if;
    if cohort<=2 then middle:=middle+1;end if;
    chosen:=array_append(chosen,c.id); n:=n+1;
    if used+n>6 or early>2 or middle>4 then raise exception 'Daily prop capacity exceeded';end if;
   end if;
  end loop;
 exception when others then why:=sqlerrm;end;
 end if;
 if why is not null then
  update public.winners_prop_selection_runs set status='failed',error=why,model=p_model,ms=p_ms,completed_at=clock_timestamp(),lease_until=null where id=r.id;
  return jsonb_build_object('completed',false,'reason',why);
 end if;
 for item in select value from jsonb_array_elements(p_selection->'ranked_candidates') loop
  select * into c from public.winners_candidates where id=(item->>'candidate_id')::bigint;
  insert into public.winners_decision_events(candidate_id,event,detail) values(c.id,'curated',item||jsonb_build_object('prop_selection_run_id',r.id,'policy_version',r.policy_version));
  if item->'selected'='true'::jsonb then
   insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
    values(c.id,c.game_date,c.league,'prop',c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),r.policy_version,item->>'reason');
   update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
   insert into public.winners_decision_events(candidate_id,event,detail) values(c.id,'admitted',item||jsonb_build_object('prop_selection_run_id',r.id,'policy_version',r.policy_version));
  end if;
 end loop;
 update public.winners_prop_selection_runs set status='completed',selection=p_selection,model=p_model,ms=p_ms,error=null,completed_at=clock_timestamp(),lease_until=null where id=r.id;
 return jsonb_build_object('completed',true,'admitted',n);
end; $$;

revoke all on function public.winners_props_plan(text),public.claim_winners_props(text),public.finish_winners_props(bigint,integer,jsonb,text,integer,text) from public,anon,authenticated;
grant execute on function public.winners_props_plan(text),public.claim_winners_props(text),public.finish_winners_props(bigint,integer,jsonb,text,integer,text) to service_role;
revoke all on function gary_private.admit_winners_candidate(bigint),public.admit_winners_pending(text),public.claim_winners_read() from public,anon,authenticated;
grant execute on function gary_private.admit_winners_candidate(bigint),public.admit_winners_pending(text),public.claim_winners_read() to service_role;
