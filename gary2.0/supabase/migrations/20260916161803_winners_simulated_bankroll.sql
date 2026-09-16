-- Prospective simulated bankroll. Original picks, rationales and legacy results
-- are never rewritten. Stakes are assigned atomically with board publication.
begin;
create schema if not exists gary_private;
create table public.gary_bankroll (
 id boolean primary key default true check(id),
 policy_version text not null default 'daily-bankroll-v1',
 started_at timestamptz not null default clock_timestamp(),
 initial_units numeric not null default 100 check(initial_units=100)
);
insert into public.gary_bankroll(id) values(true);
alter table public.gary_bankroll enable row level security;
revoke all on public.gary_bankroll from public,anon,authenticated;
grant select on public.gary_bankroll to anon,authenticated,service_role;
create policy bankroll_read on public.gary_bankroll for select to anon,authenticated using(true);
create function gary_private.immutable_bankroll() returns trigger
language plpgsql set search_path='' as $$ begin raise exception 'The bankroll start and policy are immutable'; end $$;
create trigger immutable_bankroll before update or delete on public.gary_bankroll
for each row execute function gary_private.immutable_bankroll();

alter table public.winners_board add column stake_units numeric(12,4) check(stake_units between 0 and 1.5);
alter table public.winners_board add column bankroll_policy text;
create index if not exists game_results_bankroll_ticket on public.game_results(game_date,league,game_id);
create index if not exists nfl_results_bankroll_ticket on public.nfl_results(game_date,game_id);
create index if not exists prop_results_bankroll_ticket on public.prop_results(game_date,sport,game_id);

-- Exact identity including the actual ticket; contradictory grades remain
-- unresolved and keep their risk reserved. Odds always come from publication.
create view gary_private.bankroll_ledger as
select b.candidate_id,b.game_date,b.league,b.kind,b.game_id,b.admitted_at,b.stake_units,
 c.pick_text,c.odds,c.commence_time,
 case when g.grades=1 then g.result else 'pending' end as result,
 case when g.grades=1 then g.settled_at end as settled_at,
 case when g.grades=1 then case g.result when 'won' then
   case when c.odds>0 then c.odds/100.0 else 100.0/abs(c.odds) end
   when 'lost' then -1 else 0 end else 0 end as flat_net_units
from public.winners_board b join public.winners_candidates c on c.id=b.candidate_id
cross join lateral (
 select count(distinct outcome) as grades,min(outcome) as result,max(at) as settled_at from (
  select case lower(trim(r.result)) when 'win' then 'won' when 'loss' then 'lost' when 'pushed' then 'push' when 'voided' then 'void' else lower(trim(r.result)) end outcome,
   greatest(r.created_at,r.updated_at) as at
  from public.game_results r where b.kind='game' and b.league<>'NFL' and r.game_date=b.game_date::date
   and r.league=b.league and r.game_id=b.game_id
   and lower(regexp_replace(trim(r.pick_text),'\s+',' ','g'))=lower(regexp_replace(trim(c.pick_text),'\s+',' ','g'))
  union all
  select case when r.season_type=1 then 'void' else case lower(trim(r.result)) when 'win' then 'won' when 'loss' then 'lost' when 'pushed' then 'push' when 'voided' then 'void' else lower(trim(r.result)) end end,
   greatest(r.created_at,r.updated_at)
  from public.nfl_results r where b.kind='game' and b.league='NFL' and r.game_date=b.game_date::date and r.game_id=b.game_id
   and lower(regexp_replace(trim(r.pick_text),'\s+',' ','g'))=lower(regexp_replace(trim(c.pick_text),'\s+',' ','g'))
  union all
  select case lower(trim(r.result)) when 'win' then 'won' when 'loss' then 'lost' when 'pushed' then 'push' when 'voided' then 'void' else lower(trim(r.result)) end,
   greatest(r.created_at,r.updated_at)
  from public.prop_results r where b.kind='prop' and r.game_date=b.game_date::date and upper(r.sport)=b.league and r.game_id=b.game_id
   and lower(trim(r.player_name))=lower(trim(b.pick_snapshot->>'player'))
   and regexp_replace(regexp_replace(lower(trim(r.prop_type)),'^player_',''),'[\s_]+','_','g')=
     regexp_replace(regexp_replace(regexp_replace(lower(trim(coalesce(b.pick_snapshot->>'prop',b.pick_snapshot->>'prop_type'))),'\s+[+-]?[0-9]+(\.[0-9]+)?$',''),'^player_',''),'[\s_]+','_','g')
   and r.line_value=case when coalesce(b.pick_snapshot->>'line','') ~ '^[+-]?[0-9]+(\.[0-9]+)?$' then (b.pick_snapshot->>'line')::numeric end
   and lower(trim(r.bet))=lower(trim(b.pick_snapshot->>'bet'))
 ) results where outcome in ('won','lost','push','void')
) g
where b.bankroll_policy='daily-bankroll-v1' and b.stake_units>0;
revoke all on gary_private.bankroll_ledger from public,anon,authenticated;
grant select on gary_private.bankroll_ledger to service_role;

create function gary_private.size_winners_bet() returns trigger
language plpgsql security invoker set search_path='' as $$
declare cfg public.gary_bankroll; c public.winners_candidates; decision jsonb;
 requested numeric:=0.25; allowed numeric:=0.25; equity numeric; open_risk numeric; game_risk numeric; day_risk numeric; amount numeric;
begin
 select * into cfg from public.gary_bankroll where id;
 if new.admitted_at<cfg.started_at or new.game_date<(cfg.started_at at time zone 'America/New_York')::date::text then return new;end if;
 -- One global lock serializes simultaneous sports and game/prop admissions.
 perform pg_advisory_xact_lock(1616092026);
 select * into c from public.winners_candidates where id=new.candidate_id;
 if c.commence_time<=clock_timestamp() or c.commence_time is null or c.odds is null or abs(c.odds)<100 then
  raise exception 'Bankroll requires an original, priced, pregame ticket';
 end if;
 select detail into decision from public.winners_decision_events
  where candidate_id=new.candidate_id and event='curated' order by id desc limit 1;
 if new.kind='game' then
  allowed:=case decision->>'assessment' when 'clear' then 1.5 when 'lean' then 1 when 'toss_up' then 0.5 else 0.25 end;
  if jsonb_typeof(decision->'stake_units')='number' and (decision->>'stake_units')::numeric in (0.25,0.5,1,1.5)
    and length(trim(coalesce(decision->>'stake_reason','')))>=10 and length(trim(coalesce(decision->>'price_reason','')))>=10 then
   requested:=least(allowed,(decision->>'stake_units')::numeric);
  end if;
 end if;
 -- Props use 0.25u until they have their own supported sizing review.
 select cfg.initial_units+coalesce(sum(stake_units*flat_net_units),0),
  coalesce(sum(stake_units) filter(where result='pending'),0),
  coalesce(sum(stake_units) filter(where result='pending' and league=new.league and game_id=new.game_id and game_date=new.game_date),0),
  coalesce(sum(stake_units) filter(where league=new.league and game_date=new.game_date),0)
 into equity,open_risk,game_risk,day_risk from gary_private.bankroll_ledger;
 -- Reserve half the remaining headroom for later daily coverage. Caps are
 -- 12u open, 2u per game across markets, 6u per sport/day, and available cash.
 amount:=greatest(0,trunc(least(requested,(12-open_risk)/2,(2-game_risk),(6-day_risk)/2,(equity-open_risk)/2)*10000)/10000);
 new.stake_units:=amount;
 new.bankroll_policy:=cfg.policy_version;
 insert into public.winners_decision_events(candidate_id,event,detail) values(new.candidate_id,'bankroll_committed',jsonb_build_object(
  'policy_version',cfg.policy_version,'requested_units',requested,'stake_units',amount,'equity_before',equity,
  'open_risk_before',open_risk,'game_risk_before',game_risk,'sport_day_risk_before',day_risk,
  'assessment',coalesce(decision->>'assessment','unreviewed'),
  'stake_reason',coalesce(decision->>'stake_reason','Minimum daily coverage stake; no complete supported sizing review.'),
  'price_reason',coalesce(decision->>'price_reason','Original published odds; measurable positive expected value is not established.'),
  'adjustment',case when amount=0 then 'Bankroll capacity exhausted; ticket remains a prediction, no funds invented.'
   when amount<requested then 'Reduced to preserve cash and exposure headroom for later coverage.' else 'Requested stake accepted.' end));
 return new;
end $$;
revoke all on function gary_private.size_winners_bet(),gary_private.immutable_bankroll() from public,anon,authenticated;
grant usage on schema gary_private to service_role;
grant execute on function gary_private.size_winners_bet() to service_role;
create trigger size_winners_bet before insert on public.winners_board
for each row execute function gary_private.size_winners_bet();

-- Public aggregate results only: never exposes the private selection reasoning
-- or access-controlled current tickets. Board RPC already includes new columns.
create function public.get_gary_bankroll() returns jsonb
language sql stable security definer set search_path='' as $$
 with ledger as materialized (select *,stake_units*flat_net_units net from gary_private.bankroll_ledger),
 totals as (select coalesce(sum(net),0) profit,
  coalesce(sum(stake_units) filter(where result='pending'),0) risk,
  coalesce(sum(stake_units) filter(where result in ('won','lost','push')),0) wagered,
  count(*) bets,count(*) filter(where result='won') wins,count(*) filter(where result='lost') losses,
  count(*) filter(where result='push') pushes,count(*) filter(where result='void') voids,
  count(*) filter(where result='pending') pending,
  coalesce(sum(flat_net_units),0) flat_profit from ledger),
 steps as (select candidate_id,settled_at,net,sum(net) over(order by settled_at,candidate_id) cumulative
  from ledger where result<>'pending'),
 drawdowns as (select cumulative,greatest(0,max(cumulative) over(order by settled_at,candidate_id))-cumulative drawdown from steps),
 days as (select (settled_at at time zone 'America/New_York')::date::text date,sum(net) net,sum(flat_net_units) flat_net
  from ledger where result<>'pending' group by 1),
 curve as (select date,sum(net) over(order by date) net_units,sum(flat_net) over(order by date) flat_units from days)
 select jsonb_build_object('policy_version',cfg.policy_version,'started_at',cfg.started_at,'started_date',(cfg.started_at at time zone 'America/New_York')::date::text,'initial_units',cfg.initial_units,
  'bankroll_units',cfg.initial_units+t.profit,'profit_units',t.profit,'growth_pct',100*t.profit/cfg.initial_units,
  'available_units',cfg.initial_units+t.profit-t.risk,'at_risk_units',t.risk,'wagered_units',t.wagered,
  'roi_pct',case when t.wagered>0 then 100*t.profit/t.wagered else null end,
  'win_pct',case when t.wins+t.losses>0 then 100.0*t.wins/(t.wins+t.losses) else null end,
  'bets',t.bets,'wins',t.wins,'losses',t.losses,'pushes',t.pushes,'voids',t.voids,'pending',t.pending,
  'flat_profit_units',t.flat_profit,'max_drawdown_units',coalesce((select max(drawdown) from drawdowns),0),
  'curve',coalesce((select jsonb_agg(to_jsonb(curve) order by date) from curve),'[]'::jsonb))
 from public.gary_bankroll cfg cross join totals t where cfg.id;
$$;
revoke all on function public.get_gary_bankroll() from public;
grant execute on function public.get_gary_bankroll() to anon,authenticated,service_role;
-- Freeze the bankroll context the reader actually saw alongside its original
-- evidence. Publication still rechecks all exposure under the global lock.
create function gary_private.snapshot_curation_bankroll() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 new.input_snapshot:=new.input_snapshot||jsonb_build_object('bankroll',public.get_gary_bankroll()-'curve');
 return new;
end $$;
revoke all on function gary_private.snapshot_curation_bankroll() from public,anon,authenticated;
grant execute on function gary_private.snapshot_curation_bankroll() to service_role;
create trigger snapshot_curation_bankroll before insert on public.winners_curation_runs
for each row execute function gary_private.snapshot_curation_bankroll();
notify pgrst,'reload schema';
commit;
