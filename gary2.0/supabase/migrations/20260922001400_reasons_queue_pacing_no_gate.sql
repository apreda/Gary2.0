-- Sep 22 3:05 PM ET: twenty-one reasons jobs queued at once against a worker
-- that runs one at a time, each with a ten-minute wall clock from the moment
-- it was queued. Jobs six onward expired before the worker reached them
-- ("did not complete before the job deadline"), and the ones it did reach
-- late had a minute of model timeout left ("aborted due to timeout"). The
-- clock now starts generous and only two jobs are open at a time, so nothing
-- waits past its own deadline.
--
-- Also gone: the number-in-the-take gate on a reason. The founder's rule is
-- tune the ask, never bolt a checker on the back ("let the software work,
-- I'll judge its output on the app"). A reason is kept if it parses.

create or replace function gary_private.winners_reasons_enqueue() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; r record; v_job uuid; v_open integer;
begin
  select count(*) into v_open from public.subscription_model_jobs j
    where j.lane = 'winners-reasons' and j.status in ('queued','running');
  for r in
    select w.candidate_id, gary_private.winners_reason_source(w.pick_snapshot) as src
    from public.winners_board w
    where w.game_date >= to_char((now() at time zone 'America/New_York')::date - 2, 'YYYY-MM-DD')
      and not exists (select 1 from public.winners_reasons x where x.candidate_id = w.candidate_id)
      and not exists (select 1 from public.winners_reason_jobs rj join public.subscription_model_jobs j on j.id = rj.job_id
                      where rj.candidate_id = w.candidate_id
                        and (j.status in ('queued','running') or j.completed_at > now() - interval '30 minutes'))
    order by w.game_date desc, w.admitted_at
  loop
    exit when v_open + n >= 2;
    continue when r.src is null or length(r.src) < 80;
    insert into public.subscription_model_jobs (lane, status, request, expires_at)
    values ('winners-reasons', 'queued', jsonb_build_object(
      'candidate_id', r.candidate_id,
      'model', 'claude-sonnet-5',
      'system', gary_private.winners_reasons_contract(),
      'messages', jsonb_build_array(jsonb_build_object('role', 'user', 'content', r.src)),
      'tools', jsonb_build_array(jsonb_build_object('name', 'write_reasons', 'input_schema', jsonb_build_object(
        'type', 'object', 'required', jsonb_build_array('reasons'),
        'properties', jsonb_build_object('reasons', jsonb_build_object('type', 'array', 'minItems', 3, 'maxItems', 4,
          'items', jsonb_build_object('type', 'object', 'required', jsonb_build_array('claim', 'why'),
            'properties', jsonb_build_object('claim', jsonb_build_object('type', 'string'), 'why', jsonb_build_object('type', 'string')))))))),
      'tool_choice', jsonb_build_object('type', 'tool', 'name', 'write_reasons')),
      now() + interval '25 minutes')
    returning id into v_job;
    insert into public.winners_reason_jobs (job_id, candidate_id) values (v_job, r.candidate_id);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function gary_private.winners_reasons_collect() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; j record; reasons jsonb; clean jsonb;
begin
  for j in
    select s.id, rj.candidate_id, s.response, s.route
    from public.subscription_model_jobs s join public.winners_reason_jobs rj on rj.job_id = s.id
    where s.lane = 'winners-reasons' and s.status = 'completed'
      and not exists (select 1 from public.winners_reasons x where x.candidate_id = rj.candidate_id)
  loop
    reasons := j.response->'content'->0->'input'->'reasons';
    -- Keep what parses: objects with a claim and a why. Nothing else is judged here.
    select jsonb_agg(jsonb_build_object('claim', btrim(r->>'claim'), 'why', btrim(coalesce(r->>'why',''))))
      into clean
      from jsonb_array_elements(case when jsonb_typeof(reasons) = 'array' then reasons else '[]'::jsonb end) r
      where length(btrim(coalesce(r->>'claim',''))) > 0;
    if clean is not null and jsonb_array_length(clean) > 0 then
      insert into public.winners_reasons (candidate_id, reasons, model, job_id)
      values (j.candidate_id, clean, j.route, j.id) on conflict (candidate_id) do nothing;
      n := n + 1;
    else
      update public.subscription_model_jobs set status = 'failed', error = 'reasons: nothing parseable in the answer' where id = j.id;
    end if;
  end loop;
  return n;
end $$;

-- The parlay job gets the same generous clock.
create or replace function gary_private.parlay_enqueue() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_day date := (now() at time zone 'America/New_York')::date; v_n integer; v_first timestamptz; v_list text; v_job uuid;
begin
  if exists (select 1 from public.parlay_of_the_day where game_date = v_day) then return 0; end if;
  if exists (select 1 from public.parlay_jobs pj join public.subscription_model_jobs j on j.id = pj.job_id
             where pj.game_date = v_day and (j.status in ('queued','running') or j.completed_at > now() - interval '20 minutes')) then return 0; end if;
  select count(*), min(commence_time) into v_n, v_first from gary_private.parlay_legs(v_day);
  if v_n < 3 then return 0; end if;
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
    now() + interval '25 minutes')
  returning id into v_job;
  insert into public.parlay_jobs (job_id, game_date) values (v_job, v_day);
  return 1;
end $$;

-- Today's expired jobs are cleared so the next enqueue asks again now.
delete from public.subscription_model_jobs
 where lane in ('winners-reasons','parlay-of-the-day') and status = 'failed' and created_at > now() - interval '3 hours';
