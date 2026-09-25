-- Game bets do not depend on a named player appearing. Only a player prop
-- can be voided by a newly reported inactive before kickoff. Enforce this
-- at the publication boundary and at the service-role scratch RPC.
create or replace function public.guard_winners_publication() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'winners_board' then
    if tg_op = 'UPDATE'
       and old.kind = 'prop'
       and old.scratched_at is null and new.scratched_at is not null
       and (to_jsonb(new) - 'scratched_at' - 'scratch_reason') =
           (to_jsonb(old) - 'scratched_at' - 'scratch_reason') then
      return new;
    end if;
    -- Correct an old game scratch without changing the published ticket.
    if tg_op = 'UPDATE'
       and old.kind = 'game'
       and old.scratched_at is not null and new.scratched_at is null
       and new.scratch_reason is null
       and (to_jsonb(new) - 'scratched_at' - 'scratch_reason') =
           (to_jsonb(old) - 'scratched_at' - 'scratch_reason') then
      return new;
    end if;
    raise exception 'Published Winners tickets are immutable';
  end if;
  if old.admitted_at is not null then
    raise exception 'An admitted Winners candidate is immutable';
  end if;
  return new;
end; $$;

create or replace function public.scratch_winners_play(p_candidate_id bigint,p_reason text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare b public.winners_board;
begin
  select * into b from public.winners_board where candidate_id=p_candidate_id for update;
  if not found or b.kind <> 'prop' or b.scratched_at is not null then return false; end if;
  if exists(select 1 from public.winners_candidates c where c.id=p_candidate_id and c.commence_time<=clock_timestamp()) then return false; end if;
  update public.winners_board set scratched_at=clock_timestamp(),scratch_reason=left(coalesce(p_reason,''),400) where candidate_id=p_candidate_id;
  insert into public.winners_decision_events(candidate_id,event,detail) values(p_candidate_id,'scratched',jsonb_build_object('reason',p_reason));
  return true;
end $$;
revoke all on function public.scratch_winners_play(bigint,text) from public,anon,authenticated;
grant execute on function public.scratch_winners_play(bigint,text) to service_role;

-- The sole game pick scratched by the old rationale-name scanner was Atlanta
-- +4.5. Preserve the ticket and stake; removing its erroneous scratch lets
-- the existing exact-ticket result and bankroll ledger recognize the win.
do $$
declare r record;
begin
  for r in
    select b.candidate_id, b.scratch_reason
    from public.winners_board b
    join public.winners_candidates c on c.id = b.candidate_id
    where b.game_date = '2026-09-24' and b.league = 'NFL'
      and b.kind = 'game' and b.game_id = '1392248'
      and c.pick_text = 'Atlanta Falcons +4.5 -104'
      and b.scratch_reason = 'zach bako bewele inactive'
      and b.scratched_at is not null
    for update of b
  loop
    update public.winners_board
       set scratched_at = null, scratch_reason = null
     where candidate_id = r.candidate_id;
    insert into public.winners_decision_events(candidate_id,event,detail)
    values(r.candidate_id,'scratch_corrected',jsonb_build_object(
      'why','Game pick was scratched because an inactive appeared in its rationale',
      'old_reason',r.scratch_reason));
  end loop;
end $$;
