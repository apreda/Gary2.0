-- THE PARLAY, SIMPLE (founder, Oct 28 2026: "the darts are the darts. Gary
-- can make his parlay out of those darts or out of any picks that he wants
-- throughout the entire app. Simple."): the lineup-time dart review and the
-- pick-time parlay question are gone, so there are no marks to sync. At the
-- day pass Gary builds the ticket from every pick, prop and dart still to
-- start: the list is no longer cut at 32 (it was, nearly every day, and the
-- cut left out most game picks and every prop that was not a Winners play).
-- The reader's grade is gone from each play's line (no pick since Oct 20
-- carries one).

CREATE OR REPLACE FUNCTION gary_private.parlay_enqueue()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_day date := (now() at time zone 'America/New_York')::date; v_pass timestamptz;
begin
  if exists (select 1 from public.parlay_of_the_day where game_date = v_day) then return 0; end if;
  v_pass := gary_private.day_pass_at(v_day);
  if v_pass is null or now() < v_pass then return 0; end if;
  return gary_private.parlay_enqueue_with(v_day, '{}');
end $function$;

CREATE OR REPLACE FUNCTION gary_private.parlay_enqueue_with(p_day date, p_fixed text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_games integer; v_n integer; v_keys text[]; v_snf_keys text[]; v_snf_game text; v_list text; v_fixed_list text; v_job uuid; v_min integer; v_max integer;
        v_fixed integer := coalesce(cardinality(p_fixed), 0); v_props jsonb; v_required jsonb; v_last text;
begin
  if exists (select 1 from public.parlay_of_the_day where game_date = p_day) then return 0; end if;
  if exists (select 1 from public.parlay_jobs pj join public.subscription_model_jobs j on j.id = pj.job_id
             where pj.game_date = p_day and pj.created_at = (select max(x.created_at) from public.parlay_jobs x where x.game_date = p_day)
               and (j.status in ('queued','running') or (j.status <> 'failed' and j.completed_at > now() - interval '20 minutes'))) then return 0; end if;
  -- A rejected ticket is asked again at once with its reason; four asks a day at most.
  if (select count(*) from public.parlay_jobs x where x.game_date = p_day) >= 4 then return 0; end if;
  select replace(s.error, 'parlay rejected: ', '') into v_last
    from public.parlay_jobs pj join public.subscription_model_jobs s on s.id = pj.job_id
    where pj.game_date = p_day and s.status = 'failed' and s.error like 'parlay rejected:%'
    order by pj.created_at desc limit 1;
  select count(*), count(distinct c.game_id) into v_n, v_games from gary_private.parlay_candidates(p_day) c where not (c.key = any(coalesce(p_fixed, '{}')));
  if v_n + v_fixed < 3 or v_games < 2 then return 0; end if;
  if extract(isodow from p_day) = 7 then
    select array_agg(c.key order by c.ord),
           min(concat_ws(' · ', c.matchup, to_char(c.commence_time at time zone 'America/New_York', 'FMHH12:MI PM') || ' ET'))
      into v_snf_keys, v_snf_game
      from gary_private.parlay_candidates(p_day) c
      where c.league = 'NFL' and (c.commence_time at time zone 'America/New_York')::time >= time '19:30'
        and not (c.key = any(coalesce(p_fixed, '{}')));
  end if;
  select array_agg(c.key order by c.ord),
         string_agg(format('[%s] %s · %s · %s · %s · %s', c.key, c.league, c.text,
           case when c.odds > 0 then '+' || c.odds else c.odds::text end, coalesce(c.matchup, ''),
           to_char(c.commence_time at time zone 'America/New_York', 'FMHH12:MI PM') || ' ET') || E'\n    ' || c.signal, E'\n' order by c.ord)
    into v_keys, v_list
    from gary_private.parlay_candidates(p_day) c
    where not (c.key = any(coalesce(p_fixed, '{}')));
  select string_agg(format('%s · %s · %s · %s', x.league, x.text, case when x.odds > 0 then '+' || x.odds else x.odds::text end,
           to_char(x.commence_time at time zone 'America/New_York', 'FMHH12:MI PM') || ' ET'), E'\n' order by array_position(p_fixed, x.key))
    into v_fixed_list from gary_private.parlay_resolve(p_day) x where x.key = any(coalesce(p_fixed, '{}'));
  v_min := greatest(1, 2 - v_fixed); v_max := greatest(1, 3 - v_fixed);
  if v_snf_keys is not null then v_min := greatest(1, v_min - 1); v_max := greatest(v_min, v_max - 1); end if;
  v_props := jsonb_build_object(
    'legs', jsonb_build_object('type', 'array', 'minItems', v_min, 'maxItems', v_max, 'items', jsonb_build_object('type', 'string'),
      'description', case when v_fixed > 0 then 'the ids of the legs you add, in the order they read after the legs already on the ticket'
                          when v_snf_keys is not null then 'the ids of the legs before the Sunday Night Football leg, in the order they read on the ticket'
                          else 'the ids of the legs, in the order they read on the ticket' end),
    'reason', jsonb_build_object('type', 'string'));
  v_required := jsonb_build_array('legs', 'reason');
  if v_snf_keys is not null then
    v_props := v_props || jsonb_build_object('snf_leg', jsonb_build_object('type', 'string', 'enum', to_jsonb(v_snf_keys),
      'description', 'the id of the Sunday Night Football leg that closes the ticket'));
    v_required := v_required || jsonb_build_array('snf_leg');
  end if;
  insert into public.subscription_model_jobs (lane, status, request, expires_at)
  values ('parlay-of-the-day', 'queued', jsonb_build_object(
    'model', 'claude-opus-5-5',
    'system', gary_private.parlay_contract(),
    'messages', jsonb_build_array(jsonb_build_object('role', 'user', 'content',
      coalesce('YOUR LAST TICKET WAS NOT POSTED: ' || v_last || '. Build it again.' || chr(10) || chr(10), '') ||
      case when v_fixed > 0 then 'THE TICKET SO FAR (your legs, already on it):' || E'\n' || v_fixed_list || E'\n\n'
        || format('Complete it: add %s to %s more from the plays below.', v_min, v_max) || E'\n\n' else '' end
      || 'TODAY''S PLAYS' || E'\n' || v_list
      || case when v_snf_keys is not null
           then E'\n\nSUNDAY NIGHT FOOTBALL: on Sundays the ticket closes with a leg from Sunday Night Football ('
                || coalesce(v_snf_game, 'tonight') || '). Name that leg in snf_leg; the others go in legs.' else '' end)),
    'tools', jsonb_build_array(jsonb_build_object('name', 'build_parlay', 'input_schema', jsonb_build_object(
      'type', 'object', 'required', v_required, 'properties', v_props))),
    'tool_choice', jsonb_build_object('type', 'tool', 'name', 'build_parlay'),
    'output_config', jsonb_build_object('effort', 'medium')),
    now() + interval '25 minutes')
  returning id into v_job;
  insert into public.parlay_jobs (job_id, game_date, leg_keys, fixed_keys, snf_keys) values (v_job, p_day, v_keys, p_fixed, v_snf_keys);
  return 1;
end $function$;

CREATE OR REPLACE FUNCTION gary_private.parlay_candidates(p_date date)
 RETURNS TABLE(key text, source text, league text, text text, odds integer, matchup text, game_id text, commence_time timestamp with time zone, grade jsonb, signal text, ord integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with legs as (
    select * from gary_private.parlay_legs(p_date) l where l.commence_time > now() + interval '25 minutes'
  ), picks as (
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
    where not (l.source = 'prop' and exists (
      select 1 from legs w where w.source = 'winners' and w.game_id = l.game_id
        and lower(w.grade->'snapshot'->>'player') = lower(l.grade->'snapshot'->>'player')
        and lower(w.grade->'snapshot'->>'bet') = lower(l.grade->'snapshot'->>'bet')))
    union all
    select p.key, p.source, p.league, p.text, p.odds, p.matchup, p.game_id, p.commence_time, p.grade from picks p
  ), signals as (
    select e.*,
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
      coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean, false) as play,
      (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric as asked,
      round(b.stake_units * 100) as on_board_dollars
    from signals s
    left join public.winners_candidates c on c.id = coalesce(s.cid, s.prop_cid)
    left join public.winners_board b on b.candidate_id = c.id and s.source = 'winners'
  )
  select d.key, d.source, d.league, d.text, d.odds, d.matchup, d.game_id, d.commence_time, d.grade,
    case
      when d.source = 'winners' then format('Winners play, $%s', coalesce(d.on_board_dollars::text, '100'))
      when d.source = 'dart' then format('Dart, %s%s%s', upper(replace(coalesce(d.dart_kind, ''), '_', ' ')), case when d.dart_rank is not null then ' #' || d.dart_rank else '' end, case when d.dart_line <> '' then ': ' || d.dart_line || '.' else '' end)
      else case when d.play then format('Gary''s play, $%s asked', d.asked) else 'Gary''s pick, not a play' end
    end as signal,
    (row_number() over (order by
      case when d.source = 'winners' then 0 when d.play then 1 when d.source = 'dart' then 2 else 3 end,
      coalesce(d.on_board_dollars, d.asked, 0) desc,
      coalesce(d.dart_rank, 9), d.commence_time, d.key))::integer as ord
  from described d
  where d.odds <= 150 -- no leg longer than +150 (founder, Oct 1 2026)
  order by ord
$function$;

drop function if exists gary_private.parlay_sync_yes(date);
drop function if exists public.parlay_ticket_state(date);
