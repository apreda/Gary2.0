-- GARY'S CARD (founder GO, Oct 12 2026 evening: "just fix the judge yourself ... he ranks them, then we send the
-- best rank one to winners"). Three graders in three weeks separated nothing (lean 82-71-3, toss-up 9-9,
-- unsupported 9-9, NFL 0 clear of 14 after the Oct 11 rewrite), and the bet step's parser had recorded 53 of 55
-- "passes" with no reason: Gary's answer was dropped on its ticket id (garyBet.js, fixed the same night).
--
-- The game path now: every pick runs as before through the bet step; right after, the same session places the
-- pick on today's card (public.winners_card_placements), one placement at a time (public.winners_card_turns), seeing
-- the day's earlier picks in his own words. The earlier picks never move. The top of the card is seated on Winners
-- at his amount 75 minutes before kickoff (public.seat_the_card): one in five of the day's slate, rounded up, once
-- the card holds at least half the slate. A seated pick he passed takes the number ask (Oct 8: he does not veto).
-- Big games keep their rule (the judge still reads them; on at his number). Props keep daily-props-v1. The daily
-- floor stays, ordered by the card. The judge no longer reads an ordinary game pick.

-- ─── The card ────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.winners_card_placements (
  id bigserial primary key,
  game_date text not null,
  candidate_id bigint not null unique references public.winners_candidates(id) on delete cascade,
  above_candidate_id bigint references public.winners_candidates(id) on delete set null,
  slot_seen integer,                               -- the slot he answered (1 = top); null for the day's first pick
  card_size_seen integer not null default 0,
  why text not null default '',
  is_default boolean not null default false,       -- the answer was missing or malformed: placed at the bottom
  serialized boolean not null default true,        -- false when the turn lease could not be taken in time
  model text,
  placed_at timestamptz not null default clock_timestamp()
);
create index if not exists winners_card_placements_day on public.winners_card_placements(game_date, placed_at, id);
alter table public.winners_card_placements enable row level security;
revoke all on public.winners_card_placements from public, anon, authenticated;

create table if not exists public.winners_card_turns (
  game_date text primary key,
  holder text not null,
  lease_until timestamptz not null
);
alter table public.winners_card_turns enable row level security;
revoke all on public.winners_card_turns from public, anon, authenticated;

-- One placement at a time: a three-minute lease on the day's card.
create or replace function public.card_claim_turn(p_date text, p_holder text)
returns boolean language plpgsql set search_path='' as $$
declare got boolean;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_holder,'')='' then raise exception 'Invalid turn claim'; end if;
  insert into public.winners_card_turns(game_date, holder, lease_until)
   values (p_date, p_holder, clock_timestamp() + interval '3 minutes')
  on conflict (game_date) do update
   set holder = excluded.holder, lease_until = excluded.lease_until
   where public.winners_card_turns.lease_until < clock_timestamp() or public.winners_card_turns.holder = excluded.holder
  returning true into got;
  return coalesce(got, false);
end $$;
revoke all on function public.card_claim_turn(text,text) from public, anon, authenticated;
grant execute on function public.card_claim_turn(text,text) to service_role;

create or replace function public.card_release_turn(p_date text, p_holder text)
returns void language sql set search_path='' as $$
  delete from public.winners_card_turns where game_date = p_date and holder = p_holder;
$$;
revoke all on function public.card_release_turn(text,text) from public, anon, authenticated;
grant execute on function public.card_release_turn(text,text) to service_role;

-- The card in order: each placement goes directly above the pick it named, or at the bottom.
create or replace function gary_private.card_order(p_date text)
returns table(candidate_id bigint, rank integer, of integer)
language plpgsql stable set search_path='' as $$
declare r record; ordered bigint[] := '{}'; pos integer; i integer; n integer;
begin
  for r in select p.candidate_id, p.above_candidate_id from public.winners_card_placements p
           where p.game_date = p_date order by p.placed_at, p.id loop
    pos := case when r.above_candidate_id is null then null else array_position(ordered, r.above_candidate_id) end;
    if pos is null then ordered := ordered || r.candidate_id;
    else ordered := ordered[1:pos-1] || r.candidate_id || ordered[pos:array_length(ordered,1)];
    end if;
  end loop;
  n := coalesce(array_length(ordered,1), 0);
  for i in 1..n loop
    candidate_id := ordered[i]; rank := i; of := n; return next;
  end loop;
end $$;

-- What the pick runner shows Gary: the candidate's own day, the card top to bottom, each pick in his words from
-- when he made it (the private weighing; the rationale where there is none). Service role only: the weighing is
-- never shown in the app.
create or replace function public.card_state(p_league text, p_game_id text)
returns jsonb language plpgsql stable set search_path='' as $$
declare c public.winners_candidates; card jsonb;
begin
  select * into c from public.winners_candidates x
   where x.kind='game' and x.league=upper(p_league) and x.game_id=p_game_id
   order by x.created_at desc limit 1;
  if not found then return jsonb_build_object('found', false); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'candidate_id', y.id, 'slot', o.rank, 'league', y.league, 'pick_text', y.pick_text, 'odds', y.odds,
    'matchup', coalesce(y.pick_snapshot->>'awayTeam','') || ' @ ' || coalesce(y.pick_snapshot->>'homeTeam',''),
    'commence_time', y.commence_time,
    'words', coalesce(nullif(y.pick_snapshot->>'weighing',''), y.pick_snapshot->>'rationale', '')
  ) order by o.rank), '[]'::jsonb) into card
  from gary_private.card_order(c.game_date) o join public.winners_candidates y on y.id = o.candidate_id
  where y.id <> c.id;
  return jsonb_build_object('found', true, 'candidate_id', c.id, 'game_date', c.game_date,
    'placed', exists(select 1 from public.winners_card_placements p where p.candidate_id = c.id), 'card', card);
end $$;
revoke all on function public.card_state(text,text) from public, anon, authenticated;
grant execute on function public.card_state(text,text) to service_role;

create or replace function public.card_place(p_candidate_id bigint, p_above bigint, p_slot integer, p_card_size integer,
                                             p_why text, p_is_default boolean, p_serialized boolean, p_model text)
returns jsonb language plpgsql set search_path='' as $$
declare c public.winners_candidates; o record; above bigint := p_above;
begin
  select * into c from public.winners_candidates where id = p_candidate_id for update;
  if not found then return jsonb_build_object('placed', false, 'why', 'missing'); end if;
  if c.kind <> 'game' then return jsonb_build_object('placed', false, 'why', 'not_a_game'); end if;
  if exists (select 1 from public.winners_card_placements p where p.candidate_id = c.id) then return jsonb_build_object('placed', false, 'why', 'already'); end if;
  if above is not null and not exists (select 1 from public.winners_card_placements p where p.candidate_id = above and p.game_date = c.game_date) then
    above := null;   -- an anchor that is not on today's card: the bottom
  end if;
  insert into public.winners_card_placements(game_date, candidate_id, above_candidate_id, slot_seen, card_size_seen, why, is_default, serialized, model)
  values (c.game_date, c.id, above, p_slot, coalesce(p_card_size,0), coalesce(p_why,''), coalesce(p_is_default,false), coalesce(p_serialized,true), p_model);
  select x.rank, x.of into o from gary_private.card_order(c.game_date) x where x.candidate_id = c.id;
  insert into public.winners_decision_events(candidate_id, event, detail)
  values (c.id, 'card_placed', jsonb_build_object('slot', o.rank, 'of', o.of, 'slot_seen', p_slot, 'card_size_seen', p_card_size,
          'default', coalesce(p_is_default,false), 'serialized', coalesce(p_serialized,true), 'model', p_model));
  return jsonb_build_object('placed', true, 'slot', o.rank, 'of', o.of);
end $$;
revoke all on function public.card_place(bigint,bigint,integer,integer,text,boolean,boolean,text) from public, anon, authenticated;
grant execute on function public.card_place(bigint,bigint,integer,integer,text,boolean,boolean,text) to service_role;

-- ─── Admission: the card seats, big games keep their rule ────────────────────────────────────────────────────
create or replace function gary_private.admit_winners_candidate(p_id bigint)
 returns text language plpgsql set search_path='' as $function$
declare c public.winners_candidates; grade text; play boolean:=false; big boolean:=false; forced boolean:=false; ok boolean:=false;
        why text; stake numeric; seat jsonb; policy text; label text;
begin
 select * into c from public.winners_candidates where id=p_id for update;
 if not found then return 'missing'; end if;
 if c.admitted_at is not null then return 'already'; end if;
 if c.kind='prop' then return 'props_selection'; end if;   -- props: public.finish_winners_props
 if c.commence_time is null or c.commence_time<=clock_timestamp() then return 'kickoff'; end if;
 grade:=c.review->>'assessment';
 big:=exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id);
 select e.detail into seat from public.winners_decision_events e where e.candidate_id=p_id and e.event='card_seated' order by e.occurred_at desc limit 1;
 if not big and seat is null then return 'not_seated'; end if;          -- only the card seats an ordinary game pick
 if big and (grade is null or c.status<>'graded') then return 'unread'; end if;   -- a big game still carries the judge's read
 if c.policy_version='mlb-conviction-v4' and coalesce(c.pick_snapshot->>'price_endorsement','')<>'endorse' then
  why:='declined_price';
 else
  play:=coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false)
    and jsonb_typeof(c.pick_snapshot->'gary_bet'->'stake_dollars')='number'
    and (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric>=100;
  stake:=case when play then (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric else 0 end;
  forced:=coalesce((c.pick_snapshot->'gary_bet'->>'forced')::boolean,false);
  ok:=play;   -- on at Gary's number; a pass takes the number ask
  why:=case when ok then 'admitted' else 'needs_gary_number' end;
 end if;
 if not ok then
  if why='needs_gary_number' then
   if not exists(select 1 from public.winners_decision_events e where e.candidate_id=p_id and e.event='needs_gary_number') then
    insert into public.winners_decision_events(candidate_id,event,detail) values(p_id,'needs_gary_number',jsonb_build_object('assessment',grade,'big_game',big,'card',seat));
   end if;
   return why;
  end if;
  insert into public.winners_decision_events(candidate_id,event,detail)
   values(p_id,'not_admitted',jsonb_build_object('why',why,'assessment',grade,'play',play,'big_game',big,'stake_dollars',stake));
  return why;
 end if;
 policy:=case when big then 'winners-coach-v1' else 'winners-card-v1' end;
 label:=case when big then 'Big game' else format('Gary''s card: #%s of %s today', seat->>'rank', seat->>'of') end;
 insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
  values(c.id,c.game_date,c.league,c.kind,c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),policy,
   case when forced then format('%s, Gary''s number: $%s', label, trunc(stake))
        else format('%s; Gary plays it, $%s', label, trunc(stake)) end
   || case when big then format('; judge: %s', grade) else '' end);
 update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
 insert into public.winners_decision_events(candidate_id,event,detail)
  values(c.id,'admitted',jsonb_build_object('gate',case when big then 'big_game' else 'card' end,'assessment',grade,'card',seat,
         'stake_dollars',stake,'forced',forced,'policy_version',policy));
 return 'admitted';
end $function$;

-- The seating pass (the Winners worker, every 30 seconds): one in five of the day's slate, rounded up, once the
-- card holds at least half the slate; a pick seats inside 75 minutes of its own kickoff, 20 minutes out at the
-- least; big games are neither counted nor seated here. Seats are final: the count never exceeds K.
create or replace function public.seat_the_card(p_date text)
returns integer language plpgsql set search_path='' as $$
declare n_slate integer; n_card integer; n_seated integer; k integer; r record; n integer := 0; why text;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  select count(*) into n_slate from public.daily_slate s
   where s.date = p_date::date and s.league in ('MLB','NFL','NCAAF')
     and not exists (select 1 from public.winners_big_games g where g.game_date = p_date and g.league = s.league and g.game_id = s.bdl_game_id::text);
  select count(*) into n_card from public.winners_card_placements p join public.winners_candidates c on c.id = p.candidate_id
   where p.game_date = p_date
     and not exists (select 1 from public.winners_big_games g where g.game_date = p_date and g.league = c.league and g.game_id = c.game_id);
  n_slate := greatest(n_slate, n_card);
  if n_card = 0 or n_card * 2 < n_slate then return 0; end if;
  k := greatest(1, ceil(n_slate / 5.0))::integer;
  select count(*) into n_seated from public.winners_decision_events e join public.winners_candidates c on c.id = e.candidate_id
   where e.event = 'card_seated' and c.game_date = p_date;
  for r in
    select c.id, c.admitted_at, c.commence_time, row_number() over (order by o.rank) as rank, count(*) over () as of
    from gary_private.card_order(p_date) o join public.winners_candidates c on c.id = o.candidate_id
    where not exists (select 1 from public.winners_big_games g where g.game_date = p_date and g.league = c.league and g.game_id = c.game_id)
    order by o.rank
  loop
    exit when r.rank > k;
    if r.admitted_at is not null then continue; end if;
    if exists (select 1 from public.winners_decision_events e where e.candidate_id = r.id and e.event = 'card_seated') then
      why := gary_private.admit_winners_candidate(r.id);   -- a seated pass whose number arrived
      if why = 'admitted' then n := n + 1; end if;
      continue;
    end if;
    if n_seated >= k then exit; end if;
    if r.commence_time is null or r.commence_time <= clock_timestamp() + interval '20 minutes'
       or r.commence_time > clock_timestamp() + interval '75 minutes' then continue; end if;
    insert into public.winners_decision_events(candidate_id, event, detail)
    values (r.id, 'card_seated', jsonb_build_object('rank', r.rank, 'of', r.of, 'k', k, 'slate', n_slate, 'card', n_card));
    n_seated := n_seated + 1;
    why := gary_private.admit_winners_candidate(r.id);
    if why = 'admitted' then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.seat_the_card(text) from public, anon, authenticated;
grant execute on function public.seat_the_card(text) to service_role;

-- The sweep admits a big game whose read or number arrived late, and a seated pick whose number arrived.
create or replace function public.admit_winners_pending(p_date text)
 returns integer language plpgsql set search_path='' as $function$
declare n integer:=0; r record;
begin
 for r in select c.id from public.winners_candidates c
   where c.game_date=p_date and c.kind='game' and c.admitted_at is null and c.commence_time>clock_timestamp()
     and (c.status='graded' or exists(select 1 from public.winners_decision_events e where e.candidate_id=c.id and e.event='card_seated'))
     and not exists(
       select 1 from public.winners_decision_events e
       where e.candidate_id=c.id and e.event='not_admitted' and e.detail->>'why' in ('unsupported','declined_price','grade_toss_up')
         and not exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id))
 loop
  if gary_private.admit_winners_candidate(r.id)='admitted' then n:=n+1; end if;
 end loop;
 return n;
end $function$;

-- The judge reads big games only now.
create or replace function public.claim_winners_read()
 returns setof public.winners_candidates language plpgsql set search_path='' as $function$
declare chosen public.winners_candidates;
begin
 select * into chosen from public.winners_candidates c
 where c.kind='game'
   and exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id)
   and (c.status='pending' or (c.status='reviewing' and c.lease_until<clock_timestamp())
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

-- The number ask reaches a seated pick he passed, read or not.
create or replace function public.claim_big_game_stakes(p_date text)
 returns table(id bigint, league text, pick_text text, odds integer, commence_time timestamp with time zone, matchup text, rationale text, case_home text, case_away text, grade text, attempts integer, minutes_to_kickoff numeric)
 language plpgsql set search_path='' as $function$
declare r record;
begin
 for r in
  select c.id, c.league, c.pick_text, c.odds, c.commence_time,
   coalesce(c.pick_snapshot->>'awayTeam','')||' @ '||coalesce(c.pick_snapshot->>'homeTeam','') as matchup,
   c.pick_snapshot->>'rationale' as rationale, c.evidence_snapshot->>'caseHome' as case_home, c.evidence_snapshot->>'caseAway' as case_away,
   c.review->>'assessment' as grade,
   (select count(*)::integer from public.winners_decision_events e where e.candidate_id=c.id and e.event='big_game_ask') as attempts,
   round(extract(epoch from (c.commence_time-clock_timestamp()))/60,1) as minutes_to_kickoff
  from public.winners_candidates c
  where c.game_date=p_date and c.kind='game' and c.admitted_at is null
   and (c.status='graded' or exists(select 1 from public.winners_decision_events e where e.candidate_id=c.id and e.event='card_seated'))
   and c.commence_time>clock_timestamp()+interval '30 seconds'
   and not coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false)
   and exists(select 1 from public.winners_decision_events e where e.candidate_id=c.id and e.event='needs_gary_number')
   and not exists(select 1 from public.winners_decision_events e where e.candidate_id=c.id and e.event='big_game_ask' and e.occurred_at>clock_timestamp()-interval '8 minutes')
  order by c.commence_time, c.id
 loop
  insert into public.winners_decision_events(candidate_id,event,detail) values(r.id,'big_game_ask',jsonb_build_object('attempt',r.attempts+1,'minutes_to_kickoff',r.minutes_to_kickoff));
  id:=r.id; league:=r.league; pick_text:=r.pick_text; odds:=r.odds; commence_time:=r.commence_time; matchup:=r.matchup; rationale:=r.rationale;
  case_home:=r.case_home; case_away:=r.case_away; grade:=r.grade; attempts:=r.attempts+1; minutes_to_kickoff:=r.minutes_to_kickoff;
  return next;
 end loop;
end $function$;

-- The daily floor reads the card instead of the retired grade.
create or replace function gary_private.winners_daily_floor(p_date text)
 returns text language plpgsql set search_path='' as $function$
declare v_when timestamptz; c public.winners_candidates; v_own text[]; slot text; play boolean; stake numeric;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  if exists (select 1 from public.winners_board w
             where w.game_date = p_date and w.policy_version <> 'darts-top-v1' and w.scratched_at is null) then
    return 'has_play';
  end if;
  v_when := coalesce(gary_private.day_pass_at(p_date::date),
                     (select min(x.commence_time) - interval '45 minutes' from public.winners_candidates x
                      where x.game_date = p_date and x.kind = 'game'));
  if v_when is null then return 'no_games'; end if;
  if clock_timestamp() < v_when then return 'waiting'; end if;
  -- Sunday's NFL games post as their own free picks and never become the day's free pick.
  v_own := array(select f.game_id from gary_private.sunday_nfl_free_games(p_date::date) f);

  select * into c from public.winners_candidates x
  where x.game_date = p_date and x.kind = 'game' and x.admitted_at is null
    and x.commence_time > clock_timestamp() + interval '20 minutes'
    and x.odds is not null and abs(x.odds) >= 100
    and not (x.league = 'NFL' and x.game_id = any(v_own))
  order by coalesce((select o.rank from gary_private.card_order(p_date) o where o.candidate_id = x.id), 999),
           coalesce((x.pick_snapshot->'gary_bet'->>'play')::boolean, false) desc,
           coalesce(case when jsonb_typeof(x.pick_snapshot->'gary_bet'->'stake_dollars') = 'number'
                         then (x.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric end, 0) desc,
           x.commence_time asc
  limit 1
  for update;
  if not found then return 'no_pick'; end if;

  slot := coalesce((select '#'||o.rank||' of '||o.of from gary_private.card_order(p_date) o where o.candidate_id = c.id), 'not on the card');
  play := coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean, false)
          and jsonb_typeof(c.pick_snapshot->'gary_bet'->'stake_dollars') = 'number'
          and (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric >= 100;
  stake := case when play then (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric else 100 end;

  begin   -- a floor failure is logged and never stops the free pick that runs after it
  insert into public.winners_board(candidate_id, game_date, league, kind, game_id, ticket_key, market_key, pick_snapshot,
                                   admitted_at, policy_version, reason)
  values (c.id, c.game_date, c.league, c.kind, c.game_id, c.ticket_key, c.market_key, c.pick_snapshot, clock_timestamp(),
          'winners-floor-v1',
          case when play then format('Daily floor: nothing else on Winners today. Gary plays it, $%s; card: %s', trunc(stake), slot)
               else format('Daily floor: nothing else on Winners today. Gary passed, $100 minimum; card: %s', slot) end);
  update public.winners_candidates set admitted_at = clock_timestamp() where id = c.id;
  insert into public.winners_decision_events(candidate_id, event, detail)
  values (c.id, 'admitted', jsonb_build_object('gate', 'daily_floor', 'card', slot, 'stake_dollars', stake,
          'play', play, 'policy_version', 'winners-floor-v1', 'floor_at', v_when));
  exception when others then
    insert into public.winners_decision_events(candidate_id, event, detail)
    values (c.id, 'floor_failed', jsonb_build_object('error', sqlerrm, 'floor_at', v_when));
    return 'failed: ' || sqlerrm;
  end;
  return 'admitted ' || c.id;
end $function$;

-- Judge the card weekly: the board against the rest, and the card's slots against results.
create or replace function public.winners_judge_report(p_from text, p_to text)
returns table(bucket text, league text, w bigint, l bigint, p bigint)
language sql stable set search_path='' as $$
 with picks as (
  select c.id, c.league, c.game_id, c.admitted_at, c.review->>'assessment' as grade,
    coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false) as play,
    (select o.rank from gary_private.card_order(c.game_date) o where o.candidate_id = c.id) as slot
  from public.winners_candidates c
  where c.kind='game' and c.game_date between p_from and p_to and c.league in ('MLB','NFL','NCAAF')
 ), res as (
  select game_id, league, result::text as result from public.game_results where game_date::text between p_from and p_to
  union all
  select game_id, 'NFL', result::text from public.nfl_results where game_date::text between p_from and p_to
 ), j as (
  select distinct on (pk.id) pk.*, r.result from picks pk join res r on r.game_id=pk.game_id and r.league=pk.league
  where r.result in ('won','lost','push') order by pk.id
 ), rows_ as (
  select case when admitted_at is not null then '1 board' when play then '2 bet, not on' else '3 pass' end as b, league as lg, result from j
  union all select case when admitted_at is not null then '1 board' when play then '2 bet, not on' else '3 pass' end, 'ALL', result from j
  union all select '4 grade '||coalesce(grade,'none'), 'ALL', result from j
  union all select '5 '||case when admitted_at is not null then 'board' when play then 'bet, not on' else 'pass' end||' · '||coalesce(grade,'none'), 'ALL', result from j
  union all select '6 card '||case when slot is null then 'not placed' when slot=1 then '#1' when slot<=3 then '#2-3' when slot<=5 then '#4-5' else '#6+' end, 'ALL', result from j
  union all select '6 card '||case when slot is null then 'not placed' when slot=1 then '#1' when slot<=3 then '#2-3' when slot<=5 then '#4-5' else '#6+' end, league, result from j
 )
 select b, lg, count(*) filter(where result='won'), count(*) filter(where result='lost'), count(*) filter(where result='push')
 from rows_ group by b, lg order by b, lg;
$$;
revoke all on function public.winners_judge_report(text,text) from public,anon,authenticated;
grant execute on function public.winners_judge_report(text,text) to service_role;
