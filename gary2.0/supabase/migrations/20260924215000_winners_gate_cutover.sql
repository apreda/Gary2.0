-- THE WINNERS GATE, CUT OVER (founder, Sep 24 2026 ~4:30 PM: "I'd like to not
-- wait till Friday"). The reader claims every unread candidate from now on,
-- and the window, fill, cohort and per-ticket review machinery is gone.

create or replace function public.claim_winners_read() returns setof public.winners_candidates
language plpgsql security invoker set search_path='' as $$
declare chosen public.winners_candidates;
begin
 select * into chosen from public.winners_candidates c
 where (c.status='pending' or (c.status='reviewing' and c.lease_until<clock_timestamp())
     or (c.status='unavailable' and c.reviewed_at<clock_timestamp()-interval '2 minutes' and nullif(c.evidence_snapshot->>'deskText','') is not null))
   and c.admitted_at is null and c.created_at<clock_timestamp()-interval '30 seconds'
   and (nullif(c.evidence_snapshot->>'deskText','') is not null or c.created_at<clock_timestamp()-interval '5 minutes')
   and (c.policy_version<>'mlb-conviction-v4' or public.mlb_judgment_candidate_ready(c))
   and c.attempts<2 and c.commence_time>clock_timestamp()+interval '30 seconds'
 order by c.commence_time,c.created_at,c.id for update skip locked limit 1;
 if not found then return; end if;
 update public.winners_candidates set status='reviewing',attempts=attempts+1,lease_until=clock_timestamp()+interval '15 minutes' where id=chosen.id returning * into chosen;
 insert into public.winners_decision_events(candidate_id,event,detail) values(chosen.id,'read_started',jsonb_build_object('attempt',chosen.attempts));
 return next chosen;
end $$;

drop function if exists
 public.claim_winners_curation(text,text),
 public.claim_winners_curation_before_gate(text,text),
 public.finish_winners_curation(bigint,integer,jsonb,text,integer,text),
 public.winners_daily_plan(text,text),
 public.winners_curation_candidates(text,text,jsonb,jsonb),
 public.ensure_winners_window_coverage(text,text),
 public.ensure_winners_window_coverage_before_gate(text,text),
 public.winners_props_plan(text),
 public.claim_winners_props(text),
 public.claim_winners_props_before_gate(text),
 public.finish_winners_props(bigint,integer,jsonb,text,integer,text),
 public.claim_winners_candidate(),
 public.finish_winners_review(bigint,integer,text,text,jsonb,text,integer),
 public.winners_capacity(text,text,text),
 public.release_winners_board(text,text,text),
 public.release_winners_board_before_curation(text,text,text);
