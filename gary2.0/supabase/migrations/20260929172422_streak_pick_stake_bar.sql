-- THE STREAK PICK BY STAKE (founder, Sep 29 2026): the first Winners play Gary
-- stakes at 3 units ($300) or more is the day's streak pick, chosen as soon as
-- it is on the board. A day with no play at that stake by the day pass takes
-- the biggest stake still to start at the pass. Gary no longer names it at the
-- parlay pass: games that started before the pass could never be it, thin days
-- ran no pass at all, and the backstop sealed 15 minutes before a start (Sep 28:
-- 8:10 PM for an 8:15 kickoff; Sep 29: nothing, the $400 Braves play went at 2).
-- Nothing Gary reads when he bets mentions the bar, so his stakes stay his own.

-- 1. The streak pick.
create or replace function public.select_streak_pick(p_date text)
 returns boolean language plpgsql security definer set search_path to ''
as $function$
declare v_pass timestamptz; r record; v_by text := 'stake bar';
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  if exists (select 1 from public.streak_picks where game_date = p_date::date) then return false; end if;
  select w.candidate_id, w.league, w.kind, c.pick_text, c.odds, c.game_id, c.commence_time, w.stake_units,
         coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')) as matchup,
         c.pick_snapshot->>'player' as player, c.pick_snapshot->>'prop' as prop, c.pick_snapshot->>'bet' as bet
    into r
  from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
  where w.game_date = p_date and c.commence_time > now() and w.stake_units >= 3
  order by w.admitted_at asc, w.stake_units desc
  limit 1;
  if not found then
    v_pass := gary_private.day_pass_at(p_date::date);
    if v_pass is not null and now() < v_pass then return false; end if;
    v_by := 'biggest stake';
    select w.candidate_id, w.league, w.kind, c.pick_text, c.odds, c.game_id, c.commence_time, w.stake_units,
           coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')) as matchup,
           c.pick_snapshot->>'player' as player, c.pick_snapshot->>'prop' as prop, c.pick_snapshot->>'bet' as bet
      into r
    from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
    where w.game_date = p_date and c.commence_time > now()
    order by coalesce(w.stake_units, 0) desc, (w.kind = 'game') desc, w.admitted_at asc
    limit 1;
    if not found then return false; end if;
  end if;
  insert into public.streak_picks (game_date, candidate_id, league, kind, pick_text, odds, matchup, game_id, commence_time, stake_units, player, prop, bet, chosen_by)
  values (p_date::date, r.candidate_id, r.league, r.kind, r.pick_text, r.odds, r.matchup, r.game_id, r.commence_time, r.stake_units, r.player, r.prop, r.bet, v_by)
  on conflict do nothing;
  return found;
end $function$;

-- 2. Checked every two minutes, so a play at the bar is the streak pick
-- within two minutes of Gary placing it.
select cron.schedule('streak-pick-select', '*/2 * * * *',
  $$select public.select_streak_pick(to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD'))$$);

-- 3. The parlay pass builds the ticket only.
create or replace function gary_private.parlay_enqueue_with(p_day date, p_fixed text[])
 returns integer language plpgsql security definer set search_path to ''
as $function$
declare v_games integer; v_n integer; v_keys text[]; v_snf_keys text[]; v_snf_game text; v_list text; v_fixed_list text; v_job uuid; v_min integer; v_max integer;
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
         string_agg(format('[%s] %s · %s · %s · %s · %s', c.key, c.league, c.text,
           case when c.odds > 0 then '+' || c.odds else c.odds::text end, coalesce(c.matchup, ''),
           to_char(c.commence_time at time zone 'America/New_York', 'FMHH12:MI PM') || ' ET') || E'\n    ' || c.signal, E'\n' order by c.ord)
    into v_keys, v_list
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

create or replace function gary_private.parlay_collect()
 returns integer language plpgsql security definer set search_path to ''
as $function$
declare n integer := 0; j record; added text[]; chosen text[]; legs jsonb; reason text; prices integer[]; ok boolean; why text; v_price record; a jsonb; b jsonb; v_snf text;
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
