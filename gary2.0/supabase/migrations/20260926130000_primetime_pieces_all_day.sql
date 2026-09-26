-- PRIMETIME / MARQUEE PIECES ALL DAY (founder, Sep 26 2026): the card showed only the
-- title until two hours before first pitch. Gary's opening, the stat and the injuries are
-- written as soon as the game is on the board, and rewritten once his pick posts.
create or replace function gary_private.primetime_enqueue() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_day date := (now() at time zone 'America/New_York')::date; g record; v_has_pick boolean; v_piece public.primetime_pieces;
        v_material text; v_job uuid; n integer := 0;
begin
  for g in select * from gary_private.primetime_games(v_day) loop
    continue when g.commence_time <= now() + interval '20 minutes';
    v_has_pick := gary_private.primetime_pick(v_day, g.league, g.game_id) is not null;
    select * into v_piece from public.primetime_pieces x where x.game_date = v_day and x.league = g.league and x.game_id = g.game_id;
    continue when found and (v_piece.had_pick or not v_has_pick);
    continue when exists (select 1 from public.primetime_jobs pj join public.subscription_model_jobs j on j.id = pj.job_id
      where pj.game_date = v_day and pj.league = g.league and pj.game_id = g.game_id and pj.had_pick = v_has_pick
        and (j.status in ('queued', 'running') or j.completed_at > now() - interval '20 minutes'));
    v_material := gary_private.primetime_material(v_day, g.league, g.game_id);
    continue when v_material is null;
    insert into public.subscription_model_jobs (lane, status, request, expires_at)
    values ('primetime', 'queued', jsonb_build_object(
      'model', 'claude-opus-5-5',
      'system', gary_private.primetime_contract(),
      'messages', jsonb_build_array(jsonb_build_object('role', 'user', 'content', 'THE MATERIAL' || E'\n' || v_material)),
      'tools', jsonb_build_array(jsonb_build_object('name', 'write_primetime', 'input_schema', jsonb_build_object(
        'type', 'object', 'required', jsonb_build_array('lede', 'stat_to_know', 'injuries'),
        'properties', jsonb_build_object(
          'lede', jsonb_build_object('type', 'string'),
          'stat_to_know', jsonb_build_object('type', 'string'),
          'injuries', jsonb_build_object('type', 'string'))))),
      'tool_choice', jsonb_build_object('type', 'tool', 'name', 'write_primetime'),
      'output_config', jsonb_build_object('effort', 'low')),
      now() + interval '15 minutes')
    returning id into v_job;
    insert into public.primetime_jobs (job_id, game_date, league, game_id, had_pick) values (v_job, v_day, g.league, g.game_id, v_has_pick);
    n := n + 1;
  end loop;
  return n;
end $$;
