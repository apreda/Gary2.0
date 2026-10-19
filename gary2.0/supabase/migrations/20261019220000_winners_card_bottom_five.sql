-- Winners takes the BOTTOM five of Gary's card per sport, not the top five (founder, Oct 19 2026: "Gary always
-- judges this wrong so we are just going to do the opposite now he always for some reason thinks his worst picks are
-- his best"). On the two full slates the card has ranked, his top five went 1-4 both times (college Oct 17, NFL Oct
-- 18) while his bottom five went 2-3 and 5-0. Gary still ranks the card the same way and is never told; only the end
-- Winners seats from is flipped. Everything else stands: his book, five live card seats per sport, big games outside
-- the order, the seat window, the late-news check, and a seat is final. The daily floor flips the same way.
create or replace function public.seat_the_card(p_date text)
returns integer language plpgsql set search_path='' as $$
declare book bigint[]; n_card integer; r record; n integer := 0; why text; lead interval; floor_ interval;
        cap constant integer := 5; n_on integer;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  select count(*) into n_card from public.winners_card_placements p where p.game_date = p_date;
  if n_card < 1 then return 0; end if;   -- Oct 13 2026: the first pick answers its own book, so one pick is a card
  book := gary_private.card_book(p_date);
  for r in
    select c.id, c.league, c.admitted_at, c.commence_time, o.rank, o.of,
           row_number() over (partition by c.league order by o.rank desc) as from_bottom
    from gary_private.card_order(p_date) o join public.winners_candidates c on c.id = o.candidate_id
    where not exists (select 1 from public.winners_big_games g where g.game_date = p_date and g.league = c.league and g.game_id = c.game_id)
    order by o.rank desc
  loop
    if r.admitted_at is not null then continue; end if;
    if exists (select 1 from public.winners_decision_events e where e.candidate_id = r.id and e.event = 'card_seated') then
      why := gary_private.admit_winners_candidate(r.id);   -- a seated pass whose number arrived
      if why = 'admitted' then n := n + 1; end if;
      continue;
    end if;
    if not (r.id = any(book)) then continue; end if;
    if r.from_bottom > cap then continue; end if;
    select count(*) into n_on from public.winners_board w
    where w.game_date = p_date and w.league = r.league and w.kind = 'game' and w.scratched_at is null
      and w.policy_version in ('winners-card-v1', 'winners-floor-v1');
    if n_on >= cap then continue; end if;
    -- An NBA pick seats after the final statuses, about 30 minutes before tip (Oct 13 2026, late news).
    lead := case when r.league = 'NBA' then interval '28 minutes' else interval '75 minutes' end;
    floor_ := case when r.league = 'NBA' then interval '10 minutes' else interval '20 minutes' end;
    if r.commence_time is null or r.commence_time <= clock_timestamp() + floor_
       or r.commence_time > clock_timestamp() + lead then continue; end if;
    -- The late-news check runs first (lateNews.js): only a pick it cleared, or Gary kept, seats.
    if not exists (select 1 from public.winners_late_news x where x.candidate_id = r.id
                   and x.decision in ('clear', 'stand', 'no_feed', 'failed')) then continue; end if;
    insert into public.winners_decision_events(candidate_id, event, detail)
    values (r.id, 'card_seated', jsonb_build_object('rank', r.rank, 'of', r.of, 'from_bottom', r.from_bottom,
            'book', coalesce(array_length(book,1),0), 'card', n_card));
    why := gary_private.admit_winners_candidate(r.id);
    if why = 'admitted' then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.seat_the_card(text) from public, anon, authenticated;
grant execute on function public.seat_the_card(text) to service_role;

-- The floor (nothing else on Winners today) also takes the lowest pick on his card; a pick not on the card stays last.
CREATE OR REPLACE FUNCTION gary_private.winners_daily_floor(p_date text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    and not exists (select 1 from public.winners_late_news l where l.candidate_id = x.id and l.decision = 'scratch')
  order by (select o.rank from gary_private.card_order(p_date) o where o.candidate_id = x.id) desc nulls last,
           coalesce((x.pick_snapshot->'gary_bet'->>'play')::boolean, false) desc,
           coalesce(case when jsonb_typeof(x.pick_snapshot->'gary_bet'->'stake_dollars') = 'number'
                         then (x.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric end, 0) desc,
           x.commence_time asc
  limit 1
  for update;
  if not found then return 'no_pick'; end if;
  -- The floor seats a pick only after its late-news check, as Gary's card does: until then it waits.
  if not exists (select 1 from public.winners_late_news l where l.candidate_id = c.id
                 and l.decision in ('clear', 'stand', 'no_feed', 'failed')) then
    return 'waiting_late_news';
  end if;

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
end $function$
;
