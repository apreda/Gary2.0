-- Parlay of the Day, legs by rule (founder, Sep 23 2026): the three or four
-- Winners board plays Gary put the most money on, one per game. No model chooses
-- a leg; Opus 5.5 at low only writes the one or two sentences, from each leg's own
-- reasons. And "why it made the board" now comes from the selectors in the same
-- pass that admits a play (winnersSelectionReasons.js), so the separate reasons
-- writer's two cron jobs retire.

alter table public.parlay_jobs add column if not exists leg_keys text[];

create or replace function gary_private.parlay_pick_legs(p_date date)
returns table(key text, league text, text text, odds integer, matchup text, commence_time timestamptz, why text)
language sql stable set search_path = '' as $$
  with board as (
    select l.key, l.league, l.text, l.odds, l.matchup, l.game_id, l.commence_time, b.stake_units,
           (l.grade->>'candidate_id')::bigint as candidate_id
    from gary_private.parlay_legs(p_date) l
    join public.winners_board b on b.candidate_id = (l.grade->>'candidate_id')::bigint
    where l.source = 'winners'
  ), one_per_game as (
    select distinct on (game_id) * from board order by game_id, stake_units desc nulls last, commence_time, key
  )
  select g.key, g.league, g.text, g.odds, g.matchup, g.commence_time,
         coalesce((select string_agg(r->>'claim', '; ') from public.winners_reasons wr, jsonb_array_elements(wr.reasons) r
                   where wr.candidate_id = g.candidate_id),
                  left((select c.pick_snapshot->>'rationale' from public.winners_candidates c where c.id = g.candidate_id), 400), '')
  from one_per_game g
  order by g.stake_units desc nulls last, g.commence_time, g.key
  limit 4
$$;

create or replace function gary_private.parlay_contract()
returns text language sql immutable as $$
  select $c$You are Gary, the bettor whose picks publish in this app. Below is today's parlay of the day: the plays on your Winners board you put the most money on, each with why it made your board. It is for fun, never a bet on the record. In one or two sentences, in your own voice, say why these ride together. Never mention data feeds, tools, models or missing data. Return only the requested JSON.$c$
$$;

create or replace function gary_private.parlay_enqueue() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_day date := (now() at time zone 'America/New_York')::date; v_n integer; v_first timestamptz; v_keys text[]; v_list text; v_job uuid;
begin
  if exists (select 1 from public.parlay_of_the_day where game_date = v_day) then return 0; end if;
  if exists (select 1 from public.parlay_jobs pj join public.subscription_model_jobs j on j.id = pj.job_id
             where pj.game_date = v_day and (j.status in ('queued','running') or j.completed_at > now() - interval '20 minutes')) then return 0; end if;
  -- The board's upcoming plays, one per game.
  select count(distinct l.game_id), min(l.commence_time) into v_n, v_first
    from gary_private.parlay_legs(v_day) l where l.source = 'winners';
  if v_n < 3 then return 0; end if;
  -- Wait for the board to fill unless its first play is about to start.
  if v_n < 6 and v_first > now() + interval '20 minutes' then return 0; end if;
  select array_agg(p.key order by p.ord),
         string_agg(format('%s · %s · %s · %s%s', p.league, p.text,
           case when p.odds > 0 then '+' || p.odds else p.odds::text end, coalesce(p.matchup, ''),
           case when p.why <> '' then E'\n  Why it made the board: ' || p.why else '' end), E'\n' order by p.ord)
    into v_keys, v_list
    from gary_private.parlay_pick_legs(v_day) with ordinality as p(key, league, text, odds, matchup, commence_time, why, ord);
  if coalesce(array_length(v_keys, 1), 0) < 3 then return 0; end if;
  insert into public.subscription_model_jobs (lane, status, request, expires_at)
  values ('parlay-of-the-day', 'queued', jsonb_build_object(
    'model', 'claude-opus-5-5',
    'system', gary_private.parlay_contract(),
    'messages', jsonb_build_array(jsonb_build_object('role', 'user', 'content', 'TODAY''S PARLAY' || E'\n' || v_list)),
    'tools', jsonb_build_array(jsonb_build_object('name', 'write_parlay_reason', 'input_schema', jsonb_build_object(
      'type', 'object', 'required', jsonb_build_array('reason'),
      'properties', jsonb_build_object('reason', jsonb_build_object('type', 'string'))))),
    'tool_choice', jsonb_build_object('type', 'tool', 'name', 'write_parlay_reason'),
    'output_config', jsonb_build_object('effort', 'low')),
    now() + interval '25 minutes')
  returning id into v_job;
  insert into public.parlay_jobs (job_id, game_date, leg_keys) values (v_job, v_day, v_keys);
  return 1;
end $$;

create or replace function gary_private.parlay_collect() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; j record; keys text[]; legs jsonb; reason text; prices integer[]; ok boolean; v_price record;
begin
  for j in
    select s.id, pj.game_date, pj.leg_keys, s.response, s.route
    from public.subscription_model_jobs s join public.parlay_jobs pj on pj.job_id = s.id
    where s.lane = 'parlay-of-the-day' and s.status = 'completed' and pj.leg_keys is not null
      and not exists (select 1 from public.parlay_of_the_day x where x.game_date = pj.game_date)
  loop
    -- The legs were chosen by rule when the job was queued; the model wrote only the reason.
    keys := j.leg_keys;
    reason := left(btrim(coalesce(j.response->'content'->0->'input'->>'reason', '')), 400);
    ok := array_length(keys, 1) between 3 and 4;
    if ok then
      select jsonb_agg(jsonb_build_object('n', ord, 'key', l.key, 'source', l.source, 'league', l.league, 'text', l.text, 'odds', l.odds,
                                          'matchup', l.matchup, 'game_id', l.game_id, 'commence_time', l.commence_time, 'grade', l.grade) order by ord),
             array_agg(l.odds order by ord), count(*) = cardinality(keys) and count(distinct l.game_id) = count(*)
        into legs, prices, ok
      from unnest(keys) with ordinality as k(key, ord) join gary_private.parlay_legs(j.game_date) l on l.key = k.key;
    end if;
    if ok then
      select * into v_price from gary_private.parlay_price(prices);
      insert into public.parlay_of_the_day (game_date, legs, american_odds, payout_10, reason, model, job_id)
      values (j.game_date, legs, v_price.american_odds, v_price.payout_10, reason, j.route, j.id) on conflict (game_date) do nothing;
      n := n + 1;
    else
      update public.subscription_model_jobs set status = 'failed', error = 'parlay rejected: a leg started or left the board before collection' where id = j.id;
    end if;
  end loop;
  return n;
end $$;

-- "Why it made the board" is written by the selectors now.
select cron.unschedule(jobid) from cron.job where jobname in ('winners-reasons-enqueue', 'winners-reasons-collect');
