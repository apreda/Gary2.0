-- Bounded retry for transient/unavailable reviews after original evidence is
-- present. Missing evidence stays explicitly unavailable; rejection is final.
create or replace function public.claim_winners_candidate() returns setof public.winners_candidates
language plpgsql security invoker set search_path = '' as $$
declare chosen public.winners_candidates;
begin
  select * into chosen from public.winners_candidates
  where (status = 'pending' or (status = 'reviewing' and lease_until < now())
    or (status = 'unavailable' and review is null and reviewed_at < now()-interval '2 minutes'
      and nullif(evidence_snapshot->>'deskText','') is not null))
    and admitted_at is null and created_at < now()-interval '30 seconds'
    and attempts < 2 and commence_time > now() + interval '30 seconds'
  order by commence_time, created_at, id for update skip locked limit 1;
  if not found then return; end if;
  update public.winners_candidates set status='reviewing', attempts=attempts+1,
    lease_until=now()+interval '15 minutes' where id=chosen.id returning * into chosen;
  insert into public.winners_decision_events(candidate_id,event,detail)
    values(chosen.id,'review_started',jsonb_build_object('attempt',chosen.attempts));
  return next chosen;
end; $$;

revoke all on function public.claim_winners_candidate() from public,anon,authenticated;
grant execute on function public.claim_winners_candidate() to service_role;
