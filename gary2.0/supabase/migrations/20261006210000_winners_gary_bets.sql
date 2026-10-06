-- WINNERS = GARY'S BETS (founder GO, Oct 6 2026). Gary is an independent bettor end to end: he makes every pick
-- (unchanged), then in the bet step (src/services/pickdesk/garyBet.js) writes the case for betting it and the
-- case for passing on it, and decides bet or pass and how much from a bankroll he manages himself.
--
-- Admission:
--   * MLB game picks are the one automatic Winners play (founder: "The only thing we are automatically
--     qualifying for Winners is the MLB game picks for the playoffs"). At Gary's amount when he bets it, $100
--     when he passes.
--   * Everything else (NFL and college games, props in every sport, Sunday Night Football and college main
--     games included) is on Winners when Gary bets it through the new step (gary_bet.step = 'bet-step-oct6').
--     A pick decided under the old question is never admitted after the fact.
--   * Out: the reader's grade, the $300 lines (NFL games, props, college lean), automatic SNF and college main
--     games. Kept: college's spread (over 21.5) and conference limits.
-- Amounts: no limits (founder: "Gary should be able to manage his own bankroll completely on his own"). Any whole
-- dollar amount; the bankroll trigger trims only to the cash on hand.
-- Also here: what Gary reads about his bankroll (winners_bankroll_brief), his notebook (gary_bankroll_notebook,
-- written daily by scripts/run-bankroll-notebook.js), and the founder's scoreboard of bets against passes
-- (gary_bet_scoreboard; never shown to Gary).

create or replace function gary_private.admit_winners_candidate(p_id bigint)
 returns text
 language plpgsql
 set search_path to ''
as $function$
declare c public.winners_candidates; play boolean:=false; ok boolean:=false; why text; stake numeric:=0;
        big_spread boolean:=false; small boolean:=false; pick text; away text; home text; away_ok boolean; home_ok boolean;
        automatic_mlb boolean:=false; bet jsonb;
begin
 select * into c from public.winners_candidates where id=p_id for update;
 if not found then return 'missing'; end if;
 if c.admitted_at is not null then return 'already'; end if;
 if c.commence_time is null or c.commence_time<=clock_timestamp() then return 'kickoff'; end if;
 automatic_mlb:=c.kind='game' and c.league='MLB';
 if c.kind='game' then
  if nullif(trim(c.game_id),'') is null or nullif(trim(c.pick_text),'') is null
     or c.odds is null or abs(c.odds::numeric)<100
     or c.pick_snapshot->'odds' is distinct from to_jsonb(c.odds)
     or coalesce(c.pick_snapshot->>'game_id',c.pick_snapshot->>'bdl_game_id','')<>c.game_id
     or trim(coalesce(c.pick_snapshot->>'pick',''))<>c.pick_text
     or coalesce(c.pick_snapshot->>'league','')<>c.league then
   return 'invalid_original_ticket';
  end if;
  -- A queued draft is insufficient. Match the complete published original,
  -- including its kickoff, rather than constructing or rewriting a ticket.
  if not exists (
   select 1 from public.daily_picks d
   cross join lateral jsonb_array_elements(d.picks) published(pick)
   where d.date=c.game_date and published.pick=c.pick_snapshot
     and (published.pick->>'commence_time')::timestamptz=c.commence_time
  ) and not (c.league='NFL' and exists (
   select 1 from public.weekly_nfl_picks w
   cross join lateral jsonb_array_elements(w.picks) published(pick)
   where published.pick=c.pick_snapshot
     and (published.pick->>'commence_time')::timestamptz=c.commence_time
  )) then return 'unpublished'; end if;
 end if;
 big_spread:=c.kind='game' and not automatic_mlb and abs(coalesce(nullif(c.pick_snapshot->>'spread','')::numeric,0))>21.5;
 if c.kind='game' and c.league='NCAAF' then
  pick:=coalesce(c.pick_snapshot->>'pick', c.pick_text, '');
  away:=coalesce(c.pick_snapshot->>'awayTeam',''); home:=coalesce(c.pick_snapshot->>'homeTeam','');
  away_ok:=gary_private.winners_power_team(c.pick_snapshot->>'awayConference', away);
  home_ok:=gary_private.winners_power_team(c.pick_snapshot->>'homeConference', home);
  if away<>'' and pick ilike away||'%' then small:=not away_ok;
  elsif home<>'' and pick ilike home||'%' then small:=not home_ok;
  else small:=not (away_ok and home_ok); end if;
 end if;
 bet:=c.pick_snapshot->'gary_bet';
 play:=case when jsonb_typeof(bet->'play') is distinct from 'boolean' then false
            when not (bet->>'play')::boolean then false
            when jsonb_typeof(bet->'stake_dollars') is distinct from 'number' then false
            else (bet->>'stake_dollars')::numeric>0 and (bet->>'stake_dollars')::numeric=trunc((bet->>'stake_dollars')::numeric) end;
 stake:=case when play then (bet->>'stake_dollars')::numeric else 0 end;
 if big_spread then why:='spread_over_21_5';
 elsif small then why:='small_conference';
 elsif automatic_mlb then ok:=true;
 elsif coalesce(bet->>'step','')<>'bet-step-oct6' then why:='old_bet_question';
 elsif play then ok:=true;
 else why:='gary_pass'; end if;
 if not ok then
  insert into public.winners_decision_events(candidate_id,event,detail)
   values(p_id,'not_admitted',jsonb_build_object('why',why,'play',play,'stake_dollars',stake,'step',bet->>'step','spread',c.pick_snapshot->>'spread',
          'away_conference',c.pick_snapshot->>'awayConference','home_conference',c.pick_snapshot->>'homeConference'));
  return why;
 end if;
 insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
  values(c.id,c.game_date,c.league,c.kind,c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),'winners-gary-bets-v1',
   case when automatic_mlb and play then format('MLB game pick; automatic qualification; Gary bets it, $%s',trunc(stake))
        when automatic_mlb then 'MLB game pick; automatic qualification; Gary passed'
        else format('Gary bets it, $%s',trunc(stake)) end);
 update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
 insert into public.winners_decision_events(candidate_id,event,detail)
  values(c.id,'admitted',jsonb_build_object('gate',case when automatic_mlb then 'mlb_game_automatic' else 'gary_bet' end,
   'play',play,'stake_dollars',stake,'step',bet->>'step','policy_version','winners-gary-bets-v1'));
 return 'admitted';
end $function$;

-- Insert-time admission: an MLB game pick, or any pick Gary bets through the new step. The sweep recovers gaps.
create or replace function gary_private.admit_published_automatic_game()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
 if (new.kind='game' and new.league='MLB')
    or (new.pick_snapshot->'gary_bet'->>'step'='bet-step-oct6'
        and case when jsonb_typeof(new.pick_snapshot->'gary_bet'->'play')='boolean' then (new.pick_snapshot->'gary_bet'->>'play')::boolean else false end) then
  perform gary_private.admit_winners_candidate(new.id);
 end if;
 return new;
end $function$;

-- The 30-second sweep: today's unadmitted, unstarted MLB game picks and Gary's bets. A final no (spread, conference,
-- a pass, the old question) is not asked again; an unpublished ticket is retried until it publishes.
create or replace function public.admit_winners_pending(p_date text)
 returns integer
 language plpgsql
 set search_path to ''
as $function$
declare n integer:=0; r record;
begin
 for r in select c.id from public.winners_candidates c
   where c.game_date=p_date and c.admitted_at is null
     and c.commence_time>clock_timestamp()
     and ((c.kind='game' and c.league='MLB')
       or (c.pick_snapshot->'gary_bet'->>'step'='bet-step-oct6'
           and case when jsonb_typeof(c.pick_snapshot->'gary_bet'->'play')='boolean' then (c.pick_snapshot->'gary_bet'->>'play')::boolean else false end))
     and not exists (select 1 from public.winners_decision_events e where e.candidate_id=c.id and e.event='not_admitted'
       and e.detail->>'why' in ('spread_over_21_5','small_conference','gary_pass','old_bet_question'))
 loop
  if gary_private.admit_winners_candidate(r.id)='admitted' then n:=n+1; end if;
 end loop;
 return n;
end $function$;

-- The bankroll books Gary's amount, any whole dollars above zero, trimmed only to the cash on hand. An MLB game
-- pick he passed on (automatic) books $100.
create or replace function gary_private.size_winners_bet()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare cfg public.gary_bankroll; c public.winners_candidates; bet jsonb;
 requested numeric:=1; equity numeric; open_risk numeric; amount numeric; dollars numeric; why text;
begin
 select * into cfg from public.gary_bankroll where id;
 if new.admitted_at<cfg.started_at or new.game_date<(cfg.started_at at time zone 'America/New_York')::date::text then return new;end if;
 perform pg_advisory_xact_lock(1616092026);
 select * into c from public.winners_candidates where id=new.candidate_id;
 if c.commence_time<=clock_timestamp() or c.commence_time is null or c.odds is null or abs(c.odds)<100 then
  raise exception 'Bankroll requires an original, priced, pregame ticket';
 end if;
 bet:=c.pick_snapshot->'gary_bet';
 why:='Automatic MLB game pick Gary passed on: $100.';
 if coalesce((bet->>'play')::boolean,false) and jsonb_typeof(bet->'stake_dollars')='number' then
  dollars:=(bet->>'stake_dollars')::numeric;
  if dollars=trunc(dollars) and dollars>0 then
   requested:=dollars/100;
   why:=coalesce(nullif(trim(bet->>'why'),''),'Gary sized it.');
  end if;
 end if;
 select cfg.initial_units+coalesce(sum(stake_units*flat_net_units),0),
  coalesce(sum(stake_units) filter(where result='pending'),0)
 into equity,open_risk from gary_private.bankroll_ledger;
 amount:=greatest(0,trunc(least(requested,equity-open_risk)*10000)/10000);
 new.stake_units:=amount;
 new.bankroll_policy:=cfg.policy_version;
 insert into public.winners_decision_events(candidate_id,event,detail) values(new.candidate_id,'bankroll_committed',jsonb_build_object(
  'policy_version',cfg.policy_version,'requested_units',requested,'requested_dollars',requested*100,'stake_units',amount,'stake_dollars',amount*100,
  'equity_before',equity,'open_risk_before',open_risk,
  'stake_reason',why,
  'adjustment',case when amount=0 then 'Bankroll cash exhausted; ticket remains a prediction, no funds invented.'
   when amount<requested then 'Reduced to the bankroll''s cash on hand.' else 'Requested stake accepted.' end));
 return new;
end $function$;

-- What Gary reads about his money in the bet step and the notebook: where he started, where he is, the season,
-- the last seven days, yesterday's bets one by one, and what is riding. Overall numbers only: no split by kind
-- of bet (feedback: he follows a split instead of reading the game).
create or replace function public.winners_bankroll_brief()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with cfg as (select initial_units, started_at from public.gary_bankroll where id),
  t as (select (now() at time zone 'America/New_York')::date as d),
  l as (select b.*, b.game_date::date as gd, b.stake_units*100 as stake, round(b.stake_units*b.flat_net_units*100) as net
        from gary_private.bankroll_ledger b),
  s as (select * from l where result in ('won','lost','push')),
  tally as (select gd, result, stake, net from s)
  select jsonb_build_object(
    'start_dollars', round(cfg.initial_units*100),
    'started_on', (cfg.started_at at time zone 'America/New_York')::date,
    'equity_dollars', round((cfg.initial_units+coalesce((select sum(stake_units*flat_net_units) from l),0))*100),
    'riding_dollars', coalesce((select round(sum(stake)) from l where result='pending'),0),
    'cash_dollars', round((cfg.initial_units+coalesce((select sum(stake_units*flat_net_units) from l),0))*100)
                    - coalesce((select round(sum(stake)) from l where result='pending'),0),
    'season', (select jsonb_build_object('won',count(*) filter (where result='won'),'lost',count(*) filter (where result='lost'),
                 'push',count(*) filter (where result='push'),'net',coalesce(sum(net),0),'risked',coalesce(round(sum(stake)),0)) from tally),
    'last7', (select jsonb_build_object('from',t.d-7,'to',t.d-1,'won',count(*) filter (where result='won'),'lost',count(*) filter (where result='lost'),
                 'push',count(*) filter (where result='push'),'net',coalesce(sum(net),0),'risked',coalesce(round(sum(stake)),0))
              from tally where gd between t.d-7 and t.d-1),
    'yesterday', (select jsonb_build_object('date',t.d-1,'won',count(*) filter (where result='won'),'lost',count(*) filter (where result='lost'),
                 'push',count(*) filter (where result='push'),'net',coalesce(sum(net),0),'risked',coalesce(round(sum(stake)),0),
                 'bets',coalesce(jsonb_agg(jsonb_build_object('pick_text',pick_text,'league',league,'kind',kind,'odds',odds,
                   'stake',round(stake),'result',result,'net',net) order by commence_time) filter (where gd=t.d-1),'[]'::jsonb))
              from s where gd=t.d-1),
    'riding', (select coalesce(jsonb_agg(jsonb_build_object('pick_text',pick_text,'league',league,'kind',kind,'odds',odds,
                 'stake',round(stake),'game_date',game_date) order by commence_time),'[]'::jsonb) from l where result='pending'))
  from cfg, t;
$function$;
revoke all on function public.winners_bankroll_brief() from public, anon, authenticated;
grant execute on function public.winners_bankroll_brief() to service_role;

-- Gary's notebook: his own words about running the bankroll, rewritten once a day and shown in every bet step.
create table if not exists public.gary_bankroll_notebook (
  written_for date primary key,
  notebook text not null check (length(btrim(notebook)) between 1 and 8000),
  model text,
  bankroll jsonb,
  created_at timestamptz not null default now()
);
alter table public.gary_bankroll_notebook enable row level security;
revoke all on public.gary_bankroll_notebook from public, anon, authenticated;
grant select, insert on public.gary_bankroll_notebook to service_role;

-- One pick's graded outcome, matched the way gary_private.bankroll_ledger matches a board play.
create or replace function gary_private.pick_outcome(p_kind text, p_league text, p_game_date text, p_game_id text, p_pick_text text, p_snap jsonb)
 returns text
 language sql
 stable
 set search_path to ''
as $function$
  select case when count(distinct outcome)=1 then min(outcome) else 'pending' end from (
    select case lower(trim(r.result)) when 'win' then 'won' when 'loss' then 'lost' when 'pushed' then 'push' when 'voided' then 'void'
             else lower(trim(r.result)) end as outcome
    from public.game_results r
    where p_kind='game' and p_league<>'NFL' and r.game_date=p_game_date::date and r.league=p_league and r.game_id=p_game_id
      and lower(regexp_replace(trim(r.pick_text),'\s+',' ','g'))=lower(regexp_replace(trim(p_pick_text),'\s+',' ','g'))
    union all
    select case when r.season_type=1 then 'void' else case lower(trim(r.result)) when 'win' then 'won' when 'loss' then 'lost'
             when 'pushed' then 'push' when 'voided' then 'void' else lower(trim(r.result)) end end
    from public.nfl_results r
    where p_kind='game' and p_league='NFL' and r.game_date=p_game_date::date and r.game_id=p_game_id
      and lower(regexp_replace(trim(r.pick_text),'\s+',' ','g'))=lower(regexp_replace(trim(p_pick_text),'\s+',' ','g'))
    union all
    select case lower(trim(r.result)) when 'win' then 'won' when 'loss' then 'lost' when 'pushed' then 'push' when 'voided' then 'void'
             else lower(trim(r.result)) end
    from public.prop_results r
    where p_kind='prop' and r.game_date=p_game_date::date and upper(r.sport)=p_league and r.game_id=p_game_id
      and lower(trim(r.player_name))=lower(trim(p_snap->>'player'))
      and regexp_replace(regexp_replace(lower(trim(r.prop_type)),'^player_',''),'[\s_]+','_','g')
          =regexp_replace(regexp_replace(regexp_replace(lower(trim(coalesce(p_snap->>'prop',p_snap->>'prop_type'))),'\s+[+-]?[0-9]+(\.[0-9]+)?$',''),'^player_',''),'[\s_]+','_','g')
      and r.line_value=case when coalesce(p_snap->>'line','') ~ '^[+-]?[0-9]+(\.[0-9]+)?$' then (p_snap->>'line')::numeric end
      and lower(trim(r.bet))=lower(trim(p_snap->>'bet'))
  ) x where outcome in ('won','lost','push','void');
$function$;

-- THE SCOREBOARD (founder and Claude only; Gary never sees it): every pick decided through the new bet step,
-- by league, kind and decision. A bet should beat a pass. flat_net_per_100 = the result at $100 a pick, so bets
-- and passes compare on the same money; board_net = what the bankroll actually made on the bets.
create or replace function public.gary_bet_scoreboard(p_from text default '2026-10-06', p_to text default null)
 returns table(league text, kind text, decision text, picks bigint, won bigint, lost bigint, push bigint, pending bigint,
               flat_net_per_100 numeric, board_bet numeric, board_net numeric)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with c as (
    select c.id, c.league, c.kind, c.odds,
           case when jsonb_typeof(c.pick_snapshot->'gary_bet'->'play')='boolean' and (c.pick_snapshot->'gary_bet'->>'play')='true' then 'bet' else 'pass' end as decision,
           gary_private.pick_outcome(c.kind,c.league,c.game_date,c.game_id,c.pick_text,c.pick_snapshot) as outcome
    from public.winners_candidates c
    where c.game_date>=p_from and (p_to is null or c.game_date<=p_to)
      and c.pick_snapshot->'gary_bet'->>'step'='bet-step-oct6')
  select c.league, c.kind, c.decision, count(*), count(*) filter (where c.outcome='won'), count(*) filter (where c.outcome='lost'),
         count(*) filter (where c.outcome='push'), count(*) filter (where c.outcome='pending'),
         round(sum(case when c.outcome='won' then case when c.odds>0 then c.odds::numeric else 10000.0/abs(c.odds) end
                        when c.outcome='lost' then -100 else 0 end)),
         round(sum(l.stake_units*100)), round(sum(l.stake_units*l.flat_net_units*100))
  from c left join gary_private.bankroll_ledger l on l.candidate_id=c.id
  group by 1,2,3 order by 1,2,3;
$function$;
revoke all on function public.gary_bet_scoreboard(text, text) from public, anon, authenticated;
grant execute on function public.gary_bet_scoreboard(text, text) to service_role;
