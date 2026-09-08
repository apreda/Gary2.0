-- Bind every Winners tool response and official postgame identity to the
-- immutable pregame source. Existing private records and grants are preserved.

create or replace function public.record_mlb_expectation_review(p_run_id uuid,p_review_model text,p_review jsonb,p_final_evidence jsonb,p_lease_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare run public.mlb_judgment_runs; existing public.mlb_expectation_reviews;
  stress public.mlb_judgment_events; published public.mlb_judgment_events; initial public.mlb_judgment_events; research public.mlb_judgment_events;
  snap jsonb:=p_final_evidence->'snapshot'; game jsonb:=p_final_evidence->'game_evidence'; result_row jsonb:=p_final_evidence->'result';
  original_game_pk jsonb; original jsonb; item jsonb; source jsonb; citation jsonb; assessment jsonb; observed jsonb; expected jsonb; expected_sources jsonb;
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
  -- Only the immutable pregame source may establish an official MLB game ID.
  -- A supplied postgame ID must never disable the doubleheader kickoff check.
  original_game_pk:=coalesce(nullif(run.source_snapshot#>'{game,gamePk}','null'::jsonb),
    nullif(run.source_snapshot#>'{game,game_pk}','null'::jsonb),
    nullif(run.source_snapshot#>'{game,mlb_game_pk}','null'::jsonb),'null'::jsonb);
  if jsonb_typeof(snap) is distinct from 'object' or snap->>'schema_version' is distinct from '1'
    or snap->>'decision_policy' is distinct from run.policy_version or snap->>'run_id' is distinct from run.run_id::text
    or snap->>'game_id' is distinct from run.game_id or snap->>'game_date' is distinct from run.game_date or snap->>'league' is distinct from 'MLB'
    or (snap->>'commence_time')::timestamptz is distinct from run.commence_time
    or snap->'game_pk' is distinct from original_game_pk
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
        or (original_game_pk='null'::jsonb and (final_game->>'gameDate')::timestamptz is distinct from run.commence_time)
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

-- The factual reviewer must see the same original tool evidence Gary saw.
create or replace function public.mlb_judgment_candidate_eligible(c public.winners_candidates) returns boolean
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
        and jsonb_typeof(c.evidence_snapshot->'toolResponses')='array'
        and c.evidence_snapshot->'toolResponses'=r.source_snapshot->'toolResponses'
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
