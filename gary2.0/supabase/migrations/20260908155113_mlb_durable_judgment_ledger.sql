-- Durable MLB judgment phases: the server clock and append-only events prove
-- which judgment existed before the next stage and before first pitch.
create table public.mlb_judgment_runs (
  run_id uuid primary key,
  game_date text not null,
  game_id text not null,
  league text not null default 'MLB' check (league='MLB'),
  policy_version text not null default 'mlb-judgment-v2' check (policy_version='mlb-judgment-v2'),
  model text not null,
  prompt_sha text not null,
  commence_time timestamptz not null,
  source_snapshot jsonb not null,
  source_sha256 text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index mlb_judgment_runs_game on public.mlb_judgment_runs(game_date,game_id);
create table public.mlb_judgment_events (
  event_id bigint generated always as identity primary key,
  run_id uuid not null references public.mlb_judgment_runs(run_id),
  phase text not null check (phase in ('initial_commit','factual_research','stress_test','price_assessment','published','failed')),
  payload jsonb not null,
  payload_sha256 text not null,
  previous_hash text,
  recorded_at timestamptz not null default clock_timestamp(),
  unique(run_id,phase)
);
create index mlb_judgment_events_order on public.mlb_judgment_events(run_id,event_id);

create function public.guard_mlb_judgment_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'Original MLB judgment records are immutable'; end; $$;
create trigger mlb_judgment_runs_immutable before update or delete on public.mlb_judgment_runs
for each row execute function public.guard_mlb_judgment_immutable();
create trigger mlb_judgment_events_immutable before update or delete on public.mlb_judgment_events
for each row execute function public.guard_mlb_judgment_immutable();
alter table public.mlb_judgment_runs enable row level security;
alter table public.mlb_judgment_events enable row level security;
revoke all on public.mlb_judgment_runs,public.mlb_judgment_events from public,anon,authenticated,service_role;
grant select on public.mlb_judgment_runs,public.mlb_judgment_events to service_role;
revoke all on sequence public.mlb_judgment_events_event_id_seq from public,anon,authenticated,service_role;

-- Default timestamp is materialized before this trigger: the last clock check
-- validates the actual saved event time, including a boundary during INSERT.
create function public.guard_mlb_judgment_event_time() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.phase<>'failed' and not exists(select 1 from public.mlb_judgment_runs r
    where r.run_id=new.run_id and new.recorded_at>=r.created_at and new.recorded_at<r.commence_time)
    then raise exception 'Judgment event did not arrive before first pitch'; end if;
  return new;
end; $$;
create trigger mlb_judgment_event_time before insert on public.mlb_judgment_events
for each row execute function public.guard_mlb_judgment_event_time();
revoke all on function public.guard_mlb_judgment_event_time() from public,anon,authenticated,service_role;

create function public.mlb_judgment_hash(p_payload jsonb) returns text
language sql immutable security invoker set search_path='' as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_payload::text,'UTF8')),'hex')
$$;

create function public.mlb_judgment_receipt(p_event public.mlb_judgment_events) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('ok',true,'run_id',p_event.run_id,'phase',p_event.phase,'recorded_at',p_event.recorded_at,'payload_sha256',p_event.payload_sha256)
$$;

-- Validation is shared by the privileged append functions. Client timestamps
-- remain evidence, but never supply authoritative event times.
create function public.validate_mlb_judgment_payload(p_run public.mlb_judgment_runs,p_phase text,p_payload jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare body jsonb:=p_payload->'data'; item jsonb; ticket jsonb; previous_ticket text; saved jsonb; expected_side text;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(body) is distinct from 'object'
    or p_payload->>'odds_visibility' is distinct from 'odds_visible'
    or nullif(p_payload->>'recorded_at','') is null
    or (p_phase<>'failed' and (p_payload->>'recorded_at')::timestamptz>=p_run.commence_time)
    or p_payload->>'schema_version' is distinct from '1' or p_payload->>'policy_version' is distinct from p_run.policy_version
    or p_payload->>'game_id' is distinct from p_run.game_id or p_payload->>'game_date' is distinct from p_run.game_date
    then raise exception 'Judgment phase does not match its original run'; end if;
  if p_phase in ('initial_commit','stress_test') then
    if coalesce(body->>'winner','') not in ('home','away') or nullif(trim(body->>'whole_game_view'),'') is null
      or jsonb_typeof(body->'expectations') is distinct from 'object' then raise exception 'Missing original game judgment'; end if;
    if (select count(*) from jsonb_object_keys(body->'expectations'))<>4 then raise exception 'Exactly four original expectations are required'; end if;
    for item in select jsonb_build_object('id',key,'expectation',body->'expectations'->key)
      from unnest(array['opening','middle','finish','offense']) key loop
      if jsonb_typeof(item->'expectation') is distinct from 'object'
        or nullif(trim(item->'expectation'->>'claim'),'') is null
        or nullif(trim(item->'expectation'->>'evidence'),'') is null
        or nullif(trim(item->'expectation'->>'disconfirming_observation'),'') is null
        then raise exception 'Each game expectation needs its claim, evidence and disconfirmation'; end if;
    end loop;
    select value into ticket from jsonb_array_elements(p_run.source_snapshot->'allowedTickets') where value->>'id'=body->>'ticket_id';
    if ticket is null then raise exception 'Judgment selected a ticket outside its original menu'; end if;
    if (ticket->>'type'='moneyline' or (ticket->>'line')::numeric=-1.5) and ticket->>'side' is distinct from body->>'winner'
      then raise exception 'Selected winning outcome contradicts the committed side'; end if;
    if p_phase='initial_commit' then
      if jsonb_typeof(body->'factual_questions') is distinct from 'array' or jsonb_array_length(body->'factual_questions')>2
        or nullif(trim(body->>'strongest_opposing_case'),'') is null or nullif(trim(body->>'uncertain_assumption'),'') is null
        then raise exception 'Initial judgment requires opposing context and at most two factual questions'; end if;
    else
      if jsonb_typeof(body->'changed_side') is distinct from 'boolean' or jsonb_typeof(body->'revision_evidence') is distinct from 'array'
        or nullif(trim(body->'strongest_alternative'->>'scenario'),'') is null
        or nullif(trim(body->'strongest_alternative'->>'effect_on_expected_outcome'),'') is null
        or nullif(trim(body->'strongest_alternative'->>'response'),'') is null
        then raise exception 'Stress test requires a concrete alternative and revision evidence'; end if;
      select payload->'data' into saved from public.mlb_judgment_events where run_id=p_run.run_id and phase='initial_commit';
      if (body->>'changed_side')::boolean is distinct from ((body->>'winner') is distinct from (saved->>'winner') or (body->>'ticket_id') is distinct from (saved->>'ticket_id'))
        then raise exception 'Stress-test side change flag conflicts with its original judgment'; end if;
      if ((body->>'winner') is distinct from (saved->>'winner') or (body->>'ticket_id') is distinct from (saved->>'ticket_id'))
        and jsonb_array_length(body->'revision_evidence')=0 then raise exception 'A changed judgment needs original or targeted factual evidence'; end if;
      for item in select value from jsonb_array_elements(body->'revision_evidence') loop
        if coalesce(item->>'source','') not in ('original_evidence','targeted_research') or nullif(trim(item->>'evidence'),'') is null
          or nullif(trim(item->>'effect_on_baseball_view'),'') is null then raise exception 'Incomplete judgment revision evidence'; end if;
      end loop;
    end if;
  elsif p_phase='factual_research' then
    if coalesce(body->>'status','') not in ('completed','unavailable','not_requested') or jsonb_typeof(body->'questions') is distinct from 'array'
      or not (body ? 'results') then raise exception 'Incomplete factual research record'; end if;
  elsif p_phase='price_assessment' then
    select payload->'data'->>'ticket_id' into previous_ticket from public.mlb_judgment_events where run_id=p_run.run_id and phase='stress_test';
    if body->>'ticket_id' is distinct from previous_ticket or coalesce(body->>'decision','') not in ('endorse','decline')
      or nullif(trim(body->>'reason'),'') is null then raise exception 'Price assessment must endorse or decline the unchanged stress-test ticket'; end if;
  elsif p_phase='published' then
    saved:=body->'final_pick_snapshot';
    select payload->'data' into item from public.mlb_judgment_events where run_id=p_run.run_id and phase='price_assessment';
    select value into ticket from jsonb_array_elements(p_run.source_snapshot->'allowedTickets') where value->>'id'=item->>'ticket_id';
    if jsonb_typeof(saved) is distinct from 'object' or saved->>'judgment_run_id' is distinct from p_run.run_id::text
      or saved->>'model' is distinct from p_run.model or saved->>'prompt_sha' is distinct from p_run.prompt_sha
      or saved->>'odds_visibility' is distinct from 'odds_visible'
      or saved->>'decision_policy' is distinct from p_run.policy_version or saved->>'price_endorsement' is distinct from item->>'decision'
      or coalesce(saved->>'game_id',saved->>'bdl_game_id') is distinct from p_run.game_id
      or upper(coalesce(saved->>'league',saved->>'sport',''))<>'MLB'
      or (saved->>'commence_time')::timestamptz is distinct from p_run.commence_time
      or saved->>'pick' is distinct from ticket->>'pick' or saved->>'type' is distinct from ticket->>'type'
      or (saved->>'odds')::numeric is distinct from (ticket->>'odds')::numeric
      or (ticket->>'type'='spread' and coalesce(saved->>'spread',saved->>'line')::numeric is distinct from (ticket->>'line')::numeric)
      or nullif(trim(saved->>'rationale'),'') is null then raise exception 'Published pick does not match its exact committed ticket'; end if;
    if not exists(select 1 from public.daily_picks day cross join lateral jsonb_array_elements(day.picks) pick
      where day.date::text=p_run.game_date and pick=saved) then raise exception 'Published phase requires the exact confirmed public pick'; end if;
  elsif p_phase='failed' then
    if nullif(trim(body->>'error'),'') is null then raise exception 'Failed judgment requires its recorded error'; end if;
  else raise exception 'Unknown judgment phase';
  end if;
end; $$;

-- Only service_role can execute these RPCs. Direct INSERT is not granted:
-- SECURITY DEFINER owns the narrow atomic append, never a client-supplied clock.
create function public.start_mlb_judgment(p_run_id uuid,p_game_date text,p_game_id text,p_commence_time timestamptz,
  p_model text,p_prompt_sha text,p_source_snapshot jsonb,p_initial_judgment jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run public.mlb_judgment_runs; event public.mlb_judgment_events; ticket jsonb; ids text[]:='{}'; sides text[]:='{}';
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mlb-judgment:'||p_run_id::text,0));
  select * into run from public.mlb_judgment_runs where run_id=p_run_id;
  if found then
    select * into event from public.mlb_judgment_events where run_id=p_run_id and phase='initial_commit';
    if run.game_date is distinct from p_game_date or run.game_id is distinct from p_game_id or run.commence_time is distinct from p_commence_time
      or run.model is distinct from p_model or run.prompt_sha is distinct from p_prompt_sha or run.source_snapshot is distinct from p_source_snapshot
      or event.payload is distinct from p_initial_judgment then raise exception 'Run UUID already identifies a different original judgment'; end if;
    return public.mlb_judgment_receipt(event);
  end if;
  if p_run_id is null or nullif(trim(p_game_id),'') is null or nullif(trim(p_model),'') is null or nullif(trim(p_prompt_sha),'') is null
    or p_commence_time is null or p_commence_time<=clock_timestamp() or p_game_date is distinct from (p_commence_time at time zone 'America/New_York')::date::text
    or p_game_date<(clock_timestamp() at time zone 'America/New_York')::date::text
    then raise exception 'A new MLB judgment requires a future exact game and model identity'; end if;
  if jsonb_typeof(p_source_snapshot) is distinct from 'object' or p_source_snapshot->>'odds_visibility' is distinct from 'odds_visible'
    or coalesce(p_source_snapshot->>'gameKind','') not in ('moneyline','runline')
    or jsonb_typeof(p_source_snapshot->'allowedTickets') is distinct from 'array' or jsonb_array_length(p_source_snapshot->'allowedTickets')=0
    or jsonb_array_length(p_source_snapshot->'allowedTickets')>2
    or nullif(trim(p_source_snapshot->>'deskText'),'') is null then raise exception 'Original source snapshot and allowed ticket menu are required'; end if;
  for ticket in select value from jsonb_array_elements(p_source_snapshot->'allowedTickets') loop
    if nullif(trim(ticket->>'id'),'') is null or ticket->>'id'=any(ids) or coalesce(ticket->>'side','') not in ('home','away') or ticket->>'side'=any(sides)
      or coalesce(ticket->>'type','') not in ('moneyline','spread')
      or (p_source_snapshot->>'gameKind'='moneyline' and ticket->>'type' is distinct from 'moneyline')
      or (p_source_snapshot->>'gameKind'='runline' and ticket->>'type' is distinct from 'spread') or nullif(trim(ticket->>'pick'),'') is null
      or jsonb_typeof(ticket->'odds') is distinct from 'number' or (ticket->>'odds')!~'^-?[0-9]+$' or abs((ticket->>'odds')::numeric)<100
      or (ticket->>'type'='moneyline' and ((ticket->>'odds')::numeric < -179 or ticket->'line' is distinct from 'null'::jsonb))
      or (ticket->>'type'='spread' and (jsonb_typeof(ticket->'line') is distinct from 'number' or (ticket->>'line')::numeric not in (-1.5,1.5)))
      then raise exception 'Allowed ticket menu violates exact MLB market identity or the house limit'; end if;
    ids:=array_append(ids,ticket->>'id'); sides:=array_append(sides,ticket->>'side');
  end loop;
  if p_source_snapshot->>'gameKind'='runline' and (cardinality(ids)<>2 or
    (select sum((t->>'line')::numeric) from jsonb_array_elements(p_source_snapshot->'allowedTickets') t)<>0)
    then raise exception 'Original run-line menu requires both opposing exact tickets'; end if;
  insert into public.mlb_judgment_runs(run_id,game_date,game_id,model,prompt_sha,commence_time,source_snapshot,source_sha256)
    values(p_run_id,p_game_date,p_game_id,p_model,p_prompt_sha,p_commence_time,p_source_snapshot,public.mlb_judgment_hash(p_source_snapshot)) returning * into run;
  perform public.validate_mlb_judgment_payload(run,'initial_commit',p_initial_judgment);
  if clock_timestamp()>=run.commence_time then raise exception 'Initial judgment missed first pitch'; end if;
  insert into public.mlb_judgment_events(run_id,phase,payload,payload_sha256)
    values(p_run_id,'initial_commit',p_initial_judgment,public.mlb_judgment_hash(p_initial_judgment)) returning * into event;
  return public.mlb_judgment_receipt(event);
end; $$;

create function public.append_mlb_judgment_phase(p_run_id uuid,p_phase text,p_payload jsonb,p_expected_previous_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run public.mlb_judgment_runs; previous public.mlb_judgment_events; event public.mlb_judgment_events; expected text;
begin
  select * into run from public.mlb_judgment_runs where run_id=p_run_id for update;
  if not found then raise exception 'Unknown original MLB judgment run'; end if;
  select * into event from public.mlb_judgment_events where run_id=p_run_id and phase=p_phase;
  if found then
    if event.payload is distinct from p_payload or event.previous_hash is distinct from p_expected_previous_hash then raise exception 'A recorded judgment phase cannot be rewritten'; end if;
    return public.mlb_judgment_receipt(event);
  end if;
  select * into previous from public.mlb_judgment_events where run_id=p_run_id order by event_id desc limit 1;
  if previous.phase in ('published','failed') then raise exception 'Judgment run already reached a terminal phase'; end if;
  expected:=case previous.phase when 'initial_commit' then 'factual_research' when 'factual_research' then 'stress_test' when 'stress_test' then 'price_assessment' when 'price_assessment' then 'published' end;
  if previous.payload_sha256 is distinct from p_expected_previous_hash or (p_phase is distinct from expected and p_phase is distinct from 'failed')
    then raise exception 'Judgment phase is out of order or missing its durable prior receipt'; end if;
  if p_phase<>'failed' and clock_timestamp()>=run.commence_time then raise exception 'Judgment phase missed first pitch'; end if;
  perform public.validate_mlb_judgment_payload(run,p_phase,p_payload);
  if p_phase<>'failed' and clock_timestamp()>=run.commence_time then raise exception 'Judgment phase missed first pitch'; end if;
  insert into public.mlb_judgment_events(run_id,phase,payload,payload_sha256,previous_hash)
    values(p_run_id,p_phase,p_payload,public.mlb_judgment_hash(p_payload),previous.payload_sha256) returning * into event;
  return public.mlb_judgment_receipt(event);
end; $$;

revoke all on function public.guard_mlb_judgment_immutable(),public.mlb_judgment_hash(jsonb),public.mlb_judgment_receipt(public.mlb_judgment_events),
  public.validate_mlb_judgment_payload(public.mlb_judgment_runs,text,jsonb),
  public.start_mlb_judgment(uuid,text,text,timestamptz,text,text,jsonb,jsonb),public.append_mlb_judgment_phase(uuid,text,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.start_mlb_judgment(uuid,text,text,timestamptz,text,text,jsonb,jsonb),public.append_mlb_judgment_phase(uuid,text,jsonb,text) to service_role;

-- These are completed, private observations, never mutable betting rules.
create table public.mlb_expectation_reviews (
  run_id uuid primary key references public.mlb_judgment_runs(run_id),
  game_date text not null,
  game_id text not null,
  policy_version text not null default 'mlb-expectation-v1' check (policy_version='mlb-expectation-v1'),
  review_model text not null,
  review jsonb not null,
  final_evidence jsonb not null,
  source_hash text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index mlb_expectation_reviews_game on public.mlb_expectation_reviews(game_date,game_id);
create trigger mlb_expectation_reviews_immutable before update or delete on public.mlb_expectation_reviews
for each row execute function public.guard_mlb_judgment_immutable();
alter table public.mlb_expectation_reviews enable row level security;
revoke all on public.mlb_expectation_reviews from public,anon,authenticated,service_role;
grant select on public.mlb_expectation_reviews to service_role;

-- Operational leases are separate from immutable completed expectation reviews.
-- The worker orders new runs before retries; failed attempts keep their audit.
create table public.mlb_expectation_review_attempts (
  run_id uuid primary key references public.mlb_judgment_runs(run_id),
  lease_token uuid not null,
  status text not null check(status in ('reviewing','failed','completed')),
  attempts integer not null default 1 check(attempts>0),
  lease_until timestamptz,
  next_retry_at timestamptz,
  error text,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  attempt_history jsonb not null default '[]'::jsonb
);
alter table public.mlb_expectation_review_attempts enable row level security;
revoke all on public.mlb_expectation_review_attempts from public,anon,authenticated,service_role;
grant select on public.mlb_expectation_review_attempts to service_role;

create function public.record_mlb_expectation_review(p_run_id uuid,p_review_model text,p_review jsonb,p_final_evidence jsonb,p_lease_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare run public.mlb_judgment_runs; existing public.mlb_expectation_reviews;
  stress public.mlb_judgment_events; published public.mlb_judgment_events; initial public.mlb_judgment_events; research public.mlb_judgment_events;
  snap jsonb:=p_final_evidence->'snapshot'; game jsonb:=p_final_evidence->'game_evidence'; result_row jsonb:=p_final_evidence->'result';
  original jsonb; item jsonb; source jsonb; citation jsonb; assessment jsonb; observed jsonb; expected jsonb; expected_sources jsonb;
  phase_name text; source_id text; grade text; tool_index integer; tool_value jsonb; final_game jsonb; ids text[]:='{}'; decision_ids text[]:='{}'; source_ids text[]:='{}'; post_ids text[]:='{}';
  started timestamptz; completed timestamptz; source_at timestamptz; has_data boolean; has_expectation boolean; has_observation boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mlb-expectation:'||p_run_id::text,0));
  select * into existing from public.mlb_expectation_reviews where run_id=p_run_id;
  if found then
    if existing.review_model is distinct from p_review_model or existing.review is distinct from p_review
      or existing.final_evidence is distinct from p_final_evidence then raise exception 'A completed expectation review cannot be rewritten'; end if;
    return false;
  end if;
  if not exists(select 1 from public.mlb_expectation_review_attempts a where a.run_id=p_run_id and a.lease_token=p_lease_token
    and a.status='reviewing' and a.lease_until>clock_timestamp()) then raise exception 'A current owned expectation review lease is required'; end if;
  select * into run from public.mlb_judgment_runs where run_id=p_run_id;
  if not found or run.commence_time>=clock_timestamp() then raise exception 'Expectation reviews require the original game to have started'; end if;
  select * into stress from public.mlb_judgment_events where run_id=p_run_id and phase='stress_test';
  select * into published from public.mlb_judgment_events where run_id=p_run_id and phase='published';
  select * into initial from public.mlb_judgment_events where run_id=p_run_id and phase='initial_commit';
  select * into research from public.mlb_judgment_events where run_id=p_run_id and phase='factual_research';
  if stress.event_id is null or published.event_id is null or initial.event_id is null or research.event_id is null
    or exists(select 1 from public.mlb_judgment_events where run_id=p_run_id and (recorded_at>=run.commence_time or phase='failed'))
    then raise exception 'A completed original pregame judgment is required'; end if;
  started:=(p_final_evidence->>'review_started_at')::timestamptz;
  completed:=(p_final_evidence->>'review_completed_at')::timestamptz;
  if started is null or completed is null or started<run.commence_time or completed<started or completed>clock_timestamp()
    or nullif(trim(p_review_model),'') is null then raise exception 'Postgame review timing and model are required'; end if;
  if jsonb_typeof(snap) is distinct from 'object' or snap->>'schema_version' is distinct from '1'
    or snap->>'decision_policy' is distinct from run.policy_version or snap->>'run_id' is distinct from run.run_id::text
    or snap->>'game_id' is distinct from run.game_id or snap->>'game_date' is distinct from run.game_date or snap->>'league' is distinct from 'MLB'
    or (snap->>'commence_time')::timestamptz is distinct from run.commence_time
    or snap->'pick_snapshot' is distinct from published.payload->'data'->'final_pick_snapshot'
    or (snap->>'published_at')::timestamptz is distinct from published.recorded_at
    or snap->>'stress_event_sha256' is distinct from stress.payload_sha256 or snap->>'published_event_sha256' is distinct from published.payload_sha256
    or snap->>'home_team' is distinct from snap->'pick_snapshot'->>'homeTeam' or snap->>'away_team' is distinct from snap->'pick_snapshot'->>'awayTeam'
    then raise exception 'Postgame snapshot changed the original judgment or ticket'; end if;
  grade:=lower(trim(result_row->>'result'));
  if coalesce(grade,'') not in ('won','lost','push','void') or result_row->>'game_date' is distinct from run.game_date
    or result_row->>'game_id' is distinct from run.game_id or result_row->>'league' is distinct from 'MLB'
    or result_row->>'pick_text' is distinct from snap->'pick_snapshot'->>'pick'
    or not exists(select 1 from public.game_results r where r.id::text=result_row->>'id' and r.game_date::text=run.game_date
      and r.game_id::text=run.game_id and r.league='MLB' and r.pick_text=result_row->>'pick_text' and lower(trim(r.result))=grade)
    or exists(select 1 from public.game_results r where r.game_date::text=run.game_date and r.game_id::text=run.game_id and r.league='MLB'
      and r.pick_text=result_row->>'pick_text' and lower(trim(r.result)) in ('won','lost','push','void') and lower(trim(r.result))<>grade)
    then raise exception 'An unambiguous settled result for the exact public ticket is required'; end if;
  if game->>'league' is distinct from 'MLB' or game->>'game_date' is distinct from run.game_date or game->>'game_id' is distinct from run.game_id
    or game->'final' is distinct from 'true'::jsonb or coalesce(game->>'game_pk','')!~'^[1-9][0-9]*$'
    or (snap->>'game_pk' is not null and snap->>'game_pk' is distinct from game->>'game_pk')
    or jsonb_typeof(game->'sources') is distinct from 'array' or jsonb_array_length(game->'sources')=0
    then raise exception 'Exact official final-game evidence is required'; end if;
  for source in select value from jsonb_array_elements(game->'sources') loop
    source_at:=(source->>'observed_at')::timestamptz;
    if nullif(trim(source->>'source_id'),'') is null or source->>'source_id'=any(post_ids)
      or coalesce(source->>'kind','') not in ('final','boxscore','plays') or nullif(trim(source->>'text'),'') is null
      or source_at is null or source_at<run.commence_time or source_at>started
      or coalesce(source->>'url','')!~'^https://statsapi[.]mlb[.]com/api/'
      or (source->>'kind' in ('boxscore','plays') and position('/game/'||(game->>'game_pk')||'/' in source->>'url')=0)
      then raise exception 'Official evidence identity, source or observation time is invalid'; end if;
    if source->>'kind'='final' then
      final_game:=(source->>'text')::jsonb;
      if final_game->>'gamePk' is distinct from game->>'game_pk'
        or coalesce(final_game->>'officialDate',((final_game->>'gameDate')::timestamptz at time zone 'America/New_York')::date::text) is distinct from run.game_date
        or (coalesce(final_game->'status'->>'abstractGameState','')<>'Final' and coalesce(final_game->'status'->>'detailedState','')!~*'^(final|game over|completed)')
        or regexp_replace(lower(coalesce(final_game->'teams'->'home'->'team'->>'name','')),'[^a-z0-9]','','g') is distinct from regexp_replace(lower(snap->>'home_team'),'[^a-z0-9]','','g')
        or regexp_replace(lower(coalesce(final_game->'teams'->'away'->'team'->>'name','')),'[^a-z0-9]','','g') is distinct from regexp_replace(lower(snap->>'away_team'),'[^a-z0-9]','','g')
        or (snap->>'game_pk' is null and (final_game->>'gameDate')::timestamptz is distinct from run.commence_time)
        then raise exception 'Official final status belongs to another game or is not final'; end if;
    end if;
    post_ids:=array_append(post_ids,source->>'source_id');
  end loop;
  if not exists(select 1 from jsonb_array_elements(game->'sources') s where s->>'kind'='final') then raise exception 'Official final-status evidence is required'; end if;
  if jsonb_typeof(snap->'expectations') is distinct from 'array' or jsonb_array_length(snap->'expectations')<>4
    then raise exception 'Exactly four immutable expectations are required'; end if;
  expected_sources:=jsonb_build_array(
    jsonb_build_object('source_id','pregame:desk','kind','data','recorded_at',run.created_at,'raw',run.source_snapshot->'deskText'),
    jsonb_build_object('source_id','pregame:targeted_research','kind','research','recorded_at',research.recorded_at,'json',research.payload->'data'),
    jsonb_build_object('source_id','pregame:initial_judgment','kind','judgment','recorded_at',initial.recorded_at,'json',initial.payload->'data'));
  if run.source_snapshot->'researchBriefing' is not null and run.source_snapshot->'researchBriefing'<>'null'::jsonb
    and trim(run.source_snapshot->>'researchBriefing')<>'' then
    expected_sources:=expected_sources||jsonb_build_array(jsonb_build_object('source_id','pregame:research','kind','research','recorded_at',run.created_at,
      case when jsonb_typeof(run.source_snapshot->'researchBriefing')='string' then 'raw' else 'json' end,run.source_snapshot->'researchBriefing'));
  end if;
  if jsonb_typeof(run.source_snapshot->'toolResponses')='array' then
    for tool_value,tool_index in select value,(ordinality-1)::integer from jsonb_array_elements(run.source_snapshot->'toolResponses') with ordinality loop
      if tool_value->'content' is not null and tool_value->'content'<>'null'::jsonb and trim(tool_value->>'content')<>'' then
        expected_sources:=expected_sources||jsonb_build_array(jsonb_build_object('source_id','pregame:tool:'||tool_index,'kind','data',
          'recorded_at',coalesce(nullif(tool_value->>'observedAt','')::timestamptz,run.created_at),
          case when jsonb_typeof(tool_value->'content')='string' then 'raw' else 'json' end,tool_value->'content'));
      end if;
    end loop;
  end if;
  for item in select value from jsonb_array_elements(snap->'expectations') loop
    phase_name:=item->>'phase'; source_id:=run.run_id::text||':'||phase_name; original:=stress.payload->'data'->'expectations'->phase_name;
    if coalesce(phase_name,'') not in ('opening','middle','finish','offense') or source_id=any(ids)
      or item->>'expectation_id' is distinct from source_id or item->>'claim' is distinct from original->>'claim'
      or item->>'evidence' is distinct from original->>'evidence' or item->>'disconfirming_observation' is distinct from original->>'disconfirming_observation'
      or (item->>'recorded_at')::timestamptz is distinct from stress.recorded_at then raise exception 'An original expectation was changed or duplicated'; end if;
    ids:=array_append(ids,source_id);
    expected_sources:=expected_sources||jsonb_build_array(jsonb_build_object('source_id',source_id,'kind','expectation','recorded_at',stress.recorded_at,
      'raw',(item->>'claim')||E'\n'||(item->>'evidence')||E'\nDisconfirming observation: '||(item->>'disconfirming_observation')));
  end loop;
  if jsonb_typeof(snap->'original_sources') is distinct from 'array' or jsonb_array_length(snap->'original_sources')<>jsonb_array_length(expected_sources)
    then raise exception 'All original pregame sources must be retained'; end if;
  for source in select value from jsonb_array_elements(snap->'original_sources') loop
    select value into expected from jsonb_array_elements(expected_sources) e where e->>'source_id'=source->>'source_id';
    if expected is null or source->>'source_id'=any(source_ids) or source->>'source_id'=any(post_ids)
      or source->>'kind' is distinct from expected->>'kind' or source->>'stage' is distinct from 'pregame'
      or (source->>'recorded_at')::timestamptz is distinct from (expected->>'recorded_at')::timestamptz
      or (expected ? 'raw' and source->>'text' is distinct from expected->>'raw')
      or (expected ? 'json' and (source->>'text')::jsonb is distinct from expected->'json')
      then raise exception 'An original source was altered, omitted or replaced'; end if;
    source_ids:=array_append(source_ids,source->>'source_id');
  end loop;
  if p_review->>'schema_version' is distinct from '1' or p_review->>'policy_version' is distinct from 'mlb-expectation-v1'
    or p_review->>'run_id' is distinct from run.run_id::text or p_review->>'game_date' is distinct from run.game_date
    or p_review->>'game_id' is distinct from run.game_id or p_review->>'result' is distinct from grade
    or jsonb_typeof(p_review->'expectations') is distinct from 'array' or jsonb_array_length(p_review->'expectations')<>4
    then raise exception 'Expectation review does not match its exact original run and result'; end if;
  for item in select value from jsonb_array_elements(p_review->'expectations') loop
    if not (coalesce(item->>'expectation_id','')=any(ids)) or item->>'expectation_id'=any(decision_ids)
      or item ? 'claim' or item ? 'evidence' or item ? 'disconfirming_observation' then raise exception 'Reviewer may assess each original expectation only once'; end if;
    decision_ids:=array_append(decision_ids,item->>'expectation_id');
    assessment:=item->'decision_review'; observed:=item->'outcome_review';
    if coalesce(assessment->>'assessment','') not in ('factual_error','unsupported_assumption','mixed','no_identified_error','unknown')
      or coalesce(observed->>'status','') not in ('observed','contradicted','unknown')
      or nullif(trim(assessment->>'explanation'),'') is null or nullif(trim(observed->>'explanation'),'') is null
      or jsonb_typeof(assessment->'evidence') is distinct from 'array' or jsonb_typeof(observed->'evidence') is distinct from 'array'
      then raise exception 'Separate decision and outcome assessments are required'; end if;
    has_data:=false; has_expectation:=false; has_observation:=false;
    for citation in select value from jsonb_array_elements(assessment->'evidence') loop
      select value into source from jsonb_array_elements(snap->'original_sources') s where s->>'source_id'=citation->>'source_id';
      if source is null or length(trim(coalesce(citation->>'quote','')))<8 or position(citation->>'quote' in source->>'text')=0
        then raise exception 'Decision assessment must cite exact preserved pregame evidence'; end if;
      has_data:=has_data or source->>'kind' in ('data','research');
      has_expectation:=has_expectation or source->>'source_id'=item->>'expectation_id';
    end loop;
    for citation in select value from jsonb_array_elements(observed->'evidence') loop
      select value into source from jsonb_array_elements(game->'sources') s where s->>'source_id'=citation->>'source_id';
      if source is null or length(trim(coalesce(citation->>'quote','')))<8 or position(citation->>'quote' in source->>'text')=0
        then raise exception 'Outcome assessment must cite exact observed postgame evidence'; end if;
      has_observation:=has_observation or source->>'kind' in ('boxscore','plays');
    end loop;
    if (assessment->>'assessment'<>'unknown' and not (has_data and has_expectation))
      or (observed->>'status'<>'unknown' and not has_observation) then raise exception 'Assessment lacks the evidence required for a known finding'; end if;
  end loop;
  insert into public.mlb_expectation_reviews(run_id,game_date,game_id,review_model,review,final_evidence,source_hash)
    values(run.run_id,run.game_date,run.game_id,p_review_model,p_review,p_final_evidence,public.mlb_judgment_hash(p_final_evidence));
  return true;
end; $$;
revoke all on function public.record_mlb_expectation_review(uuid,text,jsonb,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.record_mlb_expectation_review(uuid,text,jsonb,jsonb,uuid) to service_role;

-- The v4 pool requires a real completed, endorsed durable judgment. No client
-- snapshot or a successful factual read can substitute for that original run.
create function public.mlb_judgment_candidate_eligible(c public.winners_candidates) returns boolean
language plpgsql stable security invoker set search_path='' as $$
begin
  return (select coalesce(c.league='MLB' and c.kind='game' and c.policy_version='mlb-conviction-v4'
    and c.pick_snapshot->>'decision_policy'='mlb-judgment-v2' and c.pick_snapshot->>'price_endorsement'='endorse'
    and c.review->>'policy_version'='mlb-conviction-v4' and c.review->>'schema_version'='4' and c.review->'eligibility_only'='true'::jsonb
    and exists(select 1 from public.mlb_judgment_runs r
      join public.mlb_judgment_events published on published.run_id=r.run_id and published.phase='published'
      join public.mlb_judgment_events price on price.run_id=r.run_id and price.phase='price_assessment'
      join public.mlb_judgment_events stress on stress.run_id=r.run_id and stress.phase='stress_test'
      join public.mlb_judgment_events initial on initial.run_id=r.run_id and initial.phase='initial_commit'
      join public.mlb_judgment_events research on research.run_id=r.run_id and research.phase='factual_research'
      where r.run_id::text=c.pick_snapshot->>'judgment_run_id' and r.game_date=c.game_date and r.game_id=c.game_id and r.commence_time=c.commence_time
        and published.payload->'data'->'final_pick_snapshot'=c.pick_snapshot and published.recorded_at<r.commence_time
        and price.payload->'data'->>'decision'='endorse' and price.payload->'data'->>'ticket_id'=stress.payload->'data'->>'ticket_id'
        and c.evidence_snapshot->'deskText'=r.source_snapshot->'deskText'
        and coalesce(c.evidence_snapshot->'researchBriefing','null'::jsonb)=coalesce(r.source_snapshot->'researchBriefing','null'::jsonb)
        and c.evidence_snapshot->'mlbJudgment'->>'run_id'=r.run_id::text
        and c.evidence_snapshot->'mlbJudgment'->>'policy_version'=r.policy_version
        and c.evidence_snapshot->'mlbJudgment'->'initial'=initial.payload->'data'
        and c.evidence_snapshot->'mlbJudgment'->'research'=research.payload->'data'
        and c.evidence_snapshot->'mlbJudgment'->'stress'=stress.payload->'data'
        and c.evidence_snapshot->'mlbJudgment'->'price'=price.payload->'data'
        and c.evidence_snapshot->'mlbJudgment'->'allowedTickets'=r.source_snapshot->'allowedTickets'
        and c.evidence_snapshot->'mlbJudgment'->'gameKind'=r.source_snapshot->'gameKind'
        and exists(select 1 from jsonb_array_elements(r.source_snapshot->'allowedTickets') t
          where t->>'id'=price.payload->'data'->>'ticket_id' and t=c.evidence_snapshot->'mlbJudgment'->'final_ticket')
        and not exists(select 1 from public.mlb_judgment_events e where e.run_id=r.run_id
          and (c.evidence_snapshot->'mlbJudgment'->'receipts'->e.phase->>'run_id' is distinct from r.run_id::text
            or c.evidence_snapshot->'mlbJudgment'->'receipts'->e.phase->>'phase' is distinct from e.phase
            or c.evidence_snapshot->'mlbJudgment'->'receipts'->e.phase->>'payload_sha256' is distinct from e.payload_sha256
            or (c.evidence_snapshot->'mlbJudgment'->'receipts'->e.phase->>'recorded_at')::timestamptz is distinct from e.recorded_at))
        and c.pick_text=c.pick_snapshot->>'pick' and c.odds::numeric=(c.pick_snapshot->>'odds')::numeric
    ),false));
exception when others then return false;
end; $$;
revoke all on function public.mlb_judgment_candidate_eligible(public.winners_candidates) from public,anon,authenticated;
grant execute on function public.mlb_judgment_candidate_eligible(public.winners_candidates) to service_role;
alter table public.winners_selection_runs drop constraint winners_selection_runs_policy_version_check;
alter table public.winners_selection_runs add constraint winners_selection_runs_policy_version_check check(policy_version in ('mlb-conviction-v3','mlb-conviction-v4'));
alter table public.winners_selection_runs alter column policy_version set default 'mlb-conviction-v4';

-- New claims use v4. A previously frozen v3 run retains its original contract.
create or replace function public.claim_mlb_winners_selection(p_date text,p_window_start timestamptz)
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
      and policy_version='mlb-conviction-v4' and status in ('pending','reviewing')
      and commence_time between clock_timestamp() and p_window_start and admitted_at is null
  ) then return; end if;
  if p_window_start>clock_timestamp()+interval '10 minutes' and exists(
    select 1 from public.daily_slate s where s.date::text=p_date and s.league='MLB' and s.commence_time=p_window_start
      and not exists(select 1 from public.winners_candidates c where c.game_date=p_date and c.league='MLB' and c.kind='game'
        and c.game_id=to_jsonb(s)->>'bdl_game_id' and c.commence_time=s.commence_time)
  ) then return; end if;
  select jsonb_agg(to_jsonb(c) order by c.id),jsonb_agg(jsonb_build_object('id',c.id,'ticket',c.ticket_key,'review',c.reviewed_at) order by c.id)
    into candidates,identity_rows from public.winners_candidates c
    where c.game_date=p_date and c.league='MLB' and c.kind='game' and c.policy_version='mlb-conviction-v4'
      and c.pick_snapshot->>'decision_policy'='mlb-judgment-v2'
      and c.review->>'policy_version'='mlb-conviction-v4' and c.review->>'schema_version'='4'
      and c.review->'eligibility_only'='true'::jsonb
      and public.mlb_judgment_candidate_eligible(c)
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
  key:=md5(jsonb_build_object('policy','mlb-conviction-v4','date',p_date,'cohort',cohort_no,'candidates',identity_rows,'remaining',remaining,'slate',schedule_identity)::text);
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

create or replace function public.finish_mlb_winners_selection(p_id bigint,p_attempt integer,p_selection jsonb,p_model text,p_ms integer,p_error text default null)
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
        if not found or c.status<>'qualified' or c.admitted_at is not null or c.policy_version is distinct from run.policy_version
          or (run.policy_version='mlb-conviction-v4' and not public.mlb_judgment_candidate_eligible(c))
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


create function public.claim_mlb_expectation_review(p_run_id uuid,p_lease_token uuid,p_lease_seconds integer default 420) returns boolean
language plpgsql security definer set search_path='' as $$
declare prior public.mlb_expectation_review_attempts; observed timestamptz;
begin
  if p_run_id is null or p_lease_token is null or p_lease_seconds is null or p_lease_seconds not between 30 and 600 then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mlb-expectation:'||p_run_id::text,0));
  observed:=clock_timestamp();
  if exists(select 1 from public.mlb_expectation_reviews where run_id=p_run_id) then return false; end if;
  if not exists(select 1 from public.mlb_judgment_runs r
    join public.mlb_judgment_events p on p.run_id=r.run_id and p.phase='published'
    join public.game_results g on g.game_date::text=r.game_date and g.game_id::text=r.game_id and g.league='MLB'
      and g.pick_text=p.payload->'data'->'final_pick_snapshot'->>'pick' and lower(trim(g.result)) in ('won','lost','push','void')
    where r.run_id=p_run_id and r.commence_time<observed and p.recorded_at<r.commence_time) then return false; end if;
  select * into prior from public.mlb_expectation_review_attempts where run_id=p_run_id for update;
  if found then
    if prior.status='completed' or (prior.status='reviewing' and prior.lease_until>observed) or prior.next_retry_at>observed then return false; end if;
    update public.mlb_expectation_review_attempts set lease_token=p_lease_token,status='reviewing',attempts=attempts+1,
      lease_until=observed+make_interval(secs=>p_lease_seconds),next_retry_at=null,error=null,started_at=observed,completed_at=null,
      attempt_history=attempt_history||case when prior.status='reviewing' then jsonb_build_array(jsonb_build_object('attempt',prior.attempts,
        'lease_token',prior.lease_token,'started_at',prior.started_at,'completed_at',observed,'error','Previous review lease expired')) else '[]'::jsonb end
      where run_id=p_run_id;
  else
    insert into public.mlb_expectation_review_attempts(run_id,lease_token,status,lease_until,started_at)
      values(p_run_id,p_lease_token,'reviewing',observed+make_interval(secs=>p_lease_seconds),observed);
  end if;
  return true;
end; $$;
create function public.finish_mlb_expectation_review_attempt(p_run_id uuid,p_lease_token uuid,p_error text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare prior public.mlb_expectation_review_attempts; done boolean; observed timestamptz; why text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mlb-expectation:'||p_run_id::text,0));
  observed:=clock_timestamp();
  select * into prior from public.mlb_expectation_review_attempts where run_id=p_run_id for update;
  if not found or prior.status<>'reviewing' or prior.lease_token is distinct from p_lease_token then return false; end if;
  done:=exists(select 1 from public.mlb_expectation_reviews where run_id=p_run_id);
  why:=case when done then null else coalesce(nullif(trim(p_error),''),'Review did not produce a completed immutable record') end;
  update public.mlb_expectation_review_attempts set status=case when done then 'completed' else 'failed' end,
    lease_until=null,next_retry_at=case when done then null else observed+case when attempts=1 then interval '30 minutes' else interval '2 hours' end end,
    error=why,completed_at=observed,attempt_history=attempt_history||jsonb_build_array(jsonb_build_object('attempt',attempts,
      'lease_token',lease_token,'started_at',started_at,'completed_at',observed,'error',why,'completed',done)) where run_id=p_run_id;
  return true;
end; $$;
revoke all on function public.claim_mlb_expectation_review(uuid,uuid,integer),public.finish_mlb_expectation_review_attempt(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_mlb_expectation_review(uuid,uuid,integer),public.finish_mlb_expectation_review_attempt(uuid,uuid,text) to service_role;
