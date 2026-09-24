-- THE PARLAY ASK, REWRITTEN AS THE PRODUCT (founder GO, Sep 24 2026 evening).
-- The first ticket built under "the ticket you would most expect to cash,
-- mixing the plays you trust most with prices that make it worth a ticket"
-- was four darts while his $400 Winners play sat first on the list. The ticket
-- is the bets he believes in tonight; a dart only when he would stand behind
-- it; three or four legs, five allowed; the prices already know the season.
-- Two legs may come from one game when they go together (a quarterback and
-- his receiver, a team and its starter), so the collect allows at most two
-- legs per game instead of one. No probabilities, no target price.

create or replace function gary_private.parlay_contract()
returns text language sql immutable as $$
  select $c$You are Gary, the bettor whose picks publish in this app. You write as yourself, never as an AI or a system, and you have no favorite team. Below are today's plays still to start, in the order they sit on your pages, each with what you already decided about it. Build today's parlay of the day for the Darts page, one ticket a day, for fun and never on your record. The ticket is made of the bets you believe in tonight: a dart goes on it only when you would stand behind it as a bet. Three or four legs; five is allowed. One leg from a game, or two from the same game when they go together, like a quarterback and his receiver or a team and its starter. Every price below was set after each team's and each player's season and recent form were known. Use only the ids shown. Then write one or two sentences on the ticket in your voice: no dashes as punctuation, no emojis, never mention data feeds, tools or missing data.$c$
$$;

create or replace function gary_private.parlay_collect() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; j record; chosen text[]; legs jsonb; reason text; prices integer[]; ok boolean; why text; v_price record;
begin
  for j in
    select s.id, pj.game_date, pj.leg_keys, s.response, s.route
    from public.subscription_model_jobs s join public.parlay_jobs pj on pj.job_id = s.id
    where s.lane = 'parlay-of-the-day' and s.status = 'completed' and pj.leg_keys is not null
      and not exists (select 1 from public.parlay_of_the_day x where x.game_date = pj.game_date)
  loop
    -- Gary chose the legs from the list he was shown; the price is computed here.
    select array_agg(btrim(e.value, '[]')) into chosen
      from jsonb_array_elements_text(coalesce(j.response->'content'->0->'input'->'legs', '[]'::jsonb)) e;
    reason := left(btrim(coalesce(j.response->'content'->0->'input'->>'reason', '')), 400);
    ok := coalesce(array_length(chosen, 1), 0) between 3 and 5 and chosen <@ j.leg_keys
      and cardinality(chosen) = (select count(distinct x) from unnest(chosen) x);
    why := case when not ok then 'parlay rejected: the model did not return three to five different legs from the list' end;
    if ok then
      select jsonb_agg(jsonb_build_object('n', ord, 'key', l.key, 'source', l.source, 'league', l.league, 'text', l.text, 'odds', l.odds,
                                          'matchup', l.matchup, 'game_id', l.game_id, 'commence_time', l.commence_time, 'grade', l.grade) order by ord),
             array_agg(l.odds order by ord),
             count(*) = cardinality(chosen) and bool_and(l.commence_time > now())
        into legs, prices, ok
      from unnest(chosen) with ordinality as k(key, ord)
      join (select c.key, c.source, c.league, c.text, c.odds, c.matchup, c.game_id, c.commence_time, c.grade from gary_private.parlay_legs(j.game_date) c
            union all
            select 'pick:' || c.id, 'pick', c.league, regexp_replace(c.pick_text, '\s*[+-][0-9]{3,4}\s*$', ''), c.odds,
                   coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')),
                   c.game_id, c.commence_time, jsonb_build_object('kind', 'game', 'candidate_id', c.id, 'pick_text', c.pick_text, 'snapshot', c.pick_snapshot)
            from public.winners_candidates c where c.game_date = to_char(j.game_date, 'YYYY-MM-DD') and c.kind = 'game') l on l.key = k.key;
      -- At most two legs from one game.
      ok := ok and not exists (select 1 from jsonb_array_elements(legs) e group by e->>'league', e->>'game_id' having count(*) > 2);
      if not ok then why := 'parlay rejected: a leg started, a game carried more than two legs, or a leg left the board before collection'; end if;
    end if;
    if ok then
      select * into v_price from gary_private.parlay_price(prices);
      insert into public.parlay_of_the_day (game_date, legs, american_odds, payout_10, reason, model, job_id)
      values (j.game_date, legs, v_price.american_odds, v_price.payout_10, reason, j.route, j.id) on conflict (game_date) do nothing;
      n := n + 1;
    else
      update public.subscription_model_jobs set status = 'failed', error = why where id = j.id;
    end if;
  end loop;
  return n;
end $$;
