-- THE WINNERS GATE (founder GO, Sep 24 2026). A pick is on the board because
-- Gary is betting it with real money and a single-case reader grades the case
-- clear or lean (props: anything but unsupported). No seats per window, no
-- fills, no first dog, no cohorts, no count. The big game is the one rule
-- kept. Stakes: $100 minimum, no maximum, cash on hand the only trim.
-- Football plays can be scratched at the inactives. Spec:
-- docs/superpowers/specs/2026-09-24-winners-gate-design.md
--
-- Today's (Sep 24) board finishes under the old machinery; from Sep 25 the
-- old claims return nothing and the cleanup migration drops them.

alter table public.winners_board add column if not exists scratched_at timestamptz;
alter table public.winners_board add column if not exists scratch_reason text;
-- A finished read is 'graded' whatever the grade; the gate decides admission.
alter table public.winners_candidates drop constraint if exists winners_candidates_status_check;
alter table public.winners_candidates add constraint winners_candidates_status_check
  check (status in ('pending','reviewing','graded','qualified','rejected','unavailable','expired'));
alter table public.winners_board drop constraint if exists winners_board_stake_units_check;
alter table public.winners_board add constraint winners_board_stake_units_check check (stake_units >= 0);

grant usage on schema gary_private to service_role;

-- Gary sizes his own bet (pick_snapshot.gary_bet; props keep 'bet' for the side). The reader's stake is gone.
-- Whole dollars, $100 minimum, no top; the only trim is cash on hand.
create or replace function gary_private.size_winners_bet() returns trigger
language plpgsql security invoker set search_path='' as $$
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
 why:='Minimum $100 stake; Gary gave no sizing.';
 if coalesce((bet->>'play')::boolean,false) and jsonb_typeof(bet->'stake_dollars')='number' then
  dollars:=(bet->>'stake_dollars')::numeric;
  if dollars=trunc(dollars) and dollars>=100 then
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
  'assessment',coalesce(c.review->>'assessment','unreviewed'),
  'stake_reason',why,
  'adjustment',case when amount=0 then 'Bankroll cash exhausted; ticket remains a prediction, no funds invented.'
   when amount<requested then 'Reduced to the bankroll''s cash on hand.' else 'Requested stake accepted.' end));
 return new;
end $$;

-- A scratched play is void money.
create or replace view gary_private.bankroll_ledger as
select b.candidate_id,b.game_date,b.league,b.kind,b.game_id,b.admitted_at,b.stake_units,
 c.pick_text,c.odds,c.commence_time,
 case when b.scratched_at is not null then 'void' when g.grades=1 then g.result else 'pending' end as result,
 case when b.scratched_at is not null then b.scratched_at when g.grades=1 then g.settled_at end as settled_at,
 case when b.scratched_at is not null then 0 when g.grades=1 then case g.result when 'won' then
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

-- THE GATE. Called when a read finishes and by the sweep. Returns 'admitted'
-- or the reason it is not.
create or replace function gary_private.admit_winners_candidate(p_id bigint) returns text
language plpgsql security invoker set search_path='' as $$
declare c public.winners_candidates; grade text; play boolean:=false; big boolean:=false; ok boolean:=false; why text; stake numeric;
begin
 select * into c from public.winners_candidates where id=p_id for update;
 if not found then return 'missing'; end if;
 if c.admitted_at is not null then return 'already'; end if;
 if c.commence_time is null or c.commence_time<=clock_timestamp() then return 'kickoff'; end if;
 grade:=c.review->>'assessment';
 if grade is null or c.status<>'graded' then return 'unread'; end if;
 if c.policy_version='mlb-conviction-v4' and coalesce(c.pick_snapshot->>'price_endorsement','')<>'endorse' then
  why:='declined_price';
 else
  play:=coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false)
    and jsonb_typeof(c.pick_snapshot->'gary_bet'->'stake_dollars')='number'
    and (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric>=100;
  big:=c.kind='game' and exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id);
  if c.kind='game' then ok:=(play and grade in ('clear','lean')) or (big and grade<>'unsupported');
  else ok:=play and grade<>'unsupported'; end if;
  why:=case when ok then 'admitted' when grade='unsupported' then 'unsupported' when not play then 'gary_pass' else 'grade_'||grade end;
 end if;
 if not ok then
  insert into public.winners_decision_events(candidate_id,event,detail)
   values(p_id,'not_admitted',jsonb_build_object('why',why,'assessment',grade,'play',play,'big_game',big));
  return why;
 end if;
 stake:=case when play then (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric else 100 end;
 insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
  values(c.id,c.game_date,c.league,c.kind,c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),'winners-gate-v1',
   case when play then format('Gary plays it, $%s; reader: %s',trunc(stake),grade) else format('Big game; reader: %s',grade) end);
 update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
 insert into public.winners_decision_events(candidate_id,event,detail)
  values(c.id,'admitted',jsonb_build_object('gate',case when play then 'play_and_grade' else 'big_game' end,'assessment',grade,'stake_dollars',stake,'policy_version','winners-gate-v1'));
 return 'admitted';
end $$;
revoke all on function gary_private.admit_winners_candidate(bigint) from public,anon,authenticated;
grant execute on function gary_private.admit_winners_candidate(bigint) to service_role;

-- One candidate, any kind, leased to a reader. Reads start as candidates land.
create or replace function public.claim_winners_read() returns setof public.winners_candidates
language plpgsql security invoker set search_path='' as $$
declare chosen public.winners_candidates;
begin
 select * into chosen from public.winners_candidates c
 where c.game_date>='2026-09-25'
   and (c.status='pending' or (c.status='reviewing' and c.lease_until<clock_timestamp())
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

-- The read's verdict, then the gate. A grade outside the four is a failed read
-- (retried once); a read that lands after kickoff is expired.
create or replace function public.finish_winners_read(p_id bigint,p_attempt integer,p_grade text,p_review jsonb,p_reasons jsonb,p_model text,p_ms integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.winners_candidates; st text; why text;
begin
 select * into c from public.winners_candidates where id=p_id for update;
 if not found or c.status<>'reviewing' or c.attempts<>p_attempt or c.admitted_at is not null then return jsonb_build_object('stored',false); end if;
 st:=case when p_grade in ('clear','lean','toss_up','unsupported') then 'graded' else 'unavailable' end;
 if c.commence_time<=clock_timestamp() then st:='expired'; end if;
 update public.winners_candidates set status=st,reason=coalesce(p_grade,'unavailable'),
  review=case when st='graded' then coalesce(p_review,'{}'::jsonb)||jsonb_build_object('assessment',p_grade) else p_review end,
  review_model=p_model,review_ms=p_ms,reviewed_at=clock_timestamp(),lease_until=null where id=p_id;
 insert into public.winners_decision_events(candidate_id,event,detail)
  values(p_id,st,jsonb_build_object('assessment',p_grade,'review',p_review,'model',p_model,'attempt',p_attempt));
 if st='graded' and jsonb_typeof(p_reasons)='array' and jsonb_array_length(p_reasons)>=2 then
  insert into public.winners_reasons(candidate_id,reasons,model) values(p_id,p_reasons,p_model) on conflict (candidate_id) do nothing;
 end if;
 why:=case when st='graded' then gary_private.admit_winners_candidate(p_id) else st end;
 return jsonb_build_object('stored',true,'status',st,'admitted',why='admitted','why',why);
end $$;

-- Graded but not yet admitted (a bet that arrived after the read, a big game
-- named later): the sweep tries the gate again. Final answers are not retried.
create or replace function public.admit_winners_pending(p_date text) returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer:=0; r record;
begin
 for r in select c.id from public.winners_candidates c
   where c.game_date=p_date and c.status='graded' and c.admitted_at is null and c.commence_time>clock_timestamp()
     and not exists(select 1 from public.winners_decision_events e where e.candidate_id=c.id and e.event='not_admitted' and e.detail->>'why' in ('unsupported','declined_price'))
 loop
  if gary_private.admit_winners_candidate(r.id)='admitted' then n:=n+1; end if;
 end loop;
 return n;
end $$;

-- A published ticket stays immutable; the one change allowed is the scratch
-- itself (scratched_at and scratch_reason set once, nothing else touched).
create or replace function public.guard_winners_publication() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'winners_board' then
    if tg_op = 'UPDATE' and old.scratched_at is null and new.scratched_at is not null
       and (to_jsonb(new) - 'scratched_at' - 'scratch_reason') = (to_jsonb(old) - 'scratched_at' - 'scratch_reason') then
      return new;
    end if;
    raise exception 'Published Winners tickets are immutable';
  end if;
  if old.admitted_at is not null then
    raise exception 'An admitted Winners candidate is immutable';
  end if;
  return new;
end; $$;

-- Football inactives: a play comes off the board before kickoff. Once.
create or replace function public.scratch_winners_play(p_candidate_id bigint,p_reason text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare b public.winners_board;
begin
 select * into b from public.winners_board where candidate_id=p_candidate_id for update;
 if not found or b.scratched_at is not null then return false; end if;
 if exists(select 1 from public.winners_candidates c where c.id=p_candidate_id and c.commence_time<=clock_timestamp()) then return false; end if;
 update public.winners_board set scratched_at=clock_timestamp(),scratch_reason=left(coalesce(p_reason,''),400) where candidate_id=p_candidate_id;
 insert into public.winners_decision_events(candidate_id,event,detail) values(p_candidate_id,'scratched',jsonb_build_object('reason',p_reason));
 return true;
end $$;

-- What Gary sees when he sizes a bet: cash on hand and what is already out.
create or replace function public.winners_cash_position() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'cash_on_hand_dollars', round(((select initial_units from public.gary_bankroll where id)
    +coalesce(sum(l.stake_units*l.flat_net_units),0)
    -coalesce(sum(l.stake_units) filter(where l.result='pending'),0))*100),
  'open_plays', coalesce((select jsonb_agg(jsonb_build_object('league',o.league,'kind',o.kind,'pick_text',o.pick_text,
      'stake_dollars',round(o.stake_units*100),'commence_time',o.commence_time) order by o.commence_time)
    from gary_private.bankroll_ledger o where o.result='pending'),'[]'::jsonb))
 from gary_private.bankroll_ledger l;
$$;

-- Members' devices for the Winners push: everyone during the preview, then
-- founding accounts and active entitlements for ALL or the league.
create or replace function public.winners_push_devices(p_league text) returns setof text
language sql stable security definer set search_path='' as $$
 select t.device_token from public.push_tokens t
 where t.active
   and (now() < timestamptz '2026-10-01 00:00:00 America/New_York'
     or exists(select 1 from auth.users u where u.id::text=t.identity_id and u.created_at < timestamptz '2026-10-01 00:00:00 America/New_York')
     or exists(select 1 from public.user_entitlements e where e.installation_id=t.identity_id and e.livemode and e.status='active'
        and (e.expires_at is null or e.expires_at>now()) and e.product_key in ('ALL',upper(p_league))));
$$;

-- The nightly line, one row per board play.
create or replace function public.winners_ledger_lines(p_date text) returns setof jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('league',b.league,'kind',b.kind,'pick_text',c.pick_text,'odds',c.odds,
  'gary_play',coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false),'stake_dollars',round(b.stake_units*100),
  'grade',c.review->>'assessment','reason',b.reason,'scratched',b.scratched_at is not null,
  'slot',case when extract(hour from c.commence_time at time zone 'America/New_York')<16 then 'day'
              when extract(hour from c.commence_time at time zone 'America/New_York')<19 then 'early evening' else 'night' end,
  'price_band',case when c.odds<=-150 then 'fav -150+' when c.odds<0 then 'fav to -149' when c.odds<=130 then 'dog to +130' else 'dog +131+' end,
  'result',l.result,'net_dollars',round(l.stake_units*l.flat_net_units*100))
 from public.winners_board b join public.winners_candidates c on c.id=b.candidate_id
 left join gary_private.bankroll_ledger l on l.candidate_id=b.candidate_id
 where b.game_date=p_date order by c.commence_time,b.candidate_id;
$$;

-- The play page carries the scratch.
create or replace function public.get_winners_play(p_candidate_id bigint) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  v_c public.winners_candidates;
  v_b public.winners_board;
  v_desk text; v_cases jsonb; v_home text; v_away text; v_home_team text; v_away_team text; v_pick_is_home boolean;
begin
  select * into v_c from public.winners_candidates wc where wc.id = p_candidate_id and wc.admitted_at is not null;
  if not found then raise exception 'No such play'; end if;
  select * into v_b from public.winners_board wb where wb.candidate_id = p_candidate_id;
  if not found then raise exception 'No such play'; end if;
  if not gary_private.lab_can_see(v_c.game_date, v_c.league) then raise exception 'Locked'; end if;

  v_desk := v_c.evidence_snapshot->>'deskText';
  if v_c.kind = 'game' then
    v_home := coalesce(nullif(v_c.evidence_snapshot->>'caseHome', ''), nullif(v_b.pick_snapshot->>'path_home', ''));
    v_away := coalesce(nullif(v_c.evidence_snapshot->>'caseAway', ''), nullif(v_b.pick_snapshot->>'path_away', ''));
    v_home_team := coalesce(v_c.evidence_snapshot->>'homeTeam', v_b.pick_snapshot->>'homeTeam');
    v_away_team := coalesce(v_c.evidence_snapshot->>'awayTeam', v_b.pick_snapshot->>'awayTeam');
    v_pick_is_home := case
      when (v_c.evidence_snapshot->>'pickIsHome') in ('true', 'false') then (v_c.evidence_snapshot->>'pickIsHome')::boolean
      when v_home_team is not null then position(lower(v_home_team) in lower(v_c.pick_text)) = 1 end;
    if v_home is not null or v_away is not null then
      v_cases := jsonb_build_object('home', v_home, 'away', v_away, 'pick_is_home', v_pick_is_home,
                                    'home_team', v_home_team, 'away_team', v_away_team);
    end if;
  end if;

  return jsonb_build_object(
    'candidate', jsonb_build_object(
      'id', v_c.id, 'game_date', v_c.game_date, 'league', v_c.league, 'kind', v_c.kind, 'game_id', v_c.game_id,
      'pick_text', v_c.pick_text, 'odds', v_c.odds, 'commence_time', v_c.commence_time,
      'admitted_at', v_b.admitted_at, 'reason', v_b.reason, 'stake_units', v_b.stake_units,
      'scratched_at', v_b.scratched_at, 'scratch_reason', v_b.scratch_reason),
    'snapshot', v_b.pick_snapshot,
    'cases', v_cases,
    'briefing', nullif(v_c.evidence_snapshot->>'researchBriefing', ''),
    'reasons', (select r.reasons from public.winners_reasons r where r.candidate_id = v_c.id),
    'desk', jsonb_build_object(
      'chars', coalesce(length(v_desk), 0),
      'sections', coalesce((
        select jsonb_agg(jsonb_build_object('index', d.idx, 'title', d.title, 'chars', d.chars) order by d.idx)
        from gary_private.lab_desk_sections(v_desk) d), '[]'::jsonb)),
    'with_it', coalesce((
      select jsonb_agg(jsonb_build_object(
          'candidate_id', w.candidate_id, 'kind', w.kind, 'pick_text', wc.pick_text, 'odds', wc.odds,
          'stake_units', w.stake_units, 'reason', w.reason, 'pick_snapshot', w.pick_snapshot,
          'scratched_at', w.scratched_at)
        order by w.admitted_at, w.candidate_id)
      from public.winners_board w
      join public.winners_candidates wc on wc.id = w.candidate_id
      where w.game_date = v_c.game_date and w.league = v_c.league and w.game_id = v_c.game_id
        and w.candidate_id <> v_c.id), '[]'::jsonb),
    'ladder', public.line_ladder(v_c.league, v_c.game_date, v_c.game_id),
    'result', gary_private.lab_ticket_result(v_c.kind, v_c.league, v_c.game_date, v_c.game_id, v_c.pick_text, v_b.pick_snapshot),
    'live', (
      select to_jsonb(ls) from public.live_scores ls
      where v_c.game_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and ls.date = v_c.game_date::date
        and ls.league = v_c.league and ls.game_id = v_c.game_id
      order by ls.updated_at desc limit 1),
    'tape', gary_private.lab_tape(v_c.league, v_c.kind));
end $$;

-- Sep 24 finishes under the old machinery; Sep 25 on, the old claims are silent.
alter function public.claim_winners_curation(text,text) rename to claim_winners_curation_before_gate;
create function public.claim_winners_curation(p_date text,p_league text) returns setof public.winners_curation_runs
language plpgsql security invoker set search_path='' as $$
begin
 if p_date>='2026-09-25' then return; end if;
 return query select * from public.claim_winners_curation_before_gate(p_date,p_league);
end $$;
alter function public.claim_winners_props(text) rename to claim_winners_props_before_gate;
create function public.claim_winners_props(p_date text) returns setof public.winners_prop_selection_runs
language plpgsql security invoker set search_path='' as $$
begin
 if p_date>='2026-09-25' then return; end if;
 return query select * from public.claim_winners_props_before_gate(p_date);
end $$;
alter function public.ensure_winners_window_coverage(text,text) rename to ensure_winners_window_coverage_before_gate;
create function public.ensure_winners_window_coverage(p_date text,p_league text) returns integer
language plpgsql security invoker set search_path='' as $$
begin
 if p_date>='2026-09-25' then return 0; end if;
 return public.ensure_winners_window_coverage_before_gate(p_date,p_league);
end $$;

revoke all on function public.claim_winners_read(),public.finish_winners_read(bigint,integer,text,jsonb,jsonb,text,integer),
 public.admit_winners_pending(text),public.scratch_winners_play(bigint,text),public.winners_cash_position(),
 public.winners_push_devices(text),public.winners_ledger_lines(text),
 public.claim_winners_curation(text,text),public.claim_winners_curation_before_gate(text,text),
 public.claim_winners_props(text),public.claim_winners_props_before_gate(text),
 public.ensure_winners_window_coverage(text,text),public.ensure_winners_window_coverage_before_gate(text,text)
 from public,anon,authenticated;
grant execute on function public.claim_winners_read(),public.finish_winners_read(bigint,integer,text,jsonb,jsonb,text,integer),
 public.admit_winners_pending(text),public.scratch_winners_play(bigint,text),public.winners_cash_position(),
 public.winners_push_devices(text),public.winners_ledger_lines(text),
 public.claim_winners_curation(text,text),public.claim_winners_curation_before_gate(text,text),
 public.claim_winners_props(text),public.claim_winners_props_before_gate(text),
 public.ensure_winners_window_coverage(text,text),public.ensure_winners_window_coverage_before_gate(text,text)
 to service_role;
revoke all on function public.get_winners_play(bigint) from public;
grant execute on function public.get_winners_play(bigint) to anon, authenticated, service_role;
