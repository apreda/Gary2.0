-- Sunday Night Football closes the Sunday ticket (founder, Sep 26 2026:
-- "SNF is always the last leg of the parlay on Sundays only, just for fun").
-- On a Sunday with SNF plays on the list, Gary names that leg on its own
-- (snf_leg, one of the SNF ids) and the rest go in legs; the collect puts it
-- last and rejects a Sunday ticket without it. SNF is picked at 11 AM (the
-- scheduler), and NFL darts cover it from the morning, so it is on the list
-- at the 12:15 PM pass. No SNF play on the list: the ticket is built as any day.
alter table public.parlay_jobs add column if not exists snf_keys text[];

create or replace function gary_private.parlay_enqueue_with(p_day date, p_fixed text[])
 returns integer language plpgsql security definer set search_path to ''
as $function$
declare v_games integer; v_n integer; v_keys text[]; v_streak_keys text[]; v_snf_keys text[]; v_snf_game text; v_list text; v_fixed_list text; v_job uuid; v_min integer; v_max integer;
        v_fixed integer := coalesce(cardinality(p_fixed), 0); v_props jsonb; v_required jsonb;
begin
  if exists (select 1 from public.parlay_of_the_day where game_date = p_day) then return 0; end if;
  if exists (select 1 from public.parlay_jobs pj join public.subscription_model_jobs j on j.id = pj.job_id
             where pj.game_date = p_day and pj.created_at = (select max(x.created_at) from public.parlay_jobs x where x.game_date = p_day)
               and (j.status in ('queued','running') or j.completed_at > now() - interval '20 minutes')) then return 0; end if;
  select count(*), count(distinct c.game_id) into v_n, v_games from gary_private.parlay_candidates(p_day) c where not (c.key = any(coalesce(p_fixed, '{}')));
  if v_n + v_fixed < 4 or v_games < 2 then return 0; end if;
  if extract(isodow from p_day) = 7 then
    select array_agg(c.key order by c.ord),
           min(concat_ws(' · ', c.matchup, to_char(c.commence_time at time zone 'America/New_York', 'FMHH12:MI PM') || ' ET'))
      into v_snf_keys, v_snf_game
      from gary_private.parlay_candidates(p_day) c
      where c.league = 'NFL' and (c.commence_time at time zone 'America/New_York')::time >= time '19:30'
        and not (c.key = any(coalesce(p_fixed, '{}')));
  end if;
  select array_agg(c.key order by c.ord),
         array_agg(c.key order by c.ord) filter (where c.source = 'winners'),
         string_agg(format('[%s] %s · %s · %s · %s · %s', c.key, c.league, c.text,
           case when c.odds > 0 then '+' || c.odds else c.odds::text end, coalesce(c.matchup, ''),
           to_char(c.commence_time at time zone 'America/New_York', 'FMHH12:MI PM') || ' ET') || E'\n    ' || c.signal, E'\n' order by c.ord)
    into v_keys, v_streak_keys, v_list
    from gary_private.parlay_candidates(p_day) c
    where not (c.key = any(coalesce(p_fixed, '{}'))) and (c.ord <= 32 or c.key = any(coalesce(v_snf_keys, '{}')));
  select string_agg(format('%s · %s · %s · %s', x.league, x.text, case when x.odds > 0 then '+' || x.odds else x.odds::text end,
           to_char(x.commence_time at time zone 'America/New_York', 'FMHH12:MI PM') || ' ET'), E'\n' order by array_position(p_fixed, x.key))
    into v_fixed_list from gary_private.parlay_resolve(p_day) x where x.key = any(coalesce(p_fixed, '{}'));
  v_min := greatest(1, 3 - v_fixed); v_max := 5 - v_fixed;
  if v_snf_keys is not null then v_min := greatest(1, v_min - 1); v_max := v_max - 1; end if;
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
      || case when v_snf_keys is not null
           then E'\n\nSUNDAY NIGHT FOOTBALL: on Sundays the ticket closes with a leg from Sunday Night Football ('
                || coalesce(v_snf_game, 'tonight') || '). Name that leg in snf_leg; the others go in legs.' else '' end
      || case when v_streak_keys is not null
           then E'\n\nTODAY''S STREAK PICK: also name the one Winners play above you would put your streak on today.' else '' end)),
    'tools', jsonb_build_array(jsonb_build_object('name', 'build_parlay', 'input_schema', jsonb_build_object(
      'type', 'object', 'required', v_required, 'properties', v_props))),
    'tool_choice', jsonb_build_object('type', 'tool', 'name', 'build_parlay'),
    'output_config', jsonb_build_object('effort', 'medium')),
    now() + interval '25 minutes')
  returning id into v_job;
  insert into public.parlay_jobs (job_id, game_date, leg_keys, fixed_keys, snf_keys) values (v_job, p_day, v_keys, p_fixed, v_snf_keys);
  return 1;
end $function$;

create or replace function gary_private.parlay_collect()
 returns integer language plpgsql security definer set search_path to ''
as $function$
declare n integer := 0; j record; added text[]; chosen text[]; legs jsonb; reason text; prices integer[]; ok boolean; why text; v_price record; a jsonb; b jsonb; v_streak text; v_snf text;
begin
  for j in
    select distinct on (pj.game_date) s.id, pj.game_date, pj.leg_keys, coalesce(pj.fixed_keys, '{}') as fixed_keys, pj.snf_keys, s.response, s.route
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
    v_snf := btrim(j.response->'content'->0->'input'->>'snf_leg', '[] ');
    chosen := j.fixed_keys || coalesce(added, '{}')
      || case when j.snf_keys is not null and v_snf = any(j.snf_keys) then array[v_snf] else '{}'::text[] end;
    reason := left(btrim(concat_ws(' ',
      (select string_agg(l.gary_line, ' ' order by l.ord) from public.parlay_legs l where l.game_date = j.game_date and l.key = any(j.fixed_keys) and l.gary_line is not null),
      j.response->'content'->0->'input'->>'reason')), 400);
    ok := coalesce(cardinality(chosen), 0) between 3 and 5 and coalesce(added, '{}') <@ j.leg_keys
      and cardinality(chosen) = (select count(distinct x) from unnest(chosen) x);
    why := case when not ok then 'parlay rejected: the ticket was not three to five different legs from the list' end;
    if ok and j.snf_keys is not null and not coalesce(v_snf = any(j.snf_keys), false) then
      ok := false; why := 'parlay rejected: the Sunday ticket did not close with a Sunday Night Football leg';
    end if;
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
