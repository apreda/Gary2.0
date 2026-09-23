-- Winners reasons are app-visible writing: Opus 5.5 at low effort (founder,
-- Sep 23 2026: Opus "solved a lot of the a.i slop writing issues"). The body is
-- otherwise the live definition from 20260922001400.
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
      'model', 'claude-opus-5-5',
      'system', gary_private.winners_reasons_contract(),
      'messages', jsonb_build_array(jsonb_build_object('role', 'user', 'content', r.src)),
      'tools', jsonb_build_array(jsonb_build_object('name', 'write_reasons', 'input_schema', jsonb_build_object(
        'type', 'object', 'required', jsonb_build_array('reasons'),
        'properties', jsonb_build_object('reasons', jsonb_build_object('type', 'array', 'minItems', 3, 'maxItems', 4,
          'items', jsonb_build_object('type', 'object', 'required', jsonb_build_array('claim', 'why'),
            'properties', jsonb_build_object('claim', jsonb_build_object('type', 'string'), 'why', jsonb_build_object('type', 'string')))))))),
      'tool_choice', jsonb_build_object('type', 'tool', 'name', 'write_reasons'),
      'output_config', jsonb_build_object('effort', 'low')),
      now() + interval '25 minutes')
    returning id into v_job;
    insert into public.winners_reason_jobs (job_id, candidate_id) values (v_job, r.candidate_id);
    n := n + 1;
  end loop;
  return n;
end $$;
