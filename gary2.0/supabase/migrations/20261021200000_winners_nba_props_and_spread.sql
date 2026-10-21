-- NBA PROPS ON WINNERS + PLACES SAVED FOR LATER GAMES (founder, Oct 21 2026: "lets save some places for the later
-- games too" and "NBA props can work the same way right but limit to like 3 max a night so 8 bets would be the most
-- Gary ever takes").
--
-- The props selection now runs two pools, each with its own nightly cap: MLB/NFL/college keep their six (two in the
-- first third of the day's start times, four through the second third), and the NBA gets three (one, two, three).
-- A run reads one pool; claim_winners_props tries the main pool first, then the NBA. finish_winners_props trims a
-- selection past its pool's cap in the reader's ranked order instead of failing the run, so a worker still running
-- the older six-a-day chooser stays inside the NBA's three.
--
-- seat_nba_board keeps its five a day but spreads them the same way: the first third of the night's tip times can
-- take two, the first two thirds four, so the late games always have at least one place left.

create or replace function public.winners_props_plan(p_date text, p_pool text)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
 with starts as (
  select distinct commence_time from public.daily_slate where date::text=p_date
   and case when p_pool='NBA' then league='NBA' else league in ('MLB','NFL','NCAAF') end
   and commence_time is not null and lower(coalesce(game_status,'')) not in ('cancelled','canceled','postponed')
 ), ranked as (select commence_time,dense_rank() over(order by commence_time) r,count(*) over() n from starts)
 select coalesce(jsonb_agg(jsonb_build_object('start',commence_time,'cohort',case when n=1 then 3 when n=2 then case when r=1 then 1 else 3 end
  when r<=ceil(n/3.0) then 1 when r<=ceil(n/3.0)+floor(n/3.0)+case when n%3=2 then 1 else 0 end then 2 else 3 end)
  order by commence_time),'[]') from ranked;
$function$;
revoke all on function public.winners_props_plan(text,text) from public, anon, authenticated;
grant execute on function public.winners_props_plan(text,text) to service_role;

create or replace function public.winners_props_plan(p_date text)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$ select public.winners_props_plan(p_date,'main') $function$;

CREATE OR REPLACE FUNCTION public.claim_winners_props(p_date text)
 RETURNS SETOF public.winners_prop_selection_runs
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare plan jsonb; candidates jsonb; prior jsonb; snapshot jsonb; key text; r public.winners_prop_selection_runs; used integer;
 pool text; leagues text[]; cap integer;
begin
 if p_date<'2026-10-08' or p_date<>(clock_timestamp() at time zone 'America/New_York')::date::text then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('winners-props:'||p_date,0));
 if exists(select 1 from public.winners_prop_selection_runs where game_date=p_date and status='selecting' and lease_until>clock_timestamp()) then return;end if;
 update public.winners_prop_selection_runs set status='failed',error='Selection lease expired',completed_at=clock_timestamp(),lease_until=null
  where game_date=p_date and status='selecting';
 foreach pool in array array['main','NBA'] loop
  leagues:=case when pool='NBA' then array['NBA'] else array['MLB','NFL','NCAAF'] end;
  cap:=case when pool='NBA' then 3 else 6 end;
  plan:=public.winners_props_plan(p_date,pool);
  select count(*),coalesce(jsonb_agg(jsonb_build_object('candidate_id',b.candidate_id,'league',b.league,'game_id',b.game_id,
    'pick_snapshot',b.pick_snapshot,'cohort',coalesce((select (v->>'cohort')::integer from jsonb_array_elements(plan) v where (v->>'start')::timestamptz=c.commence_time),1))),'[]')
   into used,prior from public.winners_board b join public.winners_candidates c on c.id=b.candidate_id
   where b.game_date=p_date and b.kind='prop' and b.policy_version<>'darts-top-v1' and b.league=any(leagues);
  if used>=cap then continue;end if;
  candidates:=null;
  select jsonb_agg(to_jsonb(c)||jsonb_build_object('cohort',(w->>'cohort')::integer) order by c.commence_time,c.id) into candidates
  from public.winners_candidates c join public.daily_slate s on s.date::text=c.game_date and s.league=c.league and s.bdl_game_id::text=c.game_id and s.commence_time=c.commence_time
  cross join lateral jsonb_array_elements(plan) w
  where c.game_date=p_date and c.kind='prop' and c.league=any(leagues) and c.admitted_at is null
   and (w->>'start')::timestamptz=c.commence_time and c.commence_time>clock_timestamp()+interval '3 minutes'
   and c.commence_time<=clock_timestamp()+interval '90 minutes' and c.created_at<clock_timestamp()-interval '30 seconds'
   and lower(coalesce(s.game_status,'')) in ('','scheduled','pregame','pre-game','not started')
   and not exists(select 1 from public.winners_prop_selection_runs old cross join lateral jsonb_array_elements(old.input_snapshot->'candidates') v
     where old.game_date=p_date and old.status='completed' and v->'id'=to_jsonb(c.id) and v->'pick_snapshot'=c.pick_snapshot and v->'evidence_snapshot'=c.evidence_snapshot)
   and not exists(select 1 from public.winners_board b where b.game_date=p_date and b.kind='prop' and b.league=c.league and b.market_key=c.market_key);
  if candidates is null then continue;end if;
  -- Wait for peers starting together until T-65, so the fastest job does not win a slot.
  if exists(select 1 from public.daily_slate s where s.date::text=p_date and s.league=any(leagues)
   and s.commence_time>clock_timestamp()+interval '65 minutes' and s.commence_time<=clock_timestamp()+interval '90 minutes'
   and exists(select 1 from jsonb_array_elements(candidates) c where (c->>'commence_time')::timestamptz=s.commence_time)
   and not exists(select 1 from public.winners_candidates c where c.game_date=p_date and c.league=s.league and c.kind='prop' and c.game_id=s.bdl_game_id::text)) then continue;end if;
  snapshot:=jsonb_build_object('pool',pool,'candidates',candidates,'prior',prior,'plan',plan,'capacity',cap-used,'used',used,'observed_at',clock_timestamp());
  key:=md5(jsonb_build_object('date',p_date,'candidates',candidates,'prior',prior,'plan',plan)::text);
  select * into r from public.winners_prop_selection_runs where fingerprint=key for update;
  if found then
   if r.status in ('completed','expired') or r.attempts>=3 or r.completed_at>clock_timestamp()-interval '2 minutes' then continue;end if;
   return query update public.winners_prop_selection_runs set status='selecting',attempts=attempts+1,error=null,lease_until=clock_timestamp()+interval '10 minutes' where id=r.id returning *;
   return;
  end if;
  return query insert into public.winners_prop_selection_runs(game_date,fingerprint,input_snapshot,lease_until)
   values(p_date,key,snapshot,clock_timestamp()+interval '10 minutes') returning *;
  return;
 end loop;
end; $function$;

CREATE OR REPLACE FUNCTION public.finish_winners_props(p_id bigint, p_attempt integer, p_selection jsonb, p_model text, p_ms integer, p_error text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.winners_prop_selection_runs; c public.winners_candidates; original jsonb; item jsonb;
 seen bigint[]:='{}'; chosen bigint[]:='{}'; n integer:=0; used integer; early integer; middle integer; cohort integer; why text;
 pool text; leagues text[]; cap integer; cap_early integer; cap_middle integer; trimmed jsonb:='{}'; last_window boolean; any_clear boolean;
begin
 select * into r from public.winners_prop_selection_runs where id=p_id;
 if not found then return jsonb_build_object('completed',false,'reason','Unknown prop selection');end if;
 perform pg_advisory_xact_lock(hashtextextended('winners-props:'||r.game_date,0));
 select * into r from public.winners_prop_selection_runs where id=p_id for update;
 if r.status='completed' and r.attempts=p_attempt and r.selection=p_selection then return jsonb_build_object('completed',true,'already_recorded',true);end if;
 if r.status<>'selecting' or r.attempts<>p_attempt or r.lease_until<=clock_timestamp() then return jsonb_build_object('completed',false,'reason','Stale selection attempt');end if;
 why:=p_error;
 pool:=coalesce(r.input_snapshot->>'pool','main');
 leagues:=case when pool='NBA' then array['NBA'] else array['MLB','NFL','NCAAF'] end;
 cap:=case when pool='NBA' then 3 else 6 end; cap_early:=case when pool='NBA' then 1 else 2 end; cap_middle:=case when pool='NBA' then 2 else 4 end;
 if why is null then
 begin
  if public.winners_props_plan(r.game_date,pool) is distinct from r.input_snapshot->'plan' then raise exception 'Slate changed during prop selection';end if;
  select count(*) into used from public.winners_board where game_date=r.game_date and kind='prop' and policy_version<>'darts-top-v1' and league=any(leagues);
  if used<>(r.input_snapshot->>'used')::integer then raise exception 'Prop board changed';end if;
  select count(*) filter(where (v->>'cohort')::integer=1),count(*) filter(where (v->>'cohort')::integer<=2)
    into early,middle from jsonb_array_elements(r.input_snapshot->'prior') v;
  if jsonb_typeof(p_selection->'ranked_candidates') is distinct from 'array' or jsonb_array_length(p_selection->'ranked_candidates')<>jsonb_array_length(r.input_snapshot->'candidates') then raise exception 'Incomplete prop comparison';end if;
  -- The run that holds the day's last start time is the pool's last window: the only one where a lean can go on.
  select exists(select 1 from jsonb_array_elements(r.input_snapshot->'candidates') v
    where (v->>'commence_time')::timestamptz=(select max((p->>'start')::timestamptz) from jsonb_array_elements(r.input_snapshot->'plan') p)) into last_window;
  select exists(select 1 from jsonb_array_elements(p_selection->'ranked_candidates') v where v->'selected'='true'::jsonb and v->>'assessment'='clear') into any_clear;
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
    if exists(select 1 from public.winners_candidates prev where (prev.id=any(chosen) or exists(select 1 from public.winners_board b where b.game_date=r.game_date and b.kind='prop' and b.policy_version<>'darts-top-v1' and b.candidate_id=prev.id))
     and prev.league=c.league and lower(trim(prev.pick_snapshot->>'player'))=lower(trim(c.pick_snapshot->>'player'))) then raise exception 'Daily player exposure exceeded';end if;
    if (select count(*) from public.winners_candidates prev where (prev.id=any(chosen) or exists(select 1 from public.winners_board b where b.game_date=r.game_date and b.kind='prop' and b.policy_version<>'darts-top-v1' and b.candidate_id=prev.id))
     and prev.league=c.league and prev.game_id=c.game_id)>=2 then raise exception 'Game prop exposure exceeded';end if;
    cohort:=(original->>'cohort')::integer;
    -- Clear only (Oct 21 2026). A lean goes on only when nothing else would that day: the pool's last window, with
    -- no prop on Winners yet and no clear one in this run, and then only the first. Past the pool's cap (in the
    -- reader's ranked order) a prop is left off too. Both are recorded as trimmed, never a failed run.
    if item->>'assessment'='lean' and not (last_window and used+n=0 and not any_clear) then
     trimmed:=trimmed||jsonb_build_object(c.id::text,'lean: Winners takes clear props only');
    elsif used+n+1>cap or (cohort=1 and early+1>cap_early) or (cohort<=2 and middle+1>cap_middle) then
     trimmed:=trimmed||jsonb_build_object(c.id::text,'past the daily cap');
    else
     if cohort=1 then early:=early+1;end if;
     if cohort<=2 then middle:=middle+1;end if;
     chosen:=array_append(chosen,c.id); n:=n+1;
    end if;
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
  insert into public.winners_decision_events(candidate_id,event,detail) values(c.id,'curated',item
   ||case when trimmed ? c.id::text then jsonb_build_object('selected',false,'trimmed',trimmed->>c.id::text) else '{}'::jsonb end
   ||jsonb_build_object('prop_selection_run_id',r.id,'policy_version',r.policy_version));
  if item->'selected'='true'::jsonb and not trimmed ? c.id::text then
   insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
    values(c.id,c.game_date,c.league,'prop',c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),r.policy_version,item->>'reason');
   update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
   insert into public.winners_decision_events(candidate_id,event,detail) values(c.id,'admitted',item||jsonb_build_object('prop_selection_run_id',r.id,'policy_version',r.policy_version));
  end if;
 end loop;
 update public.winners_prop_selection_runs set status='completed',selection=p_selection,model=p_model,ms=p_ms,error=null,completed_at=clock_timestamp(),lease_until=null where id=r.id;
 return jsonb_build_object('completed',true,'admitted',n);
end; $function$;


-- His five NBA bets a night, spread over the night like the props: the first third of the tip times can take two, the
-- first two thirds four, the rest whatever is left (at least one). A place the early games leave passes to later ones.
CREATE OR REPLACE FUNCTION public.seat_nba_board(p_date text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r record; n integer := 0; why text; n_on integer; cap constant integer := 5;
 plan jsonb; cohort integer; n_early integer; n_middle integer;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  plan := public.winners_props_plan(p_date, 'NBA');
  for r in
    select c.id, c.commence_time, b.rank, b.bets, b.games, b.why as board_why
    from public.winners_candidates c
    join public.winners_nba_board b on b.game_id = c.game_id and b.decision = 'bet' and c.pick_text like b.side || ' %'
    where c.game_date = p_date and c.league = 'NBA' and c.kind = 'game' and c.admitted_at is null
    order by b.rank
  loop
    if exists (select 1 from public.winners_decision_events e where e.candidate_id = r.id and e.event = 'card_seated') then
      why := gary_private.admit_winners_candidate(r.id);   -- a seated pass whose number arrived
      if why = 'admitted' then n := n + 1; end if;
      continue;
    end if;
    if r.rank is null or r.rank > cap then continue; end if;
    select count(*) into n_on from public.winners_board w
    where w.game_date = p_date and w.league = 'NBA' and w.kind = 'game' and w.scratched_at is null;
    if n_on >= cap then continue; end if;
    cohort := coalesce((select (v->>'cohort')::integer from jsonb_array_elements(plan) v where (v->>'start')::timestamptz = r.commence_time limit 1), 3);
    select count(*) filter (where k = 1), count(*) filter (where k <= 2) into n_early, n_middle from (
      select coalesce((select (v->>'cohort')::integer from jsonb_array_elements(plan) v where (v->>'start')::timestamptz = c.commence_time limit 1), 3) k
      from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
      where w.game_date = p_date and w.league = 'NBA' and w.kind = 'game' and w.scratched_at is null) seated;
    if (cohort = 1 and n_early >= 2) or (cohort <= 2 and n_middle >= 4) then continue; end if;
    if r.commence_time is null or r.commence_time <= clock_timestamp() + interval '10 minutes'
       or r.commence_time > clock_timestamp() + interval '28 minutes' then continue; end if;
    if not exists (select 1 from public.winners_late_news x where x.candidate_id = r.id
                   and x.decision in ('clear', 'stand', 'no_feed', 'failed')) then continue; end if;
    insert into public.winners_decision_events(candidate_id, event, detail)
    values (r.id, 'card_seated', jsonb_build_object('board', true, 'league', 'NBA', 'rank', r.rank, 'of', r.bets, 'games', r.games, 'why', r.board_why));
    why := gary_private.admit_winners_candidate(r.id);
    if why = 'admitted' then n := n + 1; end if;
  end loop;
  return n;
end $function$;
