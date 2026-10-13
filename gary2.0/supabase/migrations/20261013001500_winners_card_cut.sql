-- GARY'S CUT (founder, Oct 12 2026 night: "I don't want to mandate a certain amount, that is not how a real human
-- would do it, what if we have only 1 or 5 strong plays?" ... "Okay let's try it"). The card stays; the count (one in
-- five of the slate) goes. At every placement the same session also says which picks on the card, the new one
-- included, are in his book today: money on them. The latest answer is the day's cut. A pick on the card goes to
-- Winners when the latest cut includes it, inside 75 minutes of its own kickoff, at his bet-step amount; a seated pick
-- stays seated whatever a later cut says. The day's first pick is placed with no call and is decided by the second
-- placement's cut (a lone yes or no is what saturates). Big games, props, darts and the floor are unchanged.

alter table public.winners_card_placements add column if not exists book_ids bigint[];

-- The day's cut: the newest placement that answered the book question.
create or replace function gary_private.card_book(p_date text)
returns bigint[] language sql stable set search_path='' as $$
  select coalesce((select p.book_ids from public.winners_card_placements p
                   where p.game_date = p_date and p.book_ids is not null
                   order by p.placed_at desc, p.id desc limit 1), '{}'::bigint[]);
$$;

-- What the pick runner shows Gary: the card in order, each line marked when it is in his book or already placed.
create or replace function public.card_state(p_league text, p_game_id text)
returns jsonb language plpgsql stable set search_path='' as $$
declare c public.winners_candidates; card jsonb; book bigint[];
begin
  select * into c from public.winners_candidates x
   where x.kind='game' and x.league=upper(p_league) and x.game_id=p_game_id
   order by x.created_at desc limit 1;
  if not found then return jsonb_build_object('found', false); end if;
  book := gary_private.card_book(c.game_date);
  select coalesce(jsonb_agg(jsonb_build_object(
    'candidate_id', y.id, 'slot', o.rank, 'league', y.league, 'pick_text', y.pick_text, 'odds', y.odds,
    'matchup', coalesce(y.pick_snapshot->>'awayTeam','') || ' @ ' || coalesce(y.pick_snapshot->>'homeTeam',''),
    'commence_time', y.commence_time,
    'words', coalesce(nullif(y.pick_snapshot->>'weighing',''), y.pick_snapshot->>'rationale', ''),
    'in_book', (y.id = any(book)),
    'placed', (y.admitted_at is not null)
  ) order by o.rank), '[]'::jsonb) into card
  from gary_private.card_order(c.game_date) o join public.winners_candidates y on y.id = o.candidate_id
  where y.id <> c.id;
  return jsonb_build_object('found', true, 'candidate_id', c.id, 'game_date', c.game_date,
    'placed', exists(select 1 from public.winners_card_placements p where p.candidate_id = c.id), 'card', card);
end $$;
revoke all on function public.card_state(text,text) from public, anon, authenticated;
grant execute on function public.card_state(text,text) to service_role;

drop function if exists public.card_place(bigint,bigint,integer,integer,text,boolean,boolean,text);
create or replace function public.card_place(p_candidate_id bigint, p_above bigint, p_slot integer, p_card_size integer,
                                             p_why text, p_is_default boolean, p_serialized boolean, p_model text,
                                             p_book bigint[] default null)
returns jsonb language plpgsql set search_path='' as $$
declare c public.winners_candidates; o record; above bigint := p_above; book bigint[] := null;
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
  if p_book is not null then
    -- his book: only ids on today's card, plus every pick already placed on Winners (a seat is final)
    select coalesce(array_agg(distinct x.candidate_id), '{}'::bigint[]) into book
    from (select p.candidate_id from public.winners_card_placements p where p.game_date = c.game_date and p.candidate_id = any(p_book)
          union select p.candidate_id from public.winners_card_placements p join public.winners_candidates y on y.id = p.candidate_id
                where p.game_date = c.game_date and y.admitted_at is not null) x;
    update public.winners_card_placements set book_ids = book where candidate_id = c.id;
  end if;
  select x.rank, x.of into o from gary_private.card_order(c.game_date) x where x.candidate_id = c.id;
  insert into public.winners_decision_events(candidate_id, event, detail)
  values (c.id, 'card_placed', jsonb_build_object('slot', o.rank, 'of', o.of, 'slot_seen', p_slot, 'card_size_seen', p_card_size,
          'default', coalesce(p_is_default,false), 'serialized', coalesce(p_serialized,true), 'model', p_model,
          'book', book, 'in_book', (book is not null and c.id = any(book))));
  return jsonb_build_object('placed', true, 'slot', o.rank, 'of', o.of, 'book', book);
end $$;
revoke all on function public.card_place(bigint,bigint,integer,integer,text,boolean,boolean,text,bigint[]) from public, anon, authenticated;
grant execute on function public.card_place(bigint,bigint,integer,integer,text,boolean,boolean,text,bigint[]) to service_role;

-- The seating pass (the Winners worker, every 30 seconds): a pick on the card seats when his latest cut includes it,
-- inside 75 minutes of its own kickoff, 20 minutes out at the least, once the card holds two picks. No count.
create or replace function public.seat_the_card(p_date text)
returns integer language plpgsql set search_path='' as $$
declare book bigint[]; n_card integer; r record; n integer := 0; why text;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  select count(*) into n_card from public.winners_card_placements p where p.game_date = p_date;
  if n_card < 2 then return 0; end if;
  book := gary_private.card_book(p_date);
  for r in
    select c.id, c.admitted_at, c.commence_time, o.rank, o.of
    from gary_private.card_order(p_date) o join public.winners_candidates c on c.id = o.candidate_id
    where not exists (select 1 from public.winners_big_games g where g.game_date = p_date and g.league = c.league and g.game_id = c.game_id)
    order by o.rank
  loop
    if r.admitted_at is not null then continue; end if;
    if exists (select 1 from public.winners_decision_events e where e.candidate_id = r.id and e.event = 'card_seated') then
      why := gary_private.admit_winners_candidate(r.id);   -- a seated pass whose number arrived
      if why = 'admitted' then n := n + 1; end if;
      continue;
    end if;
    if not (r.id = any(book)) then continue; end if;
    if r.commence_time is null or r.commence_time <= clock_timestamp() + interval '20 minutes'
       or r.commence_time > clock_timestamp() + interval '75 minutes' then continue; end if;
    insert into public.winners_decision_events(candidate_id, event, detail)
    values (r.id, 'card_seated', jsonb_build_object('rank', r.rank, 'of', r.of, 'book', coalesce(array_length(book,1),0), 'card', n_card));
    why := gary_private.admit_winners_candidate(r.id);
    if why = 'admitted' then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.seat_the_card(text) from public, anon, authenticated;
grant execute on function public.seat_the_card(text) to service_role;

-- The board row says it came from his book.
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
 if not big and seat is null then return 'not_seated'; end if;          -- only his book seats an ordinary game pick
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
 label:=case when big then 'Big game' else format('Gary''s book: #%s of %s on his card', seat->>'rank', seat->>'of') end;
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

-- The weekly report: his book against the rest of the card, and the slots as before.
create or replace function public.winners_judge_report(p_from text, p_to text)
returns table(bucket text, league text, w bigint, l bigint, p bigint)
language sql stable set search_path='' as $$
 with picks as (
  select c.id, c.league, c.game_id, c.admitted_at, c.review->>'assessment' as grade,
    coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false) as play,
    (select o.rank from gary_private.card_order(c.game_date) o where o.candidate_id = c.id) as slot,
    (c.id = any(gary_private.card_book(c.game_date))) as in_book
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
  union all select '7 his book: '||case when slot is null then 'not placed' when in_book then 'in' else 'out' end, 'ALL', result from j
  union all select '7 his book: '||case when slot is null then 'not placed' when in_book then 'in' else 'out' end, league, result from j
 )
 select b, lg, count(*) filter(where result='won'), count(*) filter(where result='lost'), count(*) filter(where result='push')
 from rows_ group by b, lg order by b, lg;
$$;
revoke all on function public.winners_judge_report(text,text) from public,anon,authenticated;
grant execute on function public.winners_judge_report(text,text) to service_role;
