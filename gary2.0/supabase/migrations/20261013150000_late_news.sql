-- LATE NEWS (founder GO, Oct 13 2026: "we need a mechanism for scratching the pick and letting the users know
-- that this pick was scratched and why"). Every game pick's availability is recorded when it publishes. When the
-- pick is due on Winners (75 minutes before an NFL, college or MLB start; 28 before an NBA tip, after the final
-- statuses), the worker reads the same feed again (src/services/pickdesk/lateNews.js). Nothing changed: the pick
-- goes on as before. Something changed, or a player is still undecided: Gary reads his own write-up and the news and
-- says whether the pick stands or is scratched. A scratched pick stays in the app, marked scratched with his reason,
-- is never graded, and never goes on Winners; a ticket already on Winners (a big game) is scratched there too.

create table if not exists public.winners_late_news (
  candidate_id bigint primary key references public.winners_candidates(id) on delete cascade,
  game_date text not null,
  league text not null,
  game_id text not null,
  at_pick jsonb,                 -- both teams' availability when the pick published
  at_pick_at timestamptz,
  at_check jsonb,                -- the same feed when the pick was due on Winners
  checked_at timestamptz,
  changes jsonb,
  unresolved jsonb,
  decision text check (decision in ('clear', 'stand', 'scratch', 'no_feed', 'failed')),
  why text,
  model text,
  asked boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists winners_late_news_day on public.winners_late_news(game_date);
alter table public.winners_late_news enable row level security;
revoke all on public.winners_late_news from public, anon, authenticated;

-- The board guard lets a late-news scratch through as it lets a gate scratch: only scratched_at and the reason change.
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
    -- A founder rule pulls a game play the gate let through, or Gary scratches it on late news (Oct 13 2026).
    if tg_op = 'UPDATE'
       and old.kind = 'game'
       and old.scratched_at is null and new.scratched_at is not null
       and (new.scratch_reason like 'gate:%' or new.scratch_reason like 'Late news:%')
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

-- The scratch: the published pick keeps its place in the app with scratched_at and scratch_reason (the app fades
-- it and shows his reason), and a Winners ticket already on the board is scratched with the same reason.
create or replace function public.scratch_game_pick(p_candidate_id bigint, p_reason text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.winners_candidates; stamp text; v_reason text; n_daily integer := 0; n_weekly integer := 0; n_board integer := 0;
begin
  select * into c from public.winners_candidates where id = p_candidate_id;
  if not found or c.kind <> 'game' then return jsonb_build_object('ok', false, 'why', 'not a game candidate'); end if;
  if c.commence_time is null or c.commence_time <= clock_timestamp() then return jsonb_build_object('ok', false, 'why', 'started'); end if;
  stamp := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_reason := left(coalesce(p_reason, ''), 600);
  update public.daily_picks d set picks = (
    select jsonb_agg(case when coalesce(e->>'game_id', e->>'bdl_game_id') = c.game_id and btrim(coalesce(e->>'pick', '')) = c.pick_text
                          and coalesce(e->>'scratched_at', '') = ''
                     then e || jsonb_build_object('scratched_at', stamp, 'scratch_reason', v_reason) else e end order by ord)
    from jsonb_array_elements(d.picks) with ordinality as t(e, ord))
  where d.date::text = c.game_date and jsonb_typeof(d.picks) = 'array'
    and exists (select 1 from jsonb_array_elements(d.picks) e where coalesce(e->>'game_id', e->>'bdl_game_id') = c.game_id
                and btrim(coalesce(e->>'pick', '')) = c.pick_text);
  get diagnostics n_daily = row_count;
  if c.league = 'NFL' then
    update public.weekly_nfl_picks w set picks = (
      select jsonb_agg(case when coalesce(e->>'game_id', e->>'bdl_game_id') = c.game_id and btrim(coalesce(e->>'pick', '')) = c.pick_text
                            and coalesce(e->>'scratched_at', '') = ''
                       then e || jsonb_build_object('scratched_at', stamp, 'scratch_reason', v_reason) else e end order by ord)
      from jsonb_array_elements(w.picks) with ordinality as t(e, ord))
    where jsonb_typeof(w.picks) = 'array'
      and w.week_start::date between (c.game_date::date - 7) and c.game_date::date
      and exists (select 1 from jsonb_array_elements(w.picks) e where coalesce(e->>'game_id', e->>'bdl_game_id') = c.game_id
                  and btrim(coalesce(e->>'pick', '')) = c.pick_text);
    get diagnostics n_weekly = row_count;
  end if;
  update public.winners_board set scratched_at = clock_timestamp(), scratch_reason = left('Late news: ' || v_reason, 400)
   where candidate_id = p_candidate_id and scratched_at is null;
  get diagnostics n_board = row_count;
  insert into public.winners_decision_events(candidate_id, event, detail)
  values (p_candidate_id, 'late_news_scratched', jsonb_build_object('reason', v_reason, 'daily_rows', n_daily, 'weekly_rows', n_weekly, 'board', n_board > 0));
  return jsonb_build_object('ok', n_daily + n_weekly > 0, 'daily_rows', n_daily, 'weekly_rows', n_weekly, 'board', n_board > 0);
end $$;
revoke all on function public.scratch_game_pick(bigint, text) from public, anon, authenticated;
grant execute on function public.scratch_game_pick(bigint, text) to service_role;

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
 -- Late news (Oct 13 2026): a pick Gary scratched after the news never goes on Winners, by any route.
 if exists(select 1 from public.winners_late_news l where l.candidate_id=p_id and l.decision='scratch') then return 'late_news_scratched'; end if;
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

create or replace function public.seat_the_card(p_date text)
returns integer language plpgsql set search_path='' as $$
declare book bigint[]; n_card integer; r record; n integer := 0; why text; lead interval; floor_ interval;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  select count(*) into n_card from public.winners_card_placements p where p.game_date = p_date;
  if n_card < 1 then return 0; end if;   -- Oct 13 2026: the first pick answers its own book, so one pick is a card
  book := gary_private.card_book(p_date);
  for r in
    select c.id, c.league, c.admitted_at, c.commence_time, o.rank, o.of
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
    -- An NBA pick seats after the final statuses, about 30 minutes before tip (Oct 13 2026, late news).
    lead := case when r.league = 'NBA' then interval '28 minutes' else interval '75 minutes' end;
    floor_ := case when r.league = 'NBA' then interval '10 minutes' else interval '20 minutes' end;
    if r.commence_time is null or r.commence_time <= clock_timestamp() + floor_
       or r.commence_time > clock_timestamp() + lead then continue; end if;
    -- The late-news check runs first (lateNews.js): only a pick it cleared, or Gary kept, seats.
    if not exists (select 1 from public.winners_late_news x where x.candidate_id = r.id
                   and x.decision in ('clear', 'stand', 'no_feed', 'failed')) then continue; end if;
    insert into public.winners_decision_events(candidate_id, event, detail)
    values (r.id, 'card_seated', jsonb_build_object('rank', r.rank, 'of', r.of, 'book', coalesce(array_length(book,1),0), 'card', n_card));
    why := gary_private.admit_winners_candidate(r.id);
    if why = 'admitted' then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.seat_the_card(text) from public, anon, authenticated;
grant execute on function public.seat_the_card(text) to service_role;
