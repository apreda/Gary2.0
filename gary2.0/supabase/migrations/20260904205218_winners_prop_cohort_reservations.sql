-- Clock-only capacity let earlier games consume the later slots before those
-- props existed. Cohorts come from the entire slate, not generated candidates.
-- Prefix limits preserve two places per chronological third: early <=2,
-- early+middle <=4, total <=6. Later cohorts can use unfilled earlier places.
-- A single kickoff batch has all six places; two batches reserve four for late.
create function public.winners_prop_cohort(p_date text, p_league text, p_kickoff timestamptz) returns integer
language plpgsql stable security invoker set search_path = '' as $$
declare starts timestamptz[]; n integer; first_size integer; second_size integer;
begin
  if p_kickoff is null then return null; end if;
  select array_agg(t order by t) into starts from
    (select distinct commence_time::timestamptz t from public.daily_slate
      where date::text=p_date and league=p_league and commence_time is not null) s;
  n := coalesce(array_length(starts,1),0);
  if n=0 then return null; end if;
  if n=1 then return 3; end if;
  if n=2 then return case when p_kickoff < starts[2] then 1 else 3 end; end if;
  -- NTILE(3) sizes, without splitting games sharing a kickoff across cohorts.
  first_size := n/3 + case when n%3>0 then 1 else 0 end;
  second_size := n/3 + case when n%3>1 then 1 else 0 end;
  if p_kickoff < starts[first_size+1] then return 1; end if;
  if p_kickoff < starts[first_size+second_size+1] then return 2; end if;
  return 3;
end; $$;

create or replace function public.winners_capacity(p_date text, p_league text, p_kind text) returns integer
language plpgsql stable security invoker set search_path = '' as $$
declare starts timestamptz[]; n integer; first_size integer; second_size integer; middle_at timestamptz; late_at timestamptz;
begin
  if p_kind='game' then return 6; end if;
  if exists(select 1 from public.daily_slate where date::text=p_date and league=p_league and commence_time is null) then return 2; end if;
  select array_agg(t order by t) into starts from
    (select distinct commence_time::timestamptz t from public.daily_slate
      where date::text=p_date and league=p_league and commence_time is not null) s;
  n := coalesce(array_length(starts,1),0);
  if n=0 then return 0; end if;
  if n=1 then return 6; end if;
  if n=2 then return case when now() >= starts[2]-interval '90 minutes' then 6 else 2 end; end if;
  first_size := n/3 + case when n%3>0 then 1 else 0 end;
  second_size := n/3 + case when n%3>1 then 1 else 0 end;
  middle_at := starts[first_size+1]-interval '90 minutes';
  late_at := starts[first_size+second_size+1]-interval '90 minutes';
  if now() >= late_at then return 6; end if;
  if now() >= middle_at then return 4; end if;
  return 2;
end; $$;

create or replace function public.release_winners_board(p_date text, p_league text, p_kind text) returns integer
language plpgsql security invoker set search_path = '' as $$
declare capacity integer; used integer; admitted integer := 0; c public.winners_candidates;
  cohort integer; prefix_used integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('winners:'||p_date||':'||p_league||':'||p_kind,0));
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

revoke all on function public.winners_prop_cohort(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.winners_prop_cohort(text,text,timestamptz) to service_role;
