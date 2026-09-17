-- Founder Sep 16: at most six core props across active sports, no quota.
-- This prospective selector preserves original picks and existing game policy.
create table public.winners_prop_selection_runs (
 id bigint generated always as identity primary key,
 game_date text not null, policy_version text not null default 'daily-props-v1' check(policy_version='daily-props-v1'),
 fingerprint text not null unique, input_snapshot jsonb not null,
 status text not null default 'selecting' check(status in ('selecting','completed','failed','expired')),
 attempts integer not null default 1, lease_until timestamptz,
 selection jsonb, model text, error text, ms integer,
 created_at timestamptz not null default clock_timestamp(), completed_at timestamptz
);
alter table public.winners_prop_selection_runs enable row level security;
revoke all on public.winners_prop_selection_runs from public,anon,authenticated;
grant all on public.winners_prop_selection_runs to service_role;
grant usage,select on sequence public.winners_prop_selection_runs_id_seq to service_role;
create index winners_prop_selection_day on public.winners_prop_selection_runs(game_date,status);
create trigger winners_prop_selection_immutable before update or delete on public.winners_prop_selection_runs
 for each row execute function public.guard_winners_selection();

-- A single chronological plan across MLB/NFL/NCAAF. Equal starts stay together.
create function public.winners_props_plan(p_date text) returns jsonb
language sql stable security invoker set search_path='' as $$
 with starts as (
  select distinct commence_time from public.daily_slate where date::text=p_date and league in ('MLB','NFL','NCAAF')
   and commence_time is not null and lower(coalesce(game_status,'')) not in ('cancelled','canceled','postponed')
 ), ranked as (select commence_time,dense_rank() over(order by commence_time) r,count(*) over() n from starts)
 select coalesce(jsonb_agg(jsonb_build_object('start',commence_time,'cohort',case when n=1 then 3 when n=2 then case when r=1 then 1 else 3 end
  when r<=ceil(n/3.0) then 1 when r<=ceil(n/3.0)+floor(n/3.0)+case when n%3=2 then 1 else 0 end then 2 else 3 end)
  order by commence_time),'[]') from ranked;
$$;
create function public.claim_winners_props(p_date text) returns setof public.winners_prop_selection_runs
language plpgsql security invoker set search_path='' as $$
declare plan jsonb; candidates jsonb; prior jsonb; snapshot jsonb; key text; r public.winners_prop_selection_runs; used integer;
begin
 if p_date<'2026-09-16' or p_date<>(clock_timestamp() at time zone 'America/New_York')::date::text then return;end if;
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

create function public.finish_winners_props(p_id bigint,p_attempt integer,p_selection jsonb,p_model text,p_ms integer,p_error text default null) returns jsonb
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

-- Only this selector may publish prospective props; preserve historical policy.
create or replace function public.release_winners_board(p_date text,p_league text,p_kind text) returns integer
language plpgsql security invoker set search_path='' as $$ begin
 if (p_kind='game' and p_date>='2026-09-12') or (p_kind='prop' and p_date>='2026-09-16') then return 0;end if;
 return public.release_winners_board_before_curation(p_date,p_league,p_kind);
end; $$;

-- New game decisions receive one comparative evidence read in the curation
-- worker. Avoid spending two more subscription calls on the superseded review.
create or replace function public.claim_winners_candidate() returns setof public.winners_candidates
language plpgsql security invoker set search_path='' as $$
declare chosen public.winners_candidates;
begin
 select * into chosen from public.winners_candidates c
 where (status='pending' or (status='reviewing' and lease_until<now())
   or (status='unavailable' and review is null and reviewed_at<now()-interval '2 minutes' and nullif(evidence_snapshot->>'deskText','') is not null))
   and ((kind='prop' and game_date<'2026-09-16') or (kind='game' and game_date<'2026-09-12'))
   and admitted_at is null and created_at<now()-interval '30 seconds'
   and (c.policy_version<>'mlb-conviction-v4' or public.mlb_judgment_candidate_ready(c))
   and attempts<2 and commence_time>now()+interval '30 seconds'
 order by commence_time,created_at,id for update skip locked limit 1;
 if not found then return;end if;
 update public.winners_candidates set status='reviewing',attempts=attempts+1,lease_until=now()+interval '15 minutes' where id=chosen.id returning * into chosen;
 insert into public.winners_decision_events(candidate_id,event,detail) values(chosen.id,'review_started',jsonb_build_object('attempt',chosen.attempts));
 return next chosen;
end; $$;

revoke all on function public.winners_props_plan(text),public.claim_winners_props(text),public.finish_winners_props(bigint,integer,jsonb,text,integer,text) from public,anon,authenticated;
grant execute on function public.winners_props_plan(text),public.claim_winners_props(text),public.finish_winners_props(bigint,integer,jsonb,text,integer,text) to service_role;
