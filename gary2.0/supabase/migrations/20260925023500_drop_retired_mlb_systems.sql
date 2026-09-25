-- Retired MLB systems (founder GO, Sep 24 2026): the shadow model, the notebook
-- diary pick and the Sep 8 judgment stages with their expectation memory. All
-- were off since Sep 9; their code was removed in 202d5ff8. Rows were saved
-- first to logs/audits/2026-09-24-retired-mlb-systems-backup.json. The shipped
-- 2.26 app, the website and the edge functions never read any of these.
-- pick_autopsies and the autopsy lane stay.

-- The Winners reader claim no longer waits on a v4 judgment journal. Only the
-- Sep 8-9 candidates carried one, and none of them can be claimed again.
create or replace function public.claim_winners_read()
 returns setof public.winners_candidates
 language plpgsql
 set search_path to ''
as $function$
declare chosen public.winners_candidates;
begin
 select * into chosen from public.winners_candidates c
 where (c.status='pending' or (c.status='reviewing' and c.lease_until<clock_timestamp())
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

-- The MLB selection window (retired by the Winners gate) lost its last caller.
drop function if exists public.claim_mlb_winners_selection(text, timestamptz);
drop function if exists public.finish_mlb_winners_selection(bigint, integer, jsonb, text, integer, text);

drop function if exists public.mlb_judgment_candidate_ready(public.winners_candidates);
drop function if exists public.mlb_judgment_candidate_eligible(public.winners_candidates);
drop function if exists public.start_mlb_judgment(uuid, text, text, timestamptz, text, text, jsonb, jsonb);
drop function if exists public.append_mlb_judgment_phase(uuid, text, jsonb, text);
drop function if exists public.validate_mlb_judgment_payload(public.mlb_judgment_runs, text, jsonb);
drop function if exists public.record_mlb_expectation_review(uuid, text, jsonb, jsonb, uuid);
drop function if exists public.claim_mlb_expectation_review(uuid, uuid, integer);
drop function if exists public.finish_mlb_expectation_review_attempt(uuid, uuid, text);
drop function if exists public.mlb_judgment_receipt(public.mlb_judgment_events);
drop function if exists public.mlb_judgment_hash(jsonb);

-- No cascade: an unexpected dependent stops the migration instead of vanishing.
drop table if exists public.mlb_expectation_review_attempts;
drop table if exists public.mlb_expectation_reviews;
drop table if exists public.mlb_judgment_events;
drop table if exists public.mlb_judgment_runs;
drop table if exists public.diary_picks;
drop table if exists public.shadow_picks;

drop function if exists public.guard_mlb_judgment_event_time();
drop function if exists public.guard_mlb_judgment_immutable();
