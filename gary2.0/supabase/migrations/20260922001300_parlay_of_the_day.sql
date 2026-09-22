-- THE PARLAY OF THE DAY (founder, Sep 22 2026): "a bet slip of the day, which
-- is like a parlay of the day ... a combination of three or four options ...
-- from any of the picks throughout the rest of the app ... simply for fun on
-- the darts page." Never on the Billfold, never on the record.
--
-- Legs come from what Gary already published today: the Winners board, the
-- props on the Picks page and the darts. A light brain on the subscription
-- picks three or four; the price is computed here, never by the model.

create table if not exists public.parlay_of_the_day (
  game_date date primary key,
  legs jsonb not null,
  american_odds integer not null,
  payout_10 numeric(10,2) not null,
  reason text,
  model text,
  job_id uuid,
  created_at timestamptz not null default now()
);
alter table public.parlay_of_the_day enable row level security;
revoke all on public.parlay_of_the_day from public, anon, authenticated;
grant all on public.parlay_of_the_day to service_role;

create table if not exists public.parlay_jobs (
  job_id uuid primary key references public.subscription_model_jobs(id) on delete cascade,
  game_date date not null,
  created_at timestamptz not null default now()
);
alter table public.parlay_jobs enable row level security;
revoke all on public.parlay_jobs from public, anon, authenticated;
grant all on public.parlay_jobs to service_role;

-- American odds in, American odds and the $10 payout out.
create or replace function gary_private.parlay_price(p_odds integer[])
returns table(american_odds integer, payout_10 numeric)
language plpgsql immutable as $$
declare dec numeric := 1; o integer;
begin
  foreach o in array p_odds loop
    dec := dec * (case when o > 0 then 1 + o / 100.0 else 1 + 100.0 / abs(o) end);
  end loop;
  american_odds := case when dec >= 2 then round((dec - 1) * 100) else round(-100 / (dec - 1)) end;
  payout_10 := round(10 * dec, 2);
  return next;
end $$;

-- Today's published plays that could be a leg: unstarted, priced, deduped.
create or replace function gary_private.parlay_legs(p_date date)
returns table(key text, source text, league text, text text, odds integer, matchup text, game_id text, commence_time timestamptz, grade jsonb)
language sql stable set search_path = '' as $$
  with w as (
    select 'winners:' || c.id as key, 'winners' as source, c.league,
      case when c.kind = 'prop'
        then concat_ws(' ', c.pick_snapshot->>'player', c.pick_snapshot->>'bet', c.pick_snapshot->>'line',
                       replace(regexp_replace(coalesce(c.pick_snapshot->>'prop',''), '\s+[0-9.]+$', ''), '_', ' '))
        else regexp_replace(c.pick_text, '\s*[+-][0-9]{3,4}\s*$', '') end as text,
      c.odds, coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')) as matchup,
      c.game_id, c.commence_time,
      jsonb_build_object('kind', c.kind, 'candidate_id', c.id, 'pick_text', c.pick_text, 'snapshot', c.pick_snapshot) as grade
    from public.winners_board b join public.winners_candidates c on c.id = b.candidate_id
    where b.game_date = to_char(p_date, 'YYYY-MM-DD') and c.odds is not null and abs(c.odds) >= 100
  ), p as (
    select 'prop:' || md5(coalesce(pk->>'player','') || coalesce(pk->>'prop','') || coalesce(pk->>'bet','')) as key, 'prop' as source,
      case when pk->>'sport' ilike '%mlb%' then 'MLB' when pk->>'sport' ilike '%ncaaf%' then 'NCAAF' when pk->>'sport' ilike '%nfl%' then 'NFL' else upper(coalesce(pk->>'league', pk->>'sport')) end as league,
      concat_ws(' ', pk->>'player', pk->>'bet', coalesce(pk->>'line', substring(pk->>'prop' from '[0-9.]+$')),
                replace(regexp_replace(coalesce(pk->>'prop',''), '\s+[0-9.]+$', ''), '_', ' ')) as text,
      (pk->>'odds')::integer as odds, pk->>'matchup' as matchup, pk->>'game_id' as game_id,
      (pk->>'commence_time')::timestamptz as commence_time,
      jsonb_build_object('kind', 'prop', 'snapshot', jsonb_build_object('player', pk->>'player', 'prop', pk->>'prop', 'bet', pk->>'bet', 'line', pk->>'line')) as grade
    from public.prop_picks pp, jsonb_array_elements(pp.picks) pk
    where pp.date = to_char(p_date, 'YYYY-MM-DD') and (pk->>'odds') ~ '^-?[0-9]+$' and abs((pk->>'odds')::integer) >= 100
  ), d as (
    select 'dart:' || d.id as key, 'dart' as source, d.league,
      concat_ws(' ', d.player, d.bet, substring(d.prop from '[0-9.]+$'), replace(regexp_replace(d.prop, '\s+[0-9.]+$', ''), '_', ' ')) as text,
      d.odds, d.matchup, d.game_id, d.commence_time,
      jsonb_build_object('kind', 'prop', 'snapshot', jsonb_build_object('player', d.player, 'prop', d.prop, 'bet', d.bet)) as grade
    from public.darts d where d.game_date = p_date and d.scratched_at is null and d.odds is not null and abs(d.odds) >= 100
  )
  select * from (select * from w union all select * from p union all select * from d) x
  where x.commence_time > now()
  order by x.commence_time, x.key
$$;

create or replace function gary_private.parlay_contract() returns text
language sql immutable as $$
  select $c$You are Gary, the bettor whose picks publish in this app, building today's parlay of the day for fun: never a bet on the record. Below are the plays you already published today, each with a key, its price and its game. Pick three or four of them to ride together. Rules: use only keys from the list; no two legs on the same game; every leg must be one you actually like together as a ticket. Then one or two sentences, in your own voice, on why this parlay. Never mention data feeds, tools, models or missing data. Return only the requested JSON.$c$
$$;

create or replace function gary_private.parlay_enqueue() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_day date := (now() at time zone 'America/New_York')::date; v_n integer; v_first timestamptz; v_list text; v_job uuid;
begin
  if exists (select 1 from public.parlay_of_the_day where game_date = v_day) then return 0; end if;
  if exists (select 1 from public.parlay_jobs pj join public.subscription_model_jobs j on j.id = pj.job_id
             where pj.game_date = v_day and (j.status in ('queued','running') or j.completed_at > now() - interval '20 minutes')) then return 0; end if;
  select count(*), min(commence_time) into v_n, v_first from gary_private.parlay_legs(v_day);
  if v_n < 3 then return 0; end if;
  -- Wait for the card to fill unless the first leg is about to seal.
  if v_n < 6 and v_first > now() + interval '20 minutes' then return 0; end if;
  select string_agg(format('%s · %s · %s · %s · %s · %s', l.key, l.league, l.text, case when l.odds > 0 then '+' || l.odds else l.odds::text end, coalesce(l.matchup, ''), to_char(l.commence_time at time zone 'America/New_York', 'HH12:MI AM')), E'\n' order by l.commence_time, l.key)
    into v_list from gary_private.parlay_legs(v_day) l;
  insert into public.subscription_model_jobs (lane, status, request, expires_at)
  values ('parlay-of-the-day', 'queued', jsonb_build_object(
    'model', 'claude-opus-5',
    'system', gary_private.parlay_contract(),
    'messages', jsonb_build_array(jsonb_build_object('role', 'user', 'content', 'TODAY''S PLAYS' || E'\n' || v_list)),
    'tools', jsonb_build_array(jsonb_build_object('name', 'build_parlay', 'input_schema', jsonb_build_object(
      'type', 'object', 'required', jsonb_build_array('legs', 'reason'),
      'properties', jsonb_build_object(
        'legs', jsonb_build_object('type', 'array', 'minItems', 3, 'maxItems', 4, 'items', jsonb_build_object('type', 'string')),
        'reason', jsonb_build_object('type', 'string'))))),
    'tool_choice', jsonb_build_object('type', 'tool', 'name', 'build_parlay')),
    now() + interval '15 minutes')
  returning id into v_job;
  insert into public.parlay_jobs (job_id, game_date) values (v_job, v_day);
  return 1;
end $$;

create or replace function gary_private.parlay_collect() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; j record; keys text[]; legs jsonb; reason text; prices integer[]; ok boolean; v_price record;
begin
  for j in
    select s.id, pj.game_date, s.response, s.route
    from public.subscription_model_jobs s join public.parlay_jobs pj on pj.job_id = s.id
    where s.lane = 'parlay-of-the-day' and s.status = 'completed'
      and not exists (select 1 from public.parlay_of_the_day x where x.game_date = pj.game_date)
  loop
    keys := array(select jsonb_array_elements_text(j.response->'content'->0->'input'->'legs'));
    reason := left(btrim(coalesce(j.response->'content'->0->'input'->>'reason', '')), 400);
    ok := array_length(keys, 1) between 3 and 4 and cardinality(keys) = (select count(distinct k) from unnest(keys) k);
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
      update public.subscription_model_jobs set status = 'failed', error = 'parlay rejected: keys, count or two legs on one game' where id = j.id;
    end if;
  end loop;
  return n;
end $$;

-- The slip as the app reads it, each leg with where it stands right now.
create or replace function public.get_parlay(p_date text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_day date; v_p public.parlay_of_the_day;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  v_day := p_date::date;
  select * into v_p from public.parlay_of_the_day where game_date = v_day;
  if not found then return null; end if;
  return jsonb_build_object(
    'date', v_p.game_date, 'american_odds', v_p.american_odds, 'payout_10', v_p.payout_10, 'reason', v_p.reason,
    'legs', (select jsonb_agg(l || jsonb_build_object(
        'result', (gary_private.lab_ticket_result(l->'grade'->>'kind', l->>'league', to_char(v_day, 'YYYY-MM-DD'), l->>'game_id',
                     coalesce(l->'grade'->>'pick_text', ''), coalesce(l->'grade'->'snapshot', '{}'::jsonb)))->>'result',
        'live', (select jsonb_build_object('status', ls.status, 'detail', ls.detail, 'away_abbr', ls.away_abbr, 'home_abbr', ls.home_abbr,
                                           'away_score', ls.away_score, 'home_score', ls.home_score)
                 from public.live_scores ls where ls.date = v_day and ls.league = (l->>'league') and ls.game_id = (l->>'game_id')
                 order by ls.updated_at desc limit 1)) - 'grade'
      order by (l->>'n')::int) from jsonb_array_elements(v_p.legs) l));
end $$;
revoke all on function public.get_parlay(text) from public;
grant execute on function public.get_parlay(text) to anon, authenticated, service_role;

select cron.unschedule(jobid) from cron.job where jobname in ('parlay-enqueue','parlay-collect');
select cron.schedule('parlay-enqueue', '*/10 * * * *', $cron$select gary_private.parlay_enqueue()$cron$);
select cron.schedule('parlay-collect', '*/2 * * * *', $cron$select gary_private.parlay_collect()$cron$);
