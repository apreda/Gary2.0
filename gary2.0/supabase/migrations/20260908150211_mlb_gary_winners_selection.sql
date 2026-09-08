-- MLB: factual eligibility followed by Gary's own comparative selection.
-- Existing publications and all non-MLB-game policies are preserved.
create table public.winners_selection_runs (
  id bigint generated always as identity primary key,
  game_date text not null,
  league text not null default 'MLB' check (league='MLB'),
  kind text not null default 'game' check (kind='game'),
  policy_version text not null default 'mlb-conviction-v3' check (policy_version='mlb-conviction-v3'),
  cohort integer not null check (cohort between 1 and 3),
  window_start timestamptz not null,
  fingerprint text not null unique,
  input_snapshot jsonb not null,
  selection jsonb,
  status text not null default 'selecting' check (status in ('selecting','completed','failed','expired')),
  attempts integer not null default 1,
  lease_until timestamptz,
  model text,
  ms integer,
  error text,
  attempt_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);
create index winners_selection_day on public.winners_selection_runs(game_date,league,kind);
alter table public.winners_selection_runs enable row level security;
revoke all on public.winners_selection_runs from public,anon,authenticated;
grant all on public.winners_selection_runs to service_role;
grant usage,select on sequence public.winners_selection_runs_id_seq to service_role;

create function public.guard_winners_selection() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' or old.status in ('completed','expired') then
    raise exception 'Completed Winners decisions and their evidence are immutable';
  end if;
  return new;
end; $$;
create trigger winners_selection_immutable before update or delete on public.winners_selection_runs
for each row execute function public.guard_winners_selection();

-- Share the existing slate-derived chronological thirds (2 / 4 / 6).
-- Prefix checks reserve real places for later games even if they are not ready.
create function public.mlb_winners_remaining(p_date text,p_cohort integer) returns integer
language plpgsql stable security invoker set search_path='' as $$
declare total_used integer; early_used integer; middle_used integer; available integer;
begin
  if p_cohort is null or p_cohort not between 1 and 3 then return 0; end if;
  select count(*),count(*) filter(where coalesce(public.winners_prop_cohort(p_date,'MLB',c.commence_time),1)=1),
    count(*) filter(where coalesce(public.winners_prop_cohort(p_date,'MLB',c.commence_time),1)<=2)
    into total_used,early_used,middle_used
    from public.winners_board b join public.winners_candidates c on c.id=b.candidate_id
    where b.game_date=p_date and b.league='MLB' and b.kind='game';
  available:=6-total_used;
  if p_cohort<=2 then available:=least(available,4-middle_used); end if;
  if p_cohort=1 then available:=least(available,2-early_used); end if;
  return greatest(0,available);
end; $$;

-- Called at scheduled kickoff T-25. Wait for that batch's in-flight factual
-- reads until T-10; compare every ready future ticket in its slate cohort.
-- A changed candidate set can receive a new comparison; identical completed
-- sets cannot be repeatedly sampled until Gary happens to select something.
create function public.claim_mlb_winners_selection(p_date text,p_window_start timestamptz)
returns setof public.winners_selection_runs
language plpgsql security invoker set search_path='' as $$
declare cohort_no integer; remaining integer; candidates jsonb; slate jsonb; identity_rows jsonb;
  key text; run public.winners_selection_runs; snapshot jsonb; past jsonb; schedule_identity jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('winners:'||p_date||':MLB:game',0));
  if p_date is null or p_window_start is null or p_date<'2026-09-08' or p_date<>(clock_timestamp() at time zone 'America/New_York')::date::text
    or p_window_start<=clock_timestamp()+interval '2 minutes' or p_window_start>clock_timestamp()+interval '25 minutes'
    or not exists(select 1 from public.daily_slate where date::text=p_date and league='MLB' and commence_time=p_window_start)
    or exists(select 1 from public.daily_slate where date::text=p_date and league='MLB' and commence_time is null)
    then return; end if;
  if exists(select 1 from public.winners_selection_runs where game_date=p_date and status='selecting' and lease_until>clock_timestamp()) then return; end if;
  update public.winners_selection_runs set status='failed',error='Selection lease expired',completed_at=clock_timestamp(),lease_until=null,
    attempt_history=attempt_history||jsonb_build_array(jsonb_build_object('attempt',attempts,'error','Selection lease expired','at',clock_timestamp()))
    where game_date=p_date and status='selecting' and lease_until<=clock_timestamp();
  cohort_no:=public.winners_prop_cohort(p_date,'MLB',p_window_start);
  remaining:=public.mlb_winners_remaining(p_date,cohort_no);
  if remaining<=0 then return; end if;
  if p_window_start>clock_timestamp()+interval '10 minutes' and exists(
    select 1 from public.winners_candidates where game_date=p_date and league='MLB' and kind='game'
      and policy_version='mlb-conviction-v3' and status in ('pending','reviewing')
      and commence_time between clock_timestamp() and p_window_start and admitted_at is null
  ) then return; end if;
  if p_window_start>clock_timestamp()+interval '10 minutes' and exists(
    select 1 from public.daily_slate s where s.date::text=p_date and s.league='MLB' and s.commence_time=p_window_start
      and not exists(select 1 from public.winners_candidates c where c.game_date=p_date and c.league='MLB' and c.kind='game'
        and c.game_id=to_jsonb(s)->>'bdl_game_id' and c.commence_time=s.commence_time)
  ) then return; end if;
  select jsonb_agg(to_jsonb(c) order by c.id),jsonb_agg(jsonb_build_object('id',c.id,'ticket',c.ticket_key,'review',c.reviewed_at) order by c.id)
    into candidates,identity_rows from public.winners_candidates c
    where c.game_date=p_date and c.league='MLB' and c.kind='game' and c.policy_version='mlb-conviction-v3'
      and c.pick_snapshot->>'decision_policy'='mlb-judgment-v1'
      and c.review->>'policy_version'='mlb-conviction-v3' and c.review->>'schema_version'='3'
      and c.review->'eligibility_only'='true'::jsonb
      and c.status='qualified' and c.admitted_at is null and c.commence_time>clock_timestamp()+interval '2 minutes'
      and c.reviewed_at<c.commence_time and public.winners_prop_cohort(p_date,'MLB',c.commence_time)=cohort_no
      and exists(select 1 from public.daily_slate s where s.date::text=p_date and s.league='MLB'
        and to_jsonb(s)->>'bdl_game_id'=c.game_id and s.commence_time=c.commence_time
        and lower(coalesce(to_jsonb(s)->>'game_status','')) not in ('live','in_progress','in progress','inprogress','final','completed','cancelled','canceled','postponed','suspended'))
      and not exists(select 1 from public.winners_board b where b.game_date=p_date and b.league='MLB' and b.kind='game' and b.market_key=c.market_key);
  if candidates is null then return; end if;
  -- Admission itself changes the remaining set/capacity. That is not new
  -- evidence and must not cause Gary to re-pick tickets he just declined.
  if not exists(select 1 from jsonb_array_elements(candidates) candidate where not exists(
    select 1 from public.winners_selection_runs previous cross join lateral jsonb_array_elements(previous.input_snapshot->'candidates') considered
    where previous.game_date=p_date and previous.status='completed' and previous.cohort=cohort_no
      and considered->'id'=candidate->'id' and considered->'reviewed_at'=candidate->'reviewed_at'
      and considered->'commence_time'=candidate->'commence_time'
  )) then return; end if;
  select jsonb_agg(to_jsonb(s) order by s.commence_time) into slate from public.daily_slate s where s.date::text=p_date and s.league='MLB';
  select jsonb_agg(jsonb_build_object('id',s->>'bdl_game_id','start',s->>'commence_time') order by s->>'bdl_game_id',s->>'commence_time')
    into schedule_identity from jsonb_array_elements(slate) s;
  key:=md5(jsonb_build_object('date',p_date,'cohort',cohort_no,'candidates',identity_rows,'remaining',remaining,'slate',schedule_identity)::text);
  select * into run from public.winners_selection_runs where fingerprint=key for update;
  if found then
    if run.status in ('completed','expired') or run.attempts>=2 or run.completed_at>clock_timestamp()-interval '1 minute' then return; end if;
    update public.winners_selection_runs set status='selecting',attempts=attempts+1,lease_until=clock_timestamp()+interval '7 minutes',
      completed_at=null,error=null where id=run.id returning * into run;
    return next run; return;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('run_id',r.id,'cohort',r.cohort,'selection',r.selection,'completed_at',r.completed_at) order by r.id),'[]'::jsonb)
    into past from public.winners_selection_runs r where r.game_date=p_date and r.status='completed';
  snapshot:=jsonb_build_object('candidates',candidates,'slate',slate,'previous_selections',past,'observed_at',clock_timestamp(),
    'capacity',jsonb_build_object('remaining',remaining,'total_limit',6,'cohort_limit',cohort_no*2,'already_admitted',
      (select count(*) from public.winners_board where game_date=p_date and league='MLB' and kind='game')));
  insert into public.winners_selection_runs(game_date,cohort,window_start,fingerprint,input_snapshot,lease_until)
    values(p_date,cohort_no,p_window_start,key,snapshot,clock_timestamp()+interval '7 minutes') returning * into run;
  return next run;
end; $$;

-- Validation and publication are one transaction. The model cannot supply an
-- unseen ticket, exceed capacity, alter a price, or publish after first pitch.
create function public.finish_mlb_winners_selection(p_id bigint,p_attempt integer,p_selection jsonb,p_model text,p_ms integer,p_error text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare run public.winners_selection_runs; item jsonb; original jsonb; c public.winners_candidates;
  seen bigint[]:='{}'; chosen bigint[]:='{}'; position integer:=0; skipped boolean:=false;
  available integer; why text; finish_status text:='failed'; n integer; current_slate jsonb;
begin
  select * into run from public.winners_selection_runs where id=p_id;
  if not found then return jsonb_build_object('completed',false,'reason','Unknown selection'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('winners:'||run.game_date||':MLB:game',0));
  select * into run from public.winners_selection_runs where id=p_id for update;
  if run.status<>'selecting' or run.attempts is distinct from p_attempt or run.lease_until is null or run.lease_until<=clock_timestamp() then return jsonb_build_object('completed',false,'reason','Stale selection attempt'); end if;
  if p_error is not null then why:=left(p_error,2000);
  else
    begin
      if jsonb_typeof(p_selection->'ranked_candidates') is distinct from 'array' or jsonb_typeof(p_selection->'summary') is distinct from 'string' or length(trim(coalesce(p_selection->>'summary','')))<10 then raise exception 'Missing complete selection and summary'; end if;
      if jsonb_array_length(p_selection->'ranked_candidates')<>jsonb_array_length(run.input_snapshot->'candidates') then raise exception 'Every considered candidate requires an explicit decision'; end if;
      select jsonb_agg(to_jsonb(s) order by s.commence_time) into current_slate from public.daily_slate s where s.date::text=run.game_date and s.league='MLB';
      -- Only schedule/identity changes invalidate a batch; live odds updates
      -- cannot reprice an original ticket or change its preserved decision.
      if (select jsonb_agg(jsonb_build_object('id',s->>'bdl_game_id','start',s->>'commence_time') order by s->>'bdl_game_id',s->>'commence_time') from jsonb_array_elements(current_slate) s)
        is distinct from (select jsonb_agg(jsonb_build_object('id',s->>'bdl_game_id','start',s->>'commence_time') order by s->>'bdl_game_id',s->>'commence_time') from jsonb_array_elements(run.input_snapshot->'slate') s)
        then raise exception 'Slate schedule changed during selection'; end if;
      for item in select value from jsonb_array_elements(p_selection->'ranked_candidates') loop
        position:=position+1;
        if jsonb_typeof(item->'candidate_id') is distinct from 'number' or (item->>'candidate_id')!~'^[0-9]+$'
          or jsonb_typeof(item->'rank') is distinct from 'number' or (item->>'rank')!~'^[0-9]+$' or (item->>'rank')::integer<>position
          or jsonb_typeof(item->'selected') is distinct from 'boolean'
          or jsonb_typeof(item->'reason') is distinct from 'string' or jsonb_typeof(item->'expected_outcome') is distinct from 'string'
          or jsonb_typeof(item->'comparison') is distinct from 'string'
          or length(trim(coalesce(item->>'reason','')))<10 or length(trim(coalesce(item->>'expected_outcome','')))<8
          or length(trim(coalesce(item->>'comparison','')))<10 then raise exception 'Incomplete candidate judgment'; end if;
        if (item->>'candidate_id')::bigint=any(seen) then raise exception 'Duplicate candidate'; end if;
        seen:=array_append(seen,(item->>'candidate_id')::bigint);
        select value into original from jsonb_array_elements(run.input_snapshot->'candidates') where (value->>'id')::bigint=(item->>'candidate_id')::bigint;
        if original is null then raise exception 'Unseen candidate'; end if;
        select * into c from public.winners_candidates where id=(item->>'candidate_id')::bigint for update;
        if not found or c.status<>'qualified' or c.admitted_at is not null or c.policy_version<>'mlb-conviction-v3'
          or c.game_date is distinct from run.game_date or c.league<>'MLB' or c.kind<>'game'
          or c.game_id is distinct from original->>'game_id' or c.market_key is distinct from original->>'market_key'
          or c.odds is distinct from (original->>'odds')::integer or c.reviewed_at is distinct from (original->>'reviewed_at')::timestamptz
          or c.pick_snapshot is distinct from original->'pick_snapshot' or c.review is distinct from original->'review'
          or c.evidence_snapshot is distinct from original->'evidence_snapshot' or c.ticket_key<>original->>'ticket_key'
          or c.commence_time is distinct from (original->>'commence_time')::timestamptz then raise exception 'Candidate changed during selection'; end if;
        if not exists(select 1 from public.daily_slate s where s.date::text=run.game_date and s.league='MLB'
          and to_jsonb(s)->>'bdl_game_id'=c.game_id and s.commence_time=c.commence_time
          and lower(coalesce(to_jsonb(s)->>'game_status','')) not in ('live','in_progress','in progress','inprogress','final','completed','cancelled','canceled','postponed','suspended'))
          then raise exception 'Candidate no longer on active slate'; end if;
        if c.commence_time<=clock_timestamp()+interval '30 seconds' then finish_status:='expired'; raise exception 'Selection did not finish before kickoff'; end if;
        if (item->>'selected')::boolean then
          if skipped then raise exception 'Selected tickets must be the strongest prefix of Gary''s ranking'; end if;
          chosen:=array_append(chosen,c.id);
        else skipped:=true; end if;
      end loop;
      available:=least((run.input_snapshot->'capacity'->>'remaining')::integer,public.mlb_winners_remaining(run.game_date,run.cohort));
      if cardinality(chosen)>available then raise exception 'Selection exceeds reserved capacity'; end if;
      if nullif(trim(p_model),'') is null or p_ms is null or p_ms<0 then raise exception 'Selection model and duration must be recorded'; end if;
    exception when others then why:=sqlerrm;
    end;
  end if;
  if why is not null then
    update public.winners_selection_runs set status=finish_status,error=why,model=p_model,ms=p_ms,completed_at=clock_timestamp(),lease_until=null,
      attempt_history=attempt_history||jsonb_build_array(jsonb_build_object('attempt',p_attempt,'error',why,'selection',p_selection,'model',p_model,'at',clock_timestamp())) where id=p_id;
    return jsonb_build_object('completed',false,'reason',why,'status',finish_status);
  end if;
  n:=0;
  for item in select value from jsonb_array_elements(p_selection->'ranked_candidates') loop
    select * into c from public.winners_candidates where id=(item->>'candidate_id')::bigint;
    insert into public.winners_decision_events(candidate_id,event,detail) values(c.id,
      case when (item->>'selected')::boolean then 'gary_selected' else 'gary_not_selected' end,
      item||jsonb_build_object('selection_run_id',run.id,'window_start',run.window_start,'cohort',run.cohort,'model',p_model,'policy_version',run.policy_version));
    if (item->>'selected')::boolean then
      insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
        values(c.id,c.game_date,c.league,c.kind,c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),run.policy_version,
          (item->>'reason')||' '||(item->>'comparison'));
      update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
      insert into public.winners_decision_events(candidate_id,event,detail)
        values(c.id,'admitted',item||jsonb_build_object('selection_run_id',run.id,'policy_version',run.policy_version,'price',c.odds));
      n:=n+1;
    end if;
  end loop;
  update public.winners_selection_runs set status='completed',selection=p_selection,model=p_model,ms=p_ms,error=null,completed_at=clock_timestamp(),lease_until=null,
    attempt_history=attempt_history||jsonb_build_array(jsonb_build_object('attempt',p_attempt,'selection',p_selection,'model',p_model,'at',clock_timestamp())) where id=p_id;
  return jsonb_build_object('completed',true,'admitted',n,'selection_run_id',p_id);
end; $$;

revoke all on function public.guard_winners_selection() from public,anon,authenticated;
revoke all on function public.mlb_winners_remaining(text,integer),public.claim_mlb_winners_selection(text,timestamptz),
  public.finish_mlb_winners_selection(bigint,integer,jsonb,text,integer,text) from public,anon,authenticated;
grant execute on function public.mlb_winners_remaining(text,integer),public.claim_mlb_winners_selection(text,timestamptz),
  public.finish_mlb_winners_selection(bigint,integer,jsonb,text,integer,text) to service_role;

create or replace function public.release_winners_board(p_date text, p_league text, p_kind text) returns integer
language plpgsql security invoker set search_path = '' as $$
declare capacity integer; used integer; admitted integer := 0; c public.winners_candidates;
  cohort integer; prefix_used integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('winners:'||p_date||':'||p_league||':'||p_kind,0));
  if p_league='MLB' and p_kind='game' and p_date>='2026-09-08' then
    -- Factual qualification can never auto-admit MLB after the cutover.
    for c in select * from public.winners_candidates where game_date=p_date and league='MLB' and kind='game'
      and admitted_at is null and status in ('pending','reviewing','qualified') and commence_time<=clock_timestamp() for update
    loop
      update public.winners_candidates set status='expired',reason=case when c.status='qualified'
        then 'Factual eligibility recorded; not admitted by Gary before kickoff' else 'No completed factual review before kickoff' end,
        lease_until=null where id=c.id;
      insert into public.winners_decision_events(candidate_id,event,detail)
        values(c.id,'expired',jsonb_build_object('previous_status',c.status,'policy_version',c.policy_version));
    end loop;
    return 0;
  end if;
  capacity := public.winners_capacity(p_date,p_league,p_kind);
  select count(*) into used from public.winners_board where game_date=p_date and league=p_league and kind=p_kind;
  for c in select * from public.winners_candidates
    where game_date=p_date and league=p_league and kind=p_kind and status='qualified'
      and admitted_at is null and commence_time > now() and reviewed_at < commence_time
    order by case when jsonb_typeof(pick_snapshot->'confidence')='number' then (pick_snapshot->>'confidence')::numeric else 0 end desc,
      reviewed_at, id for update
  loop
    exit when used >= capacity;
    if exists(select 1 from public.winners_board where game_date=p_date and league=p_league and kind=p_kind and market_key=c.market_key) then continue; end if;
    if p_kind='prop' then
      cohort := public.winners_prop_cohort(p_date,p_league,c.commence_time);
      if cohort is null then continue; end if;
      -- Every affected prefix must remain within its limit. Checking only
      -- the candidate's own cohort would let two early picks follow four
      -- middle picks and consume the late reservation.
      if cohort<=2 then
        select count(*) into prefix_used from public.winners_board b
          join public.winners_candidates previous on previous.id=b.candidate_id
          where b.game_date=p_date and b.league=p_league and b.kind='prop'
            and coalesce(public.winners_prop_cohort(p_date,p_league,previous.commence_time),1)<=2;
        if prefix_used>=4 then continue; end if;
      end if;
      if cohort=1 then
        select count(*) into prefix_used from public.winners_board b
          join public.winners_candidates previous on previous.id=b.candidate_id
          where b.game_date=p_date and b.league=p_league and b.kind='prop'
            and coalesce(public.winners_prop_cohort(p_date,p_league,previous.commence_time),1)=1;
        if prefix_used>=2 then continue; end if;
      end if;
    end if;
    insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
      values(c.id,c.game_date,c.league,c.kind,c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,now(),c.policy_version,coalesce(c.reason,'Exact-ticket review qualified'));
    update public.winners_candidates set admitted_at=now() where id=c.id;
    insert into public.winners_decision_events(candidate_id,event,detail)
      values(c.id,'admitted',jsonb_build_object('capacity',capacity,'cohort',cohort,'price',c.odds,'policy_version',c.policy_version));
    used := used+1; admitted := admitted+1;
  end loop;
  for c in select * from public.winners_candidates
    where game_date=p_date and league=p_league and kind=p_kind and admitted_at is null
      and status in ('pending','reviewing','qualified') and commence_time <= now() for update
  loop
    update public.winners_candidates set status='expired', reason=case when c.status='qualified' then 'Qualified; no slot before kickoff' else 'No completed review before kickoff' end, lease_until=null where id=c.id;
    insert into public.winners_decision_events(candidate_id,event,detail)
      values(c.id,'expired',jsonb_build_object('previous_status',c.status));
  end loop;
  return admitted;
end; $$;
