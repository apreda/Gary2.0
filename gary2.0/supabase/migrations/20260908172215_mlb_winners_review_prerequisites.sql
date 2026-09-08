-- A missing publication receipt or original source is a queue prerequisite,
-- not a factual model attempt. Preserve monotonic attempt ownership tokens and
-- the two-attempt limit; legacy lanes keep their existing claim contract.
create function public.mlb_judgment_candidate_ready(c public.winners_candidates) returns boolean
language plpgsql stable security invoker set search_path='' as $$
begin
  return (select coalesce(c.league='MLB' and c.kind='game' and c.policy_version='mlb-conviction-v4'
    and c.pick_snapshot->>'decision_policy'='mlb-judgment-v2' and c.pick_snapshot->>'price_endorsement' in ('endorse','decline')
    and exists(select 1 from public.mlb_judgment_runs r
      join public.mlb_judgment_events published on published.run_id=r.run_id and published.phase='published'
      join public.mlb_judgment_events price on price.run_id=r.run_id and price.phase='price_assessment'
      join public.mlb_judgment_events stress on stress.run_id=r.run_id and stress.phase='stress_test'
      join public.mlb_judgment_events initial on initial.run_id=r.run_id and initial.phase='initial_commit'
      join public.mlb_judgment_events research on research.run_id=r.run_id and research.phase='factual_research'
      where r.run_id::text=c.pick_snapshot->>'judgment_run_id' and r.game_date=c.game_date and r.game_id=c.game_id and r.commence_time=c.commence_time
        and published.payload->'data'->'final_pick_snapshot'=c.pick_snapshot and published.recorded_at<r.commence_time
        and price.payload->'data'->>'decision'=c.pick_snapshot->>'price_endorsement' and price.payload->'data'->>'ticket_id'=stress.payload->'data'->>'ticket_id'
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

create or replace function public.mlb_judgment_candidate_eligible(c public.winners_candidates) returns boolean
language sql stable security invoker set search_path='' as $$
  select coalesce(public.mlb_judgment_candidate_ready(c)
    and c.pick_snapshot->>'price_endorsement'='endorse'
    and c.review->>'policy_version'='mlb-conviction-v4' and c.review->>'schema_version'='4'
    and c.review->'eligibility_only'='true'::jsonb,false)
$$;


revoke all on function public.mlb_judgment_candidate_ready(public.winners_candidates) from public,anon,authenticated;
grant execute on function public.mlb_judgment_candidate_ready(public.winners_candidates) to service_role;

create or replace function public.claim_winners_candidate() returns setof public.winners_candidates
language plpgsql security invoker set search_path = '' as $$
declare chosen public.winners_candidates;
begin
  select * into chosen from public.winners_candidates c
  where (status = 'pending' or (status = 'reviewing' and lease_until < now())
    or (status = 'unavailable' and review is null and reviewed_at < now()-interval '2 minutes'
      and nullif(evidence_snapshot->>'deskText','') is not null))
    and admitted_at is null and created_at < now()-interval '30 seconds'
    and (c.policy_version<>'mlb-conviction-v4' or public.mlb_judgment_candidate_ready(c))
    and attempts < 2 and commence_time > now() + interval '30 seconds'
  order by commence_time, created_at, id for update skip locked limit 1;
  if not found then return; end if;
  update public.winners_candidates set status='reviewing', attempts=attempts+1,
    lease_until=now()+interval '15 minutes' where id=chosen.id returning * into chosen;
  insert into public.winners_decision_events(candidate_id,event,detail)
    values(chosen.id,'review_started',jsonb_build_object('attempt',chosen.attempts));
  return next chosen;
end; $$;
