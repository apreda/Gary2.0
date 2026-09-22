-- THE REASONS ON THE CARD (founder GO, Sep 22 2026): "take Gary's actual
-- three- or four-paragraph rationale for the pick and turn it into ... an
-- easy, nice, short, concise way to understand what Gary is saying."
--
-- Gary's take is a story. The unveil board wants three or four claims with
-- the numbers under each. Slicing the story by sentence gave fragments, so a
-- formatting pass on the subscription worker ($0) writes the reasons from his
-- rationale, and a guard refuses any reason whose numbers are not in it.
-- Nothing about the pick, the price or the take changes.

create table if not exists public.winners_reasons (
  candidate_id bigint primary key references public.winners_candidates(id) on delete cascade,
  reasons jsonb not null,
  model text,
  job_id uuid,
  created_at timestamptz not null default now()
);
alter table public.winners_reasons enable row level security;
revoke all on public.winners_reasons from public, anon, authenticated;
grant all on public.winners_reasons to service_role;

-- The worker blanks a job's request when it completes, so the candidate a job
-- was for is kept here, beside it.
create table if not exists public.winners_reason_jobs (
  job_id uuid primary key references public.subscription_model_jobs(id) on delete cascade,
  candidate_id bigint not null references public.winners_candidates(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.winners_reason_jobs enable row level security;
revoke all on public.winners_reason_jobs from public, anon, authenticated;
grant all on public.winners_reason_jobs to service_role;

create or replace function gary_private.winners_reasons_contract() returns text
language sql immutable as $$
  select $c$You are laying out Gary's own written reason for one play as three or four short reasons for a card. The text is his; you are formatting it, not judging it. Use only what it says: every number, name, date and stat must appear in it, and nothing may be added, softened or strengthened. Each reason has a claim and a why. The claim is one plain sentence of at most 40 characters, words rather than numbers, ending with a period, that states the point. The why is one or two sentences of at most 200 characters that carry the specific numbers behind that point, in his voice when he writes in the first person. Write four reasons only when he makes four distinct points; otherwise three. The pick and its price are not reasons. Do not repeat a point. Return only the requested JSON.$c$
$$;

-- The rationale as the reader gets it: the "Gary's Take" heading stripped.
create or replace function gary_private.winners_reason_source(p_snapshot jsonb) returns text
language sql immutable as $$
  select nullif(btrim(regexp_replace(coalesce(p_snapshot->>'rationale', p_snapshot->>'analysis', ''), '^\s*Gary''s Take\s*', '')), '')
$$;

-- Queue one formatting job per board ticket that has a take and no reasons.
create or replace function gary_private.winners_reasons_enqueue() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; r record; v_job uuid;
begin
  for r in
    select w.candidate_id, gary_private.winners_reason_source(w.pick_snapshot) as src
    from public.winners_board w
    where w.game_date >= to_char((now() at time zone 'America/New_York')::date - 2, 'YYYY-MM-DD')
      and not exists (select 1 from public.winners_reasons x where x.candidate_id = w.candidate_id)
      and not exists (select 1 from public.winners_reason_jobs rj join public.subscription_model_jobs j on j.id = rj.job_id
                      where rj.candidate_id = w.candidate_id
                        and (j.status in ('queued','running') or j.completed_at > now() - interval '30 minutes'))
  loop
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
      now() + interval '10 minutes')
    returning id into v_job;
    insert into public.winners_reason_jobs (job_id, candidate_id) values (v_job, r.candidate_id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Every number in a reason must be in the take. No guard on his judgment,
-- only on invention.
create or replace function gary_private.winners_reasons_valid(p_reasons jsonb, p_src text) returns boolean
language plpgsql immutable as $$
declare r jsonb; m text[]; txt text;
begin
  if jsonb_typeof(p_reasons) <> 'array' or jsonb_array_length(p_reasons) not between 3 and 4 then return false; end if;
  for r in select value from jsonb_array_elements(p_reasons) loop
    if length(btrim(coalesce(r->>'claim',''))) not between 4 and 44 then return false; end if;
    if length(btrim(coalesce(r->>'why',''))) not between 4 and 220 then return false; end if;
    txt := (r->>'claim') || ' ' || (r->>'why');
    for m in select regexp_matches(txt, '[0-9]+(?:\.[0-9]+)?', 'g') loop
      if position(m[1] in p_src) = 0 then return false; end if;
    end loop;
  end loop;
  return true;
end $$;

-- Collect finished jobs into winners_reasons; a reason that fails the guard is
-- dropped so the next enqueue asks again.
create or replace function gary_private.winners_reasons_collect() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0; j record; reasons jsonb; src text;
begin
  for j in
    select s.id, rj.candidate_id, s.response, s.route
    from public.subscription_model_jobs s join public.winners_reason_jobs rj on rj.job_id = s.id
    where s.lane = 'winners-reasons' and s.status = 'completed'
      and not exists (select 1 from public.winners_reasons x where x.candidate_id = rj.candidate_id)
  loop
    reasons := j.response->'content'->0->'input'->'reasons';
    select gary_private.winners_reason_source(w.pick_snapshot) into src from public.winners_board w where w.candidate_id = j.candidate_id;
    if reasons is not null and src is not null and gary_private.winners_reasons_valid(reasons, src) then
      insert into public.winners_reasons (candidate_id, reasons, model, job_id)
      values (j.candidate_id, reasons, j.route, j.id) on conflict (candidate_id) do nothing;
      n := n + 1;
    else
      update public.subscription_model_jobs set status = 'failed', error = 'reasons rejected: shape or a number not in the take' where id = j.id;
    end if;
  end loop;
  return n;
end $$;

select cron.unschedule(jobid) from cron.job where jobname in ('winners-reasons-enqueue','winners-reasons-collect');
select cron.schedule('winners-reasons-enqueue', '*/2 * * * *', $cron$select gary_private.winners_reasons_enqueue()$cron$);
select cron.schedule('winners-reasons-collect', '* * * * *', $cron$select gary_private.winners_reasons_collect()$cron$);

-- The board and the dossier carry the reasons.
create or replace function public.get_winners_board(p_date text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_historical boolean; v_free bigint;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  if to_char(p_date::date,'YYYY-MM-DD') <> p_date then raise exception 'Invalid date'; end if;
  v_historical := p_date::date < (now() at time zone 'America/New_York')::date;
  select s.candidate_id into v_free from public.streak_picks s where s.game_date = p_date::date;
  return jsonb_build_object(
    'access', public.get_my_access(),
    'free_candidate_id', v_free,
    'boards', coalesce((select jsonb_agg(to_jsonb(b)) from (
      select w.league,w.kind,count(*) filter (where w.candidate_id is distinct from v_free)::bigint as count,
        not (v_historical or gary_private.has_winners_access(w.league)) as locked
      from public.winners_board w where w.game_date=p_date group by w.league,w.kind
      having count(*) filter (where w.candidate_id is distinct from v_free) > 0
      order by w.league,w.kind) b),'[]'::jsonb),
    'tickets', coalesce((select jsonb_agg((to_jsonb(w) || jsonb_build_object('reasons', r.reasons)) order by w.admitted_at,w.candidate_id)
      from public.winners_board w
      left join public.winners_reasons r on r.candidate_id = w.candidate_id
      where w.game_date=p_date
      and (v_historical or w.candidate_id = v_free or gary_private.has_winners_access(w.league))),'[]'::jsonb));
end $$;
revoke all on function public.get_winners_board(text) from public;
grant execute on function public.get_winners_board(text) to anon, authenticated, service_role;

create or replace function public.get_winners_play(p_candidate_id bigint) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  v_c public.winners_candidates;
  v_b public.winners_board;
  v_desk text; v_cases jsonb; v_home text; v_away text; v_home_team text; v_away_team text; v_pick_is_home boolean;
begin
  select * into v_c from public.winners_candidates wc where wc.id = p_candidate_id and wc.admitted_at is not null;
  if not found then raise exception 'No such play'; end if;
  select * into v_b from public.winners_board wb where wb.candidate_id = p_candidate_id;
  if not found then raise exception 'No such play'; end if;
  if not gary_private.lab_can_see(v_c.game_date, v_c.league) then raise exception 'Locked'; end if;

  v_desk := v_c.evidence_snapshot->>'deskText';
  if v_c.kind = 'game' then
    v_home := coalesce(nullif(v_c.evidence_snapshot->>'caseHome', ''), nullif(v_b.pick_snapshot->>'path_home', ''));
    v_away := coalesce(nullif(v_c.evidence_snapshot->>'caseAway', ''), nullif(v_b.pick_snapshot->>'path_away', ''));
    v_home_team := coalesce(v_c.evidence_snapshot->>'homeTeam', v_b.pick_snapshot->>'homeTeam');
    v_away_team := coalesce(v_c.evidence_snapshot->>'awayTeam', v_b.pick_snapshot->>'awayTeam');
    v_pick_is_home := case
      when (v_c.evidence_snapshot->>'pickIsHome') in ('true', 'false') then (v_c.evidence_snapshot->>'pickIsHome')::boolean
      when v_home_team is not null then position(lower(v_home_team) in lower(v_c.pick_text)) = 1 end;
    if v_home is not null or v_away is not null then
      v_cases := jsonb_build_object('home', v_home, 'away', v_away, 'pick_is_home', v_pick_is_home,
                                    'home_team', v_home_team, 'away_team', v_away_team);
    end if;
  end if;

  return jsonb_build_object(
    'candidate', jsonb_build_object(
      'id', v_c.id, 'game_date', v_c.game_date, 'league', v_c.league, 'kind', v_c.kind, 'game_id', v_c.game_id,
      'pick_text', v_c.pick_text, 'odds', v_c.odds, 'commence_time', v_c.commence_time,
      'admitted_at', v_b.admitted_at, 'reason', v_b.reason, 'stake_units', v_b.stake_units),
    'snapshot', v_b.pick_snapshot,
    'cases', v_cases,
    'briefing', nullif(v_c.evidence_snapshot->>'researchBriefing', ''),
    'reasons', (select r.reasons from public.winners_reasons r where r.candidate_id = v_c.id),
    'desk', jsonb_build_object(
      'chars', coalesce(length(v_desk), 0),
      'sections', coalesce((
        select jsonb_agg(jsonb_build_object('index', d.idx, 'title', d.title, 'chars', d.chars) order by d.idx)
        from gary_private.lab_desk_sections(v_desk) d), '[]'::jsonb)),
    'with_it', coalesce((
      select jsonb_agg(jsonb_build_object(
          'candidate_id', w.candidate_id, 'kind', w.kind, 'pick_text', wc.pick_text, 'odds', wc.odds,
          'stake_units', w.stake_units, 'reason', w.reason, 'pick_snapshot', w.pick_snapshot)
        order by w.admitted_at, w.candidate_id)
      from public.winners_board w
      join public.winners_candidates wc on wc.id = w.candidate_id
      where w.game_date = v_c.game_date and w.league = v_c.league and w.game_id = v_c.game_id
        and w.candidate_id <> v_c.id), '[]'::jsonb),
    'ladder', public.line_ladder(v_c.league, v_c.game_date, v_c.game_id),
    'result', gary_private.lab_ticket_result(v_c.kind, v_c.league, v_c.game_date, v_c.game_id, v_c.pick_text, v_b.pick_snapshot),
    'live', (
      select to_jsonb(ls) from public.live_scores ls
      where v_c.game_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and ls.date = v_c.game_date::date
        and ls.league = v_c.league and ls.game_id = v_c.game_id
      order by ls.updated_at desc limit 1),
    'tape', gary_private.lab_tape(v_c.league, v_c.kind));
end $$;
