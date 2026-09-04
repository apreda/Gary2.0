-- Exact-ticket qualification and immutable publication. Service-only evidence;
-- the app sees only admitted ticket snapshots. All clocks are actual instants.
create table public.winners_candidates (
  id bigint generated always as identity primary key,
  game_date text not null,
  league text not null,
  kind text not null check (kind in ('game','prop')),
  game_id text not null,
  ticket_key text not null unique,
  market_key text not null,
  pick_text text not null,
  odds integer,
  commence_time timestamptz,
  pick_snapshot jsonb not null,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  policy_version text not null default 'exact-ticket-v2',
  status text not null default 'pending' check (status in ('pending','reviewing','qualified','rejected','unavailable','expired')),
  reason text,
  review jsonb,
  review_model text,
  review_ms integer,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  lease_until timestamptz,
  admitted_at timestamptz
);
create index winners_candidates_queue on public.winners_candidates(status, commence_time);
create index winners_candidates_day on public.winners_candidates(game_date, league, kind);
alter table public.winners_candidates enable row level security;
revoke all on public.winners_candidates from anon, authenticated;
grant all on public.winners_candidates to service_role;
grant usage, select on sequence public.winners_candidates_id_seq to service_role;

create table public.winners_board (
  candidate_id bigint primary key references public.winners_candidates(id),
  game_date text not null,
  league text not null,
  kind text not null check (kind in ('game','prop')),
  game_id text not null,
  ticket_key text not null,
  market_key text not null,
  pick_snapshot jsonb not null,
  admitted_at timestamptz not null,
  policy_version text not null,
  reason text not null,
  unique(game_date, league, kind, market_key)
);
create index winners_board_day on public.winners_board(game_date, league, kind);
alter table public.winners_board enable row level security;
create policy winners_board_read on public.winners_board for select to anon, authenticated using (true);
grant select on public.winners_board to anon, authenticated;
grant all on public.winners_board to service_role;

create table public.winners_decision_events (
  id bigint generated always as identity primary key,
  candidate_id bigint not null references public.winners_candidates(id),
  occurred_at timestamptz not null default now(),
  event text not null,
  detail jsonb not null default '{}'::jsonb
);
alter table public.winners_decision_events enable row level security;
revoke all on public.winners_decision_events from anon, authenticated;
grant all on public.winners_decision_events to service_role;
grant usage, select on sequence public.winners_decision_events_id_seq to service_role;

create function public.guard_winners_publication() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'winners_board' then
    raise exception 'Published Winners tickets are immutable';
  end if;
  if old.admitted_at is not null then
    raise exception 'An admitted Winners candidate is immutable';
  end if;
  return new;
end; $$;
create trigger winners_board_immutable before update or delete on public.winners_board
for each row execute function public.guard_winners_publication();
create trigger winners_candidate_admitted_immutable before update or delete on public.winners_candidates
for each row execute function public.guard_winners_publication();

create function public.claim_winners_candidate() returns setof public.winners_candidates
language plpgsql security invoker set search_path = '' as $$
declare chosen public.winners_candidates;
begin
  select * into chosen from public.winners_candidates
  where (status = 'pending' or (status = 'reviewing' and lease_until < now()))
    and created_at < now()-interval '30 seconds'
    and attempts < 2 and commence_time > now() + interval '30 seconds'
  order by commence_time, created_at, id for update skip locked limit 1;
  if not found then return; end if;
  update public.winners_candidates set status='reviewing', attempts=attempts+1,
    lease_until=now()+interval '15 minutes' where id=chosen.id returning * into chosen;
  insert into public.winners_decision_events(candidate_id,event,detail)
    values(chosen.id,'review_started',jsonb_build_object('attempt',chosen.attempts));
  return next chosen;
end; $$;

create function public.finish_winners_review(p_id bigint, p_attempt integer, p_status text, p_reason text,
 p_review jsonb, p_model text, p_ms integer) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare c public.winners_candidates;
begin
  select * into c from public.winners_candidates where id=p_id for update;
  if not found or c.status <> 'reviewing' or c.attempts <> p_attempt or c.admitted_at is not null then return false; end if;
  if p_status not in ('qualified','rejected','unavailable') then raise exception 'Invalid review status'; end if;
  if c.commence_time <= now() then p_status := 'expired'; p_reason := 'Review completed after kickoff'; end if;
  update public.winners_candidates set status=p_status, reason=p_reason, review=p_review,
    review_model=p_model, review_ms=p_ms, reviewed_at=now(), lease_until=null where id=p_id;
  insert into public.winners_decision_events(candidate_id,event,detail)
    values(p_id,p_status,jsonb_build_object('reason',p_reason,'review',p_review,'model',p_model,'attempt',p_attempt));
  return true;
end; $$;

-- Capacity follows the distinct kickoff windows. Two early slots, four at
-- the middle window's T-90, six at the late window's T-90. With one window,
-- all six are available. Unused slots carry forward; no minimum is filled.
create function public.winners_capacity(p_date text, p_league text, p_kind text) returns integer
language plpgsql stable security invoker set search_path = '' as $$
declare starts timestamptz[]; n integer; middle_at timestamptz; late_at timestamptz;
begin
  if p_kind='game' then return 6; end if;
  if exists(select 1 from public.daily_slate where date::text=p_date and league=p_league and commence_time is null) then return 2; end if;
  select array_agg(t order by t) into starts from
    (select distinct commence_time::timestamptz t from public.daily_slate
     where date::text=p_date and league=p_league and commence_time is not null) s;
  n := coalesce(array_length(starts,1),0);
  if n=0 then return 0; end if;
  if n=1 then return 6; end if;
  middle_at := starts[(n/3)+1] - interval '90 minutes';
  late_at := starts[((2*n)/3)+1] - interval '90 minutes';
  if now() >= late_at then return 6; end if;
  if now() >= middle_at then return 4; end if;
  return 2;
end; $$;

create function public.release_winners_board(p_date text, p_league text, p_kind text) returns integer
language plpgsql security invoker set search_path = '' as $$
declare capacity integer; used integer; admitted integer := 0; c public.winners_candidates;
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
    insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
      values(c.id,c.game_date,c.league,c.kind,c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,now(),c.policy_version,coalesce(c.reason,'Exact-ticket review qualified'));
    update public.winners_candidates set admitted_at=now() where id=c.id;
    insert into public.winners_decision_events(candidate_id,event,detail)
      values(c.id,'admitted',jsonb_build_object('capacity',capacity,'price',c.odds,'policy_version',c.policy_version));
    used := used+1; admitted := admitted+1;
  end loop;
  -- Every unadmitted ticket that reached kickoff has a terminal recorded reason.
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

revoke all on function public.guard_winners_publication() from public,anon,authenticated;
revoke all on function public.claim_winners_candidate() from public,anon,authenticated;
revoke all on function public.finish_winners_review(bigint,integer,text,text,jsonb,text,integer) from public,anon,authenticated;
revoke all on function public.winners_capacity(text,text,text) from public,anon,authenticated;
revoke all on function public.release_winners_board(text,text,text) from public,anon,authenticated;
grant execute on function public.claim_winners_candidate(), public.finish_winners_review(bigint,integer,text,text,jsonb,text,integer), public.winners_capacity(text,text,text), public.release_winners_board(text,text,text) to service_role;
