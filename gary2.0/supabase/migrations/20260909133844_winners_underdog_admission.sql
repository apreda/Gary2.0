-- Winners game admission from September 9, 2026 (founder direction, Sep 9):
-- every underdog moneyline and every plus-line spread/run-line ticket is admitted
-- as soon as it is a valid future ticket, whatever the factual reviewer said.
-- Favorites then fill by confidence toward a daily target of five, opening
-- 2/4/5 places with the slate clock so early games cannot take the whole day.
-- The reviewer and Gary's comparative read keep recording; they no longer gate
-- game admission. Props keep their review-gated path. Published rows stay immutable.

create or replace function public.winners_plus_ticket(p_snapshot jsonb, p_odds integer) returns text
language plpgsql immutable set search_path='' as $$
declare t text := lower(coalesce(p_snapshot->>'type','moneyline')); line numeric;
begin
  if t='spread' then
    begin line := (p_snapshot->>'spread')::numeric; exception when others then line := null; end;
    if line is not null and line > 0 then return 'plus_line'; end if;
    return null;
  end if;
  if t in ('moneyline','ml','') and p_odds is not null and p_odds > 0 then return 'underdog'; end if;
  return null;
end; $$;

create or replace function public.winners_game_fill_capacity(p_date text, p_league text) returns integer
language plpgsql stable security invoker set search_path='' as $$
declare starts timestamptz[]; n integer; middle_at timestamptz; late_at timestamptz;
begin
  select array_agg(t order by t) into starts from
    (select distinct commence_time::timestamptz t from public.daily_slate
     where date::text=p_date and league=p_league and commence_time is not null) s;
  n := coalesce(array_length(starts,1),0);
  if n<=1 then return 5; end if;
  middle_at := starts[(n/3)+1] - interval '90 minutes';
  late_at := starts[((2*n)/3)+1] - interval '90 minutes';
  if now() >= late_at then return 5; end if;
  if now() >= middle_at then return 4; end if;
  return 2;
end; $$;

create or replace function public.release_winners_board(p_date text, p_league text, p_kind text) returns integer
language plpgsql security invoker set search_path = '' as $$
declare capacity integer; used integer; admitted integer := 0; c public.winners_candidates;
  cohort integer; prefix_used integer; rule text; confidence numeric;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('winners:'||p_date||':'||p_league||':'||p_kind,0));
  if p_kind='game' and p_date>='2026-09-09' then
    -- 1. Automatic admissions: underdog moneylines and plus-line tickets.
    for c in select * from public.winners_candidates
      where game_date=p_date and league=p_league and kind='game' and admitted_at is null
        and commence_time > clock_timestamp() and coalesce(game_id,'')<>'' and odds is not null
        and not (status='unavailable' and reason='Missing exact game identity, ticket price, or kickoff')
        and public.winners_plus_ticket(pick_snapshot,odds) is not null
      order by commence_time, id for update
    loop
      if exists(select 1 from public.winners_board where game_date=p_date and league=p_league and kind='game' and market_key=c.market_key) then continue; end if;
      rule := public.winners_plus_ticket(c.pick_snapshot,c.odds);
      insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
        values(c.id,c.game_date,c.league,c.kind,c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),c.policy_version,
          case rule when 'underdog' then 'Underdog moneyline at +'||c.odds||'; automatic Winners admission'
            else 'Plus-line ticket +'||(c.pick_snapshot->>'spread')||'; automatic Winners admission' end);
      update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
      insert into public.winners_decision_events(candidate_id,event,detail)
        values(c.id,'admitted',jsonb_build_object('rule',rule,'price',c.odds,'policy_version',c.policy_version,'review_status',c.status));
      admitted := admitted+1;
    end loop;
    -- 2. Confidence fill toward the daily target, as the slate clock opens.
    capacity := public.winners_game_fill_capacity(p_date,p_league);
    select count(*) into used from public.winners_board where game_date=p_date and league=p_league and kind='game';
    for c in select * from public.winners_candidates
      where game_date=p_date and league=p_league and kind='game' and admitted_at is null
        and commence_time > clock_timestamp() and coalesce(game_id,'')<>'' and odds is not null and status<>'expired'
        and not (status='unavailable' and reason='Missing exact game identity, ticket price, or kickoff')
        and public.winners_plus_ticket(pick_snapshot,odds) is null
      order by case when jsonb_typeof(pick_snapshot->'confidence')='number' then (pick_snapshot->>'confidence')::numeric else 0 end desc,
        commence_time, id for update
    loop
      exit when used >= capacity;
      if exists(select 1 from public.winners_board where game_date=p_date and league=p_league and kind='game' and market_key=c.market_key) then continue; end if;
      confidence := case when jsonb_typeof(c.pick_snapshot->'confidence')='number' then (c.pick_snapshot->>'confidence')::numeric else 0 end;
      insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
        values(c.id,c.game_date,c.league,c.kind,c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),c.policy_version,
          'Confidence fill '||to_char(confidence,'FM0.00')||'; daily Winners target');
      update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
      insert into public.winners_decision_events(candidate_id,event,detail)
        values(c.id,'admitted',jsonb_build_object('rule','confidence_fill','fill_capacity',capacity,'confidence',confidence,'price',c.odds,'policy_version',c.policy_version,'review_status',c.status));
      used := used+1; admitted := admitted+1;
    end loop;
    -- 3. Kickoff closes the day's remaining candidates.
    for c in select * from public.winners_candidates
      where game_date=p_date and league=p_league and kind='game' and admitted_at is null
        and status in ('pending','reviewing','qualified','rejected') and commence_time <= clock_timestamp() for update
    loop
      update public.winners_candidates set status='expired', reason=case when c.status='rejected' then coalesce(c.reason,'')||' (no fill place before kickoff)'
        when c.status='qualified' then 'Qualified; no fill place before kickoff' else 'No fill place before kickoff' end, lease_until=null where id=c.id;
      insert into public.winners_decision_events(candidate_id,event,detail)
        values(c.id,'expired',jsonb_build_object('previous_status',c.status,'rule','kickoff'));
    end loop;
    return admitted;
  end if;
  if p_league='MLB' and p_kind='game' and p_date>='2026-09-08' then
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

create or replace function public.claim_mlb_winners_selection(p_date text,p_window_start timestamptz)
returns setof public.winners_selection_runs
language plpgsql security invoker set search_path='' as $$
declare cohort_no integer; remaining integer; candidates jsonb; slate jsonb; identity_rows jsonb;
  key text; run public.winners_selection_runs; snapshot jsonb; past jsonb; schedule_identity jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('winners:'||p_date||':MLB:game',0));
  -- From September 9 game admission is rule-based (underdogs, plus lines, confidence fill); the comparative read no longer gates it.
  if p_date>='2026-09-09' then return; end if;
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

revoke all on function public.winners_plus_ticket(jsonb,integer) from public,anon,authenticated;
revoke all on function public.winners_game_fill_capacity(text,text) from public,anon,authenticated;
grant execute on function public.winners_plus_ticket(jsonb,integer), public.winners_game_fill_capacity(text,text) to service_role;
