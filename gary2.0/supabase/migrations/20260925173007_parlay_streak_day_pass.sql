-- THE DAY PASS (founder GO, Sep 25 2026): the parlay of the day and the
-- streak pick are decided once, with the day in front of Gary, instead of at
-- the first game's pick time. Each game is still picked on its own around
-- lineup time; Winners is unchanged. Before this, the ticket locked 25
-- minutes before its first nominated leg and the streak pick sealed 15
-- minutes before the first board play, so the day's first game won by
-- default (the streak pick came from the first Winners game 6 of 6 days).
--
-- The pass runs 45 minutes before the busiest two hours of the slate's
-- starts: about 5:55 PM on an MLB weekday, 12:15 PM on an NFL Sunday. At
-- pick time his "is it one for today's parlay?" is a mark he sees again at
-- the pass. The pass builds the ticket and names the streak pick in one
-- sitting. Games that start before the pass can't make either; that is the
-- price of seeing the day first.

-- 1. When the day's pass runs.
create or replace function gary_private.day_pass_at(p_day date)
returns timestamptz language sql stable set search_path = '' as $$
  with g as (
    select s.commence_time from public.daily_slate s
    where s.date = p_day and s.commence_time is not null
      and lower(coalesce(s.game_status, '')) not in ('cancelled', 'canceled', 'postponed')
  )
  select w.s - interval '45 minutes'
  from (select a.commence_time as s,
          (select count(*) from g b where b.commence_time between a.commence_time and a.commence_time + interval '2 hours') as n
        from g a) w
  order by w.n desc, w.s desc
  limit 1
$$;
revoke all on function gary_private.day_pass_at(date) from public;

-- 2. The pass's list: each play says whether he marked it at pick time.
create or replace function gary_private.parlay_candidates(p_date date)
 returns table(key text, source text, league text, text text, odds integer, matchup text, game_id text, commence_time timestamp with time zone, grade jsonb, signal text, ord integer)
 language sql stable set search_path to ''
as $function$
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
      (select split_part(d.reason, '. ', 1) from public.darts d where e.key ~ '^dart:[0-9]+$' and d.id = substring(e.key from 6)::bigint) as dart_line,
      -- His pick-time mark. A pick admitted to Winners after it was marked
      -- changes key (pick: -> winners:), so the game and words match too.
      (select coalesce(nullif(btrim(l.gary_line), ''), '') from public.parlay_legs l
        where l.game_date = p_date and (l.key = e.key or (l.game_id = e.game_id and lower(l.text) = lower(e.text)))
        order by l.ord limit 1) as mark_line
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
      when d.source = 'dart' then format('Dart, %s%s%s', upper(replace(coalesce(d.dart_kind, ''), '_', ' ')), case when d.dart_rank is not null then ' #' || d.dart_rank else '' end, case when d.dart_line <> '' then ': ' || d.dart_line || '.' else '' end)
      else format('%s%s', case when d.play then format('Gary''s play, $%s asked', d.asked) else 'Gary''s pick, not a play' end,
                  case when d.reader is not null then ', the reader: ' || replace(d.reader, '_', ' ') else '' end)
    end
    || case when d.mark_line is null then ''
            when d.mark_line = '' then E'\n    Marked for the parlay at pick time.'
            else E'\n    Marked for the parlay at pick time: ' || d.mark_line end as signal,
    (row_number() over (order by
      case when d.source = 'winners' then 0 when d.play and d.reader in ('clear','lean') then 1 when d.source = 'dart' then 2 when d.play then 3 else 4 end,
      coalesce(d.on_board_dollars, d.asked, 0) desc,
      case d.reader when 'clear' then 0 when 'lean' then 1 else 2 end,
      coalesce(d.dart_rank, 9), d.commence_time, d.key))::integer as ord
  from described d
  where d.reader is distinct from 'unsupported'
  order by ord
$function$;

-- 3. The ask: the whole list (up to 32), and the streak pick when Winners
-- plays are on it. p_fixed stays for the signature; the pass sends none.
create or replace function gary_private.parlay_enqueue_with(p_day date, p_fixed text[])
 returns integer language plpgsql security definer set search_path to ''
as $function$
declare v_games integer; v_n integer; v_keys text[]; v_streak_keys text[]; v_list text; v_fixed_list text; v_job uuid; v_min integer; v_max integer;
        v_fixed integer := coalesce(cardinality(p_fixed), 0); v_props jsonb; v_required jsonb;
begin
  if exists (select 1 from public.parlay_of_the_day where game_date = p_day) then return 0; end if;
  if exists (select 1 from public.parlay_jobs pj join public.subscription_model_jobs j on j.id = pj.job_id
             where pj.game_date = p_day and pj.created_at = (select max(x.created_at) from public.parlay_jobs x where x.game_date = p_day)
               and (j.status in ('queued','running') or j.completed_at > now() - interval '20 minutes')) then return 0; end if;
  select count(*), count(distinct c.game_id) into v_n, v_games from gary_private.parlay_candidates(p_day) c where not (c.key = any(coalesce(p_fixed, '{}')));
  if v_n + v_fixed < 4 or v_games < 2 then return 0; end if;
  select array_agg(c.key order by c.ord),
         array_agg(c.key order by c.ord) filter (where c.source = 'winners'),
         string_agg(format('[%s] %s · %s · %s · %s · %s', c.key, c.league, c.text,
           case when c.odds > 0 then '+' || c.odds else c.odds::text end, coalesce(c.matchup, ''),
           to_char(c.commence_time at time zone 'America/New_York', 'FMHH12:MI PM') || ' ET') || E'\n    ' || c.signal, E'\n' order by c.ord)
    into v_keys, v_streak_keys, v_list
    from (select * from gary_private.parlay_candidates(p_day) c where not (c.key = any(coalesce(p_fixed, '{}'))) limit 32) c;
  select string_agg(format('%s · %s · %s · %s', x.league, x.text, case when x.odds > 0 then '+' || x.odds else x.odds::text end,
           to_char(x.commence_time at time zone 'America/New_York', 'FMHH12:MI PM') || ' ET'), E'\n' order by array_position(p_fixed, x.key))
    into v_fixed_list from gary_private.parlay_resolve(p_day) x where x.key = any(coalesce(p_fixed, '{}'));
  v_min := greatest(1, 3 - v_fixed); v_max := 5 - v_fixed;
  v_props := jsonb_build_object(
    'legs', jsonb_build_object('type', 'array', 'minItems', v_min, 'maxItems', v_max, 'items', jsonb_build_object('type', 'string'),
      'description', case when v_fixed > 0 then 'the ids of the legs you add, in the order they read after the legs already on the ticket' else 'the ids of the legs, in the order they read on the ticket' end),
    'reason', jsonb_build_object('type', 'string'));
  v_required := jsonb_build_array('legs', 'reason');
  if v_streak_keys is not null then
    v_props := v_props || jsonb_build_object('streak', jsonb_build_object('type', 'string', 'enum', to_jsonb(v_streak_keys),
      'description', 'the id of today''s streak pick'));
    v_required := v_required || jsonb_build_array('streak');
  end if;
  insert into public.subscription_model_jobs (lane, status, request, expires_at)
  values ('parlay-of-the-day', 'queued', jsonb_build_object(
    'model', 'claude-opus-5-5',
    'system', gary_private.parlay_contract(),
    'messages', jsonb_build_array(jsonb_build_object('role', 'user', 'content',
      case when v_fixed > 0 then 'THE TICKET SO FAR (your legs, already on it):' || E'\n' || v_fixed_list || E'\n\n'
        || format('Complete it: add %s to %s more from the plays below.', v_min, v_max) || E'\n\n' else '' end
      || 'TODAY''S PLAYS' || E'\n' || v_list
      || case when v_streak_keys is not null
           then E'\n\nTODAY''S STREAK PICK: also name the one Winners play above you would put your streak on today.' else '' end)),
    'tools', jsonb_build_array(jsonb_build_object('name', 'build_parlay', 'input_schema', jsonb_build_object(
      'type', 'object', 'required', v_required, 'properties', v_props))),
    'tool_choice', jsonb_build_object('type', 'tool', 'name', 'build_parlay'),
    'output_config', jsonb_build_object('effort', 'medium')),
    now() + interval '25 minutes')
  returning id into v_job;
  insert into public.parlay_jobs (job_id, game_date, leg_keys, fixed_keys) values (v_job, p_day, v_keys, p_fixed);
  return 1;
end $function$;

-- 4. The pass fires at the day's pass time, then every ten minutes until a
-- ticket stands (a thin list waits for more of the day to be picked).
create or replace function gary_private.parlay_enqueue()
 returns integer language plpgsql security definer set search_path to ''
as $function$
declare v_day date := (now() at time zone 'America/New_York')::date; v_pass timestamptz;
begin
  if exists (select 1 from public.parlay_of_the_day where game_date = v_day) then return 0; end if;
  v_pass := gary_private.day_pass_at(v_day);
  if v_pass is null or now() < v_pass then return 0; end if;
  perform gary_private.parlay_sync_yes(v_day);
  return gary_private.parlay_enqueue_with(v_day, '{}');
end $function$;

-- 5. The pick-time path that published his marks as the ticket retires.
select cron.unschedule(jobid) from cron.job where jobname = 'parlay-lock';
drop function if exists gary_private.parlay_lock();
drop function if exists gary_private.parlay_standing(date);

-- 6. The streak pick he names at the pass. Kept even when the ticket itself
-- is rejected; the backstop (select_streak_pick) covers a pass that names none.
alter table public.streak_picks add column if not exists chosen_by text;

create or replace function gary_private.parlay_collect()
 returns integer language plpgsql security definer set search_path to ''
as $function$
declare n integer := 0; j record; added text[]; chosen text[]; legs jsonb; reason text; prices integer[]; ok boolean; why text; v_price record; a jsonb; b jsonb; v_streak text;
begin
  for j in
    select distinct on (pj.game_date) s.id, pj.game_date, pj.leg_keys, coalesce(pj.fixed_keys, '{}') as fixed_keys, s.response, s.route
    from public.subscription_model_jobs s join public.parlay_jobs pj on pj.job_id = s.id
    where s.lane = 'parlay-of-the-day' and s.status = 'completed' and pj.leg_keys is not null and pj.collected_at is null
      and not exists (select 1 from public.parlay_of_the_day x where x.game_date = pj.game_date)
    order by pj.game_date, s.completed_at desc nulls last
  loop
    update public.parlay_jobs pj set collected_at = now()
      where pj.game_date = j.game_date and pj.collected_at is null
        and exists (select 1 from public.subscription_model_jobs s where s.id = pj.job_id and s.status = 'completed');
    v_streak := btrim(j.response->'content'->0->'input'->>'streak', '[] ');
    if v_streak ~ '^winners:[0-9]+$' and v_streak = any(j.leg_keys) then
      insert into public.streak_picks (game_date, candidate_id, league, kind, pick_text, odds, matchup, game_id, commence_time, stake_units, player, prop, bet, chosen_by)
      select j.game_date, w.candidate_id, w.league, w.kind, c.pick_text, c.odds,
             coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')),
             c.game_id, c.commence_time, w.stake_units, c.pick_snapshot->>'player', c.pick_snapshot->>'prop', c.pick_snapshot->>'bet', 'gary at the day pass'
      from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
      where w.candidate_id = substring(v_streak from 9)::bigint and w.game_date = to_char(j.game_date, 'YYYY-MM-DD') and c.commence_time > now()
      on conflict do nothing;
    end if;
    select array_agg(btrim(e.value, '[]')) into added
      from jsonb_array_elements_text(coalesce(j.response->'content'->0->'input'->'legs', '[]'::jsonb)) e;
    chosen := j.fixed_keys || coalesce(added, '{}');
    reason := left(btrim(concat_ws(' ',
      (select string_agg(l.gary_line, ' ' order by l.ord) from public.parlay_legs l where l.game_date = j.game_date and l.key = any(j.fixed_keys) and l.gary_line is not null),
      j.response->'content'->0->'input'->>'reason')), 400);
    ok := coalesce(cardinality(chosen), 0) between 3 and 5 and coalesce(added, '{}') <@ j.leg_keys
      and cardinality(chosen) = (select count(distinct x) from unnest(chosen) x);
    why := case when not ok then 'parlay rejected: the ticket was not three to five different legs from the list' end;
    if ok then
      select jsonb_agg(jsonb_build_object('n', ord, 'key', l.key, 'source', l.source, 'league', l.league, 'text', l.text, 'odds', l.odds,
                                          'matchup', l.matchup, 'game_id', l.game_id, 'commence_time', l.commence_time, 'grade', l.grade) order by ord),
             array_agg(l.odds order by ord),
             count(*) = cardinality(chosen) and bool_and(l.commence_time > now())
        into legs, prices, ok
      from unnest(chosen) with ordinality as k(key, ord)
      join gary_private.parlay_resolve(j.game_date) l on l.key = k.key;
      if not ok then why := 'parlay rejected: a leg started or left the board before collection'; end if;
    end if;
    if ok and exists (select 1 from jsonb_array_elements(legs) e group by e->>'league', e->>'game_id' having count(*) > 2) then
      ok := false; why := 'parlay rejected: three legs from one game';
    end if;
    if ok then
      for a, b in select x.value, y.value from jsonb_array_elements(legs) x, jsonb_array_elements(legs) y
                  where (x.value->>'n')::int < (y.value->>'n')::int and x.value->>'league' = y.value->>'league' and x.value->>'game_id' = y.value->>'game_id'
      loop
        why := gary_private.parlay_pair_conflict(a, b);
        if why is not null then ok := false; why := format('parlay rejected: %s and %s: %s', a->>'text', b->>'text', why); exit; end if;
      end loop;
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
end $function$;

-- 7. The backstop: when the pass named no streak pick, his biggest stake
-- among plays still to start, never before the pass has had its turn.
create or replace function public.select_streak_pick(p_date text)
 returns boolean language plpgsql security definer set search_path to ''
as $function$
declare v_seal timestamptz; v_pass timestamptz; r record;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  if exists (select 1 from public.streak_picks where game_date = p_date::date) then return false; end if;
  v_pass := gary_private.day_pass_at(p_date::date);
  if v_pass is not null and now() < v_pass + interval '40 minutes' then return false; end if;
  select min(c.commence_time) into v_seal
  from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
  where w.game_date = p_date and c.commence_time > now();
  if v_seal is null then return false; end if;
  if v_seal > now() + interval '15 minutes' then return false; end if;
  select w.candidate_id, w.league, w.kind, c.pick_text, c.odds, c.game_id, c.commence_time, w.stake_units,
         coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')) as matchup,
         c.pick_snapshot->>'player' as player, c.pick_snapshot->>'prop' as prop, c.pick_snapshot->>'bet' as bet
    into r
  from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
  where w.game_date = p_date and c.commence_time > now()
  order by coalesce(w.stake_units, 0) desc, (w.kind = 'game') desc, w.admitted_at asc
  limit 1;
  if r is null then return false; end if;
  insert into public.streak_picks (game_date, candidate_id, league, kind, pick_text, odds, matchup, game_id, commence_time, stake_units, player, prop, bet, chosen_by)
  values (p_date::date, r.candidate_id, r.league, r.kind, r.pick_text, r.odds, r.matchup, r.game_id, r.commence_time, r.stake_units, r.player, r.prop, r.bet, 'biggest stake')
  on conflict do nothing;
  return found;
end $function$;

-- 8. The pick-time ask learns when the pass runs.
create or replace function public.parlay_ticket_state(p_date date)
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare v_slate integer; v_picked integer;
begin
  select count(*) into v_slate from public.daily_slate s where s.date::text = to_char(p_date, 'YYYY-MM-DD') and lower(coalesce(s.game_status,'')) not in ('cancelled','canceled','postponed');
  select count(distinct c.game_id) into v_picked from public.winners_candidates c where c.game_date = to_char(p_date, 'YYYY-MM-DD') and c.kind = 'game';
  return jsonb_build_object(
    'locked', exists (select 1 from public.parlay_of_the_day where game_date = p_date),
    'legs', coalesce((select jsonb_agg(jsonb_build_object('text', x.text, 'odds', x.odds, 'matchup', x.matchup, 'commence_time', x.commence_time) order by l.ord)
                      from public.parlay_legs l join gary_private.parlay_resolve(p_date) x on x.key = l.key
                      where l.game_date = p_date and l.dropped_reason is null), '[]'::jsonb),
    'slate_games', v_slate,
    'games_to_pick', greatest(0, v_slate - v_picked),
    'builds_at', gary_private.day_pass_at(p_date));
end $function$;
