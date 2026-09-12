-- Founder Sep 12: extract the strongest existing picks, roughly 25% of a
-- league's slate, normally <=5, while reserving coverage throughout the day.
-- This layer never modifies Gary's game decisions or already published tickets.
create table public.winners_curation_runs (
 id bigint generated always as identity primary key,
 game_date text not null, league text not null,
 policy_version text not null default 'daily-curation-v1' check(policy_version='daily-curation-v1'),
 fingerprint text not null unique, input_snapshot jsonb not null,
 status text not null default 'selecting' check(status in ('selecting','completed','failed','expired')),
 attempts integer not null default 1, lease_until timestamptz,
 selection jsonb, model text, error text, ms integer,
 created_at timestamptz not null default clock_timestamp(), completed_at timestamptz
);
alter table public.winners_curation_runs enable row level security;
revoke all on public.winners_curation_runs from public,anon,authenticated;
grant all on public.winners_curation_runs to service_role;
grant usage,select on sequence public.winners_curation_runs_id_seq to service_role;
create index winners_curation_day on public.winners_curation_runs(game_date,league);
create trigger winners_curation_immutable before update or delete on public.winners_curation_runs
for each row execute function public.guard_winners_selection();

-- Windows follow start times, not a fixed weekday clock. Group starts within
-- two hours of the window's first game; if needed merge the closest adjacent
-- windows to fit the five-place normal limit. NFL 4:05/4:25 share a window.
create function public.winners_daily_plan(p_date text,p_league text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare windows jsonb:='[]'; w jsonb; g record; last_start timestamptz; n integer:=0;
 target integer; count_windows integer; i integer; best integer; gap interval; best_gap interval;
 quotas integer[]; used integer; weight numeric; best_weight numeric; schedule jsonb;
begin
 if exists(select 1 from public.daily_slate where date::text=p_date and league=p_league and commence_time is null) then
   return jsonb_build_object('available',false,'reason','Slate contains a missing start time'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('game_id',bdl_game_id::text,'start',commence_time,'status',game_status)
   order by commence_time,bdl_game_id),'[]') into schedule from public.daily_slate
   where date::text=p_date and league=p_league and lower(coalesce(game_status,'')) not in ('cancelled','canceled','postponed');
 for g in select value v from jsonb_array_elements(schedule) loop
   n:=n+1;
   if last_start is null or (g.v->>'start')::timestamptz>=last_start+interval '2 hours' then
     windows:=windows||jsonb_build_array(jsonb_build_object('start',g.v->'start','end',g.v->'start','games',jsonb_build_array(g.v->>'game_id')));
     last_start:=(g.v->>'start')::timestamptz;
   else
     i:=jsonb_array_length(windows)-1; w:=windows->i;
     windows:=jsonb_set(windows,array[i::text],w||jsonb_build_object('end',g.v->'start','games',(w->'games')||jsonb_build_array(g.v->>'game_id')));
   end if;
 end loop;
 while jsonb_array_length(windows)>5 loop
   best:=0;best_gap:=null;
   for i in 0..jsonb_array_length(windows)-2 loop
     gap:=(windows->(i+1)->>'start')::timestamptz-(windows->i->>'end')::timestamptz;
     if best_gap is null or gap<best_gap then best:=i;best_gap:=gap;end if;
   end loop;
   w:=(windows->best)||jsonb_build_object('end',windows->(best+1)->'end','games',(windows->best->'games')||(windows->(best+1)->'games'));
   windows:=jsonb_set(windows,array[best::text],w)-(best+1);
 end loop;
 count_windows:=jsonb_array_length(windows);
 if n=0 then return jsonb_build_object('available',true,'slate',schedule,'windows',windows,'target',0);end if;
 target:=least(5,greatest(count_windows,ceil(n*0.25)::integer));
 quotas:=array_fill(1,array[count_windows]); used:=count_windows;
 -- Each window gets one reservation. Additional normal places favor the
 -- larger batches; selection may leave them unused when the evidence is weak.
 while used<target loop
   best:=1;best_weight:=-1;
   for i in 1..count_windows loop
     weight:=jsonb_array_length(windows->(i-1)->'games')::numeric/(quotas[i]+1);
     if weight>best_weight then best:=i;best_weight:=weight;end if;
   end loop;
   quotas[best]:=quotas[best]+1;used:=used+1;
 end loop;
 for i in 0..count_windows-1 loop
   windows:=jsonb_set(windows,array[i::text],windows->i||jsonb_build_object('number',i+1,'quota',quotas[i+1]));
 end loop;
 return jsonb_build_object('available',true,'slate',schedule,'windows',windows,'target',target,'slate_count',n);
end; $$;

create function public.claim_winners_curation(p_date text,p_league text) returns setof public.winners_curation_runs
language plpgsql security invoker set search_path='' as $$
declare plan jsonb; w jsonb; candidates jsonb; prior jsonb; snapshot jsonb; key text; r public.winners_curation_runs;
 used integer; window_used integer; reserved integer; capacity integer; first_start timestamptz;
begin
 if p_date<'2026-09-12' or p_date<>(clock_timestamp() at time zone 'America/New_York')::date::text then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('winners:'||p_date||':'||p_league||':game',0));
 if exists(select 1 from public.winners_curation_runs where game_date=p_date and league=p_league and status='selecting' and lease_until>clock_timestamp()) then return;end if;
 update public.winners_curation_runs set status='failed',error='Selection lease expired',completed_at=clock_timestamp(),lease_until=null
   where game_date=p_date and league=p_league and status='selecting';
 plan:=public.winners_daily_plan(p_date,p_league);
 if plan->'available'<>'true'::jsonb then return;end if;
 select count(*),coalesce(jsonb_agg(jsonb_build_object('candidate_id',b.candidate_id,'game_id',b.game_id,'reason',b.reason,'selection',e.detail)),'[]')
   into used,prior from public.winners_board b left join lateral (
     select detail from public.winners_decision_events where candidate_id=b.candidate_id and event='admitted' order by id desc limit 1
   )e on true where b.game_date=p_date and b.league=p_league and b.kind='game';
 if used>=6 then return;end if;
 for w in select value from jsonb_array_elements(plan->'windows') loop
   if (w->>'start')::timestamptz>clock_timestamp()+interval '90 minutes' or (w->>'end')::timestamptz<=clock_timestamp()+interval '2 minutes' then continue;end if;
   select count(*) into window_used from public.winners_board where game_date=p_date and league=p_league and kind='game' and w->'games' ? game_id;
   select count(*) into reserved from jsonb_array_elements(plan->'windows') later
     where (later->>'number')::integer>(w->>'number')::integer and (later->>'end')::timestamptz>clock_timestamp()
       and not exists(select 1 from public.winners_board b where b.game_date=p_date and b.league=p_league and b.kind='game' and later->'games' ? b.game_id);
   capacity:=least((plan->>'target')::integer-used-reserved,(w->>'quota')::integer-window_used);
   -- Unused earlier places can move forward, but never steal a later window.
   if (w->>'number')::integer=jsonb_array_length(plan->'windows') then capacity:=(plan->>'target')::integer-used;end if;
   if capacity<=0 and not (used=5 and reserved=0 and window_used>=1) then continue;end if;
   select jsonb_agg(to_jsonb(c) order by c.id),min(c.commence_time) into candidates,first_start from public.winners_candidates c
     where c.game_date=p_date and c.league=p_league and c.kind='game' and c.admitted_at is null
       and c.status<>'expired' and c.commence_time>clock_timestamp()+interval '2 minutes'
       and w->'games' ? c.game_id and c.odds is not null and nullif(c.pick_text,'') is not null
       and exists(select 1 from jsonb_array_elements(plan->'slate') s where s->>'game_id'=c.game_id
         and (s->>'start')::timestamptz=c.commence_time and lower(coalesce(s->>'status','')) not in ('live','in_progress','in progress','inprogress','final','completed','suspended'))
       and not exists(select 1 from public.winners_board b where b.game_date=p_date and b.league=p_league and b.kind='game' and b.market_key=c.market_key)
       and not exists(select 1 from public.winners_curation_runs old cross join lateral jsonb_array_elements(old.input_snapshot->'candidates') considered
         where old.game_date=p_date and old.league=p_league and old.status='completed' and considered->'id'=to_jsonb(c.id)
           and considered->'pick_snapshot'=c.pick_snapshot and considered->'evidence_snapshot'=c.evidence_snapshot);
   if candidates is null then continue;end if;
   -- Let a batch arrive together, then choose in time for someone waking at noon.
   if first_start>clock_timestamp()+interval '65 minutes' and exists(
     select 1 from jsonb_array_elements(plan->'slate') s where w->'games' ? (s->>'game_id')
       and (s->>'start')::timestamptz=first_start and not exists(select 1 from public.winners_candidates c
         where c.game_date=p_date and c.league=p_league and c.kind='game' and c.game_id=s->>'game_id')
   ) then continue;end if;
   snapshot:=jsonb_build_object('plan',plan,'window',w,'candidates',candidates,'prior',prior,'capacity',greatest(0,capacity),
     'used',used,'reserved',reserved,'observed_at',clock_timestamp());
   key:=md5(jsonb_build_object('date',p_date,'league',p_league,'window',w,'candidates',candidates,'prior',prior)::text);
   select * into r from public.winners_curation_runs where fingerprint=key for update;
   if found then
     if r.status in ('completed','expired') or r.attempts>=2 or r.completed_at>clock_timestamp()-interval '1 minute' then continue;end if;
     return query update public.winners_curation_runs set status='selecting',attempts=attempts+1,lease_until=clock_timestamp()+interval '10 minutes',error=null
       where id=r.id returning *;
   else
     return query insert into public.winners_curation_runs(game_date,league,fingerprint,input_snapshot,lease_until)
       values(p_date,p_league,key,snapshot,clock_timestamp()+interval '10 minutes') returning *;
   end if;
   return;
 end loop;
end; $$;

create function public.finish_winners_curation(p_id bigint,p_attempt integer,p_selection jsonb,p_model text,p_ms integer,p_error text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.winners_curation_runs; item jsonb; original jsonb; c public.winners_candidates; seen bigint[]:='{}';
 n integer:=0; used integer; why text; plan jsonb; extra boolean:=false;
begin
 select * into r from public.winners_curation_runs where id=p_id;
 if not found then return jsonb_build_object('completed',false,'reason','Unknown selection');end if;
 perform pg_advisory_xact_lock(hashtextextended('winners:'||r.game_date||':'||r.league||':game',0));
 select * into r from public.winners_curation_runs where id=p_id for update;
 if r.status='completed' and r.attempts=p_attempt and r.selection=p_selection then return jsonb_build_object('completed',true,'already_recorded',true);end if;
 if r.status<>'selecting' or r.attempts<>p_attempt or r.lease_until<=clock_timestamp() then return jsonb_build_object('completed',false,'reason','Stale selection attempt');end if;
 why:=p_error;
 if why is null then
 begin
   plan:=public.winners_daily_plan(r.game_date,r.league);
   if plan is distinct from r.input_snapshot->'plan' then raise exception 'Slate changed during selection';end if;
   if jsonb_typeof(p_selection->'ranked_candidates') is distinct from 'array' or
     jsonb_array_length(p_selection->'ranked_candidates')<>jsonb_array_length(r.input_snapshot->'candidates') then raise exception 'Incomplete comparative selection';end if;
   for item in select value from jsonb_array_elements(p_selection->'ranked_candidates') loop
     if (item->>'candidate_id')::bigint=any(seen) then raise exception 'Duplicate candidate';end if;
     seen:=array_append(seen,(item->>'candidate_id')::bigint);
     select value into original from jsonb_array_elements(r.input_snapshot->'candidates') where value->'id'=item->'candidate_id';
     if original is null then raise exception 'Unknown candidate';end if;
     select * into c from public.winners_candidates where id=(item->>'candidate_id')::bigint for update;
     if c.pick_snapshot is distinct from original->'pick_snapshot' or c.evidence_snapshot is distinct from original->'evidence_snapshot'
       or c.commence_time is distinct from (original->>'commence_time')::timestamptz or c.admitted_at is not null
       or c.commence_time<=clock_timestamp()+interval '30 seconds' then raise exception 'Candidate changed or kickoff reached';end if;
     if jsonb_typeof(item->'selected') is distinct from 'boolean' or item->>'assessment' not in ('clear','lean','toss_up','unsupported')
       or length(trim(coalesce(item->>'reason','')))<10 then raise exception 'Invalid assessment';end if;
     if item->'selected'='true'::jsonb then
       n:=n+1;
       if item->>'assessment' not in ('clear','lean') then raise exception 'Toss-ups and unsupported picks cannot enter Winners';end if;
     end if;
   end loop;
   select count(*) into used from public.winners_board where game_date=r.game_date and league=r.league and kind='game';
   if used<>(r.input_snapshot->>'used')::integer then raise exception 'Board changed during selection';end if;
   if n>(r.input_snapshot->>'capacity')::integer then
     extra:=used+n=6 and n=(r.input_snapshot->>'capacity')::integer+1 and (r.input_snapshot->>'reserved')::integer=0
       and (r.input_snapshot->'window'->>'number')::integer=jsonb_array_length(plan->'windows') and (plan->>'target')::integer=5
       and not exists(select 1 from jsonb_array_elements(p_selection->'ranked_candidates') i where i->'selected'='true'::jsonb and i->>'assessment'<>'clear')
       and not exists(select 1 from jsonb_array_elements(r.input_snapshot->'prior') i where coalesce(i->'selection'->>'assessment','')<>'clear');
     if not extra then raise exception 'Selection exceeds reserved capacity';end if;
   end if;
   if used+n>6 then raise exception 'Daily hard limit exceeded';end if;
 exception when others then why:=sqlerrm;end;
 end if;
 if why is not null then
   update public.winners_curation_runs set status='failed',error=why,model=p_model,ms=p_ms,completed_at=clock_timestamp(),lease_until=null where id=r.id;
   return jsonb_build_object('completed',false,'reason',why);
 end if;
 for item in select value from jsonb_array_elements(p_selection->'ranked_candidates') loop
   select * into c from public.winners_candidates where id=(item->>'candidate_id')::bigint;
   insert into public.winners_decision_events(candidate_id,event,detail) values(c.id,'curated',item||jsonb_build_object('curation_run_id',r.id,'policy_version',r.policy_version));
   if item->'selected'='true'::jsonb then
     insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
       values(c.id,c.game_date,c.league,'game',c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),r.policy_version,item->>'reason');
     update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
     insert into public.winners_decision_events(candidate_id,event,detail) values(c.id,'admitted',item||jsonb_build_object('curation_run_id',r.id,'policy_version',r.policy_version,'sixth_exception',extra));
   end if;
 end loop;
 update public.winners_curation_runs set status='completed',selection=p_selection,model=p_model,ms=p_ms,error=null,completed_at=clock_timestamp(),lease_until=null where id=r.id;
 return jsonb_build_object('completed',true,'admitted',n,'curation_run_id',r.id);
end; $$;

-- Preserve the historical and prop release function. New game admissions are
-- exclusively the atomic curation commit above, never underdog/confidence fill.
alter function public.release_winners_board(text,text,text) rename to release_winners_board_before_curation;
create function public.release_winners_board(p_date text,p_league text,p_kind text) returns integer
language plpgsql security invoker set search_path='' as $$
begin
 if p_kind='game' and p_date>='2026-09-12' then return 0;end if;
 return public.release_winners_board_before_curation(p_date,p_league,p_kind);
end; $$;
revoke all on function public.winners_daily_plan(text,text),public.claim_winners_curation(text,text),
 public.finish_winners_curation(bigint,integer,jsonb,text,integer,text),public.release_winners_board(text,text,text),
 public.release_winners_board_before_curation(text,text,text) from public,anon,authenticated;
grant execute on function public.winners_daily_plan(text,text),public.claim_winners_curation(text,text),
 public.finish_winners_curation(bigint,integer,jsonb,text,integer,text),public.release_winners_board(text,text,text) to service_role;
