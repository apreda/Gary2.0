-- Opus 5.5 replaces Opus 5 (founder, Sep 23 2026). Parlay of the Day asks the
-- worker for the new model; the body is otherwise the 20260922001400 definition.
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
    'model', 'claude-opus-5-5',
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
