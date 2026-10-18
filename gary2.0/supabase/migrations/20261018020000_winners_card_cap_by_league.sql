-- Winners takes Gary's top five card picks per sport per day (founder, Oct 17 2026: "fix it so we get the top 5
-- bets for NCAAF"; big games stay outside it: "Rays is fine"). Replaces the day-wide cap of five from
-- 20261018013000: a pick seats only when it is in the top five of its own sport on his card (big games left out of
-- that order), and a sport stops once it holds five live card seats that day. His book still decides whether a
-- top-five pick goes on at all, and a seat is still final.
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
           row_number() over (partition by c.league order by o.rank) as league_rank
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
    if r.league_rank > cap then continue; end if;
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
    values (r.id, 'card_seated', jsonb_build_object('rank', r.rank, 'of', r.of, 'league_rank', r.league_rank,
            'book', coalesce(array_length(book,1),0), 'card', n_card));
    why := gary_private.admit_winners_candidate(r.id);
    if why = 'admitted' then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.seat_the_card(text) from public, anon, authenticated;
grant execute on function public.seat_the_card(text) to service_role;
