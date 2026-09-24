-- THE PARLAY OF THE DAY, BUILT BY GARY (founder GO, Sep 24 2026): "Gary's
-- taking a mix of good picks and a mix of which ones have good odds, and trying
-- to make a parlay that hits. 3, 4 or 5 legs, props and games and darts, one a
-- day, on the Darts page, for fun, and we want it to hit."
--
-- The formula is the order and the facts: every play of the day still to
-- start, each with what Gary already decided about it (a Winners play and its
-- dollars, the reader's grade, a dart's rank in its category), sorted by how
-- much of Gary's own money and judgment stands behind it. Gary reads that
-- list and builds the ticket; the price is computed here, never by the model.
-- It builds once the day is mostly picked (60 percent of the slate, or 5:30
-- PM ET), keeps 25 minutes clear of the first leg, and stays out of the
-- Billfold and the record as before.

-- Every play of the day with its signals, in the order Gary reads it.
create or replace function gary_private.parlay_candidates(p_date date)
returns table(key text, source text, league text, text text, odds integer, matchup text, game_id text, commence_time timestamptz, grade jsonb, signal text, ord integer)
language sql stable set search_path = '' as $$
  with legs as (
    select * from gary_private.parlay_legs(p_date) l where l.commence_time > now() + interval '25 minutes'
  ), picks as (
    -- Free game picks that are not on the board (the board's are already legs).
    select 'pick:' || c.id as key, 'pick' as source, c.league,
      regexp_replace(c.pick_text, '\s*[+-][0-9]{3,4}\s*$', '') as text, c.odds,
      coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')) as matchup,
      c.game_id, c.commence_time,
      jsonb_build_object('kind', 'game', 'candidate_id', c.id, 'pick_text', c.pick_text, 'snapshot', c.pick_snapshot) as grade
    from public.winners_candidates c
    where c.game_date = to_char(p_date, 'YYYY-MM-DD') and c.kind = 'game' and c.admitted_at is null
      and c.odds is not null and abs(c.odds) >= 100 and c.commence_time > now() + interval '25 minutes'
      and c.pick_text !~* '\m(PASS|NO BET)\M'
  ), everything as (
    select l.key, l.source, l.league, l.text, l.odds, l.matchup, l.game_id, l.commence_time, l.grade from legs l
    union all
    select p.key, p.source, p.league, p.text, p.odds, p.matchup, p.game_id, p.commence_time, p.grade from picks p
  ), signals as (
    select e.*,
      -- The candidate behind a board play or a free pick; a free prop is matched to its own candidate.
      (select c.id from public.winners_candidates c where c.id = (e.grade->>'candidate_id')::bigint) as cid,
      (select c.id from public.winners_candidates c
        where e.source = 'prop' and c.game_date = to_char(p_date, 'YYYY-MM-DD') and c.kind = 'prop' and c.game_id = e.game_id
          and lower(c.pick_snapshot->>'player') = lower(e.grade->'snapshot'->>'player') and lower(c.pick_snapshot->>'bet') = lower(e.grade->'snapshot'->>'bet')
        order by c.id desc limit 1) as prop_cid,
      (select d.rank from public.darts d where e.key ~ '^dart:[0-9]+$' and d.id = substring(e.key from 6)::bigint) as dart_rank,
      (select d.kind from public.darts d where e.key ~ '^dart:[0-9]+$' and d.id = substring(e.key from 6)::bigint) as dart_kind,
      (select split_part(d.reason, '. ', 1) from public.darts d where e.key ~ '^dart:[0-9]+$' and d.id = substring(e.key from 6)::bigint) as dart_line
    from everything e
  ), described as (
    select s.*,
      c.review->>'assessment' as reader,
      coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean, false) as play,
      (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric as asked,
      round(b.stake_units * 100) as on_board_dollars
    from signals s
    left join public.winners_candidates c on c.id = coalesce(s.cid, s.prop_cid)
    left join public.winners_board b on b.candidate_id = c.id and s.source = 'winners'
  )
  select d.key, d.source, d.league, d.text, d.odds, d.matchup, d.game_id, d.commence_time, d.grade,
    case
      when d.source = 'winners' then format('Winners play, $%s%s', coalesce(d.on_board_dollars::text, '100'), case when d.reader is not null then ', the reader: ' || replace(d.reader, '_', ' ') else '' end)
      when d.source = 'dart' then format('Dart, %s #%s%s', upper(replace(coalesce(d.dart_kind, ''), '_', ' ')), coalesce(d.dart_rank::text, '-'), case when d.dart_line <> '' then ': ' || d.dart_line || '.' else '' end)
      else format('%s%s', case when d.play then format('Gary''s play, $%s asked', d.asked) else 'Gary''s pick, not a play' end,
                  case when d.reader is not null then ', the reader: ' || replace(d.reader, '_', ' ') else '' end)
    end as signal,
    (row_number() over (order by
      case when d.source = 'winners' then 0 when d.play and d.reader in ('clear','lean') then 1 when d.source = 'dart' then 2 when d.play then 3 else 4 end,
      coalesce(d.on_board_dollars, d.asked, 0) desc,
      case d.reader when 'clear' then 0 when 'lean' then 1 else 2 end,
      coalesce(d.dart_rank, 9), d.commence_time, d.key))::integer as ord
  from described d
  where d.reader is distinct from 'unsupported'
  order by ord
$$;

create or replace function gary_private.parlay_contract()
returns text language sql immutable as $$
  select $c$You are Gary, the bettor whose picks publish in this app. You write as yourself, never as an AI or a system, and you have no favorite team. Below are today's plays still to start, in the order they sit on your pages, each with what you already decided about it. Build today's parlay of the day for the Darts page: three to five legs, one per game, one ticket a day, for fun and never on your record, the ticket you would most expect to cash tonight, mixing the plays you trust most with prices that make it worth a ticket. Use only the ids shown. Then write one or two sentences on the ticket in your voice: no dashes as punctuation, no emojis, never mention data feeds, tools or missing data.$c$
$$;

create or replace function gary_private.parlay_enqueue() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_day date := (now() at time zone 'America/New_York')::date; v_games integer; v_n integer; v_keys text[]; v_list text; v_job uuid;
 v_slate integer; v_picked integer; v_late boolean;
begin
  if exists (select 1 from public.parlay_of_the_day where game_date = v_day) then return 0; end if;
  if exists (select 1 from public.parlay_jobs pj join public.subscription_model_jobs j on j.id = pj.job_id
             where pj.game_date = v_day and (j.status in ('queued','running') or j.completed_at > now() - interval '20 minutes')) then return 0; end if;
  select count(*), count(distinct c.game_id) into v_n, v_games from gary_private.parlay_candidates(v_day) c;
  if v_n < 4 or v_games < 3 then return 0; end if;
  -- Most of the day picked, or late enough in the day that what is picked is the day.
  select count(*) into v_slate from public.daily_slate s where s.date::text = to_char(v_day, 'YYYY-MM-DD') and lower(coalesce(s.game_status,'')) not in ('cancelled','canceled','postponed');
  select count(distinct c.game_id) into v_picked from public.winners_candidates c where c.game_date = to_char(v_day, 'YYYY-MM-DD') and c.kind = 'game';
  v_late := (now() at time zone 'America/New_York')::time >= time '17:30';
  if not v_late and (v_slate = 0 or v_picked < ceil(0.6 * v_slate)) then return 0; end if;
  select array_agg(c.key order by c.ord),
         string_agg(format('[%s] %s · %s · %s · %s · %s', c.key, c.league, c.text,
           case when c.odds > 0 then '+' || c.odds else c.odds::text end, coalesce(c.matchup, ''),
           to_char(c.commence_time at time zone 'America/New_York', 'FMHH12:MI PM') || ' ET') || E'\n    ' || c.signal, E'\n' order by c.ord)
    into v_keys, v_list
    from (select * from gary_private.parlay_candidates(v_day) limit 24) c;
  insert into public.subscription_model_jobs (lane, status, request, expires_at)
  values ('parlay-of-the-day', 'queued', jsonb_build_object(
    'model', 'claude-opus-5-5',
    'system', gary_private.parlay_contract(),
    'messages', jsonb_build_array(jsonb_build_object('role', 'user', 'content', 'TODAY''S PLAYS' || E'\n' || v_list)),
    'tools', jsonb_build_array(jsonb_build_object('name', 'build_parlay', 'input_schema', jsonb_build_object(
      'type', 'object', 'required', jsonb_build_array('legs', 'reason'),
      'properties', jsonb_build_object(
        'legs', jsonb_build_object('type', 'array', 'minItems', 3, 'maxItems', 5, 'items', jsonb_build_object('type', 'string'), 'description', 'the ids of the legs, in the order they read on the ticket'),
        'reason', jsonb_build_object('type', 'string'))))),
    'tool_choice', jsonb_build_object('type', 'tool', 'name', 'build_parlay'),
    'output_config', jsonb_build_object('effort', 'medium')),
    now() + interval '25 minutes')
  returning id into v_job;
  insert into public.parlay_jobs (job_id, game_date, leg_keys) values (v_job, v_day, v_keys);
  return 1;
end $$;

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
    ok := coalesce(array_length(chosen, 1), 0) between 3 and 5 and chosen <@ j.leg_keys;
    why := case when not ok then 'parlay rejected: the model did not return three to five legs from the list' end;
    if ok then
      select jsonb_agg(jsonb_build_object('n', ord, 'key', l.key, 'source', l.source, 'league', l.league, 'text', l.text, 'odds', l.odds,
                                          'matchup', l.matchup, 'game_id', l.game_id, 'commence_time', l.commence_time, 'grade', l.grade) order by ord),
             array_agg(l.odds order by ord),
             count(*) = cardinality(chosen) and count(distinct l.game_id) = count(*) and bool_and(l.commence_time > now())
        into legs, prices, ok
      from unnest(chosen) with ordinality as k(key, ord)
      join (select c.key, c.source, c.league, c.text, c.odds, c.matchup, c.game_id, c.commence_time, c.grade from gary_private.parlay_legs(j.game_date) c
            union all
            select 'pick:' || c.id, 'pick', c.league, regexp_replace(c.pick_text, '\s*[+-][0-9]{3,4}\s*$', ''), c.odds,
                   coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')),
                   c.game_id, c.commence_time, jsonb_build_object('kind', 'game', 'candidate_id', c.id, 'pick_text', c.pick_text, 'snapshot', c.pick_snapshot)
            from public.winners_candidates c where c.game_date = to_char(j.game_date, 'YYYY-MM-DD') and c.kind = 'game') l on l.key = k.key;
      if not ok then why := 'parlay rejected: a leg started, repeated a game, or left the board before collection'; end if;
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
