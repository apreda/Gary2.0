-- Serialize weekly NFL JSON updates inside Postgres so independent game
-- runners can finish concurrently without a read/merge/upsert lost update.
-- First writer wins for an exact provider game id. Legacy rows without an id
-- still collide by matchup, preserving the existing publication guard.

create or replace function public.append_weekly_nfl_picks_atomic(
  p_week_start date,
  p_week_number integer,
  p_season integer,
  p_new_picks jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing jsonb;
  v_result jsonb;
  v_new_pick jsonb;
  v_existing_pick jsonb;
  v_new_game_id text;
  v_existing_game_id text;
  v_new_home text;
  v_new_away text;
  v_existing_home text;
  v_existing_away text;
  v_row_found boolean := false;
  v_clash boolean;
  v_added integer := 0;
  v_skipped integer := 0;
  v_game_ids jsonb := '[]'::jsonb;
begin
  if p_week_start is null or p_week_number is null or p_season is null then
    raise exception 'week_start, week_number, and season are required';
  end if;

  if p_new_picks is null or jsonb_typeof(p_new_picks) <> 'array' then
    raise exception 'p_new_picks must be a JSON array';
  end if;

  -- The advisory lock also protects the no-row-yet case, where FOR UPDATE
  -- alone cannot lock anything and two concurrent inserts could conflict.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'weekly_nfl_picks|' || p_week_start::text || '|' || p_season::text,
      0
    )
  );

  select coalesce(w.picks, '[]'::jsonb)
    into v_existing
    from public.weekly_nfl_picks as w
   where w.week_start = p_week_start
     and w.season = p_season
   for update;

  v_row_found := found;
  v_existing := coalesce(v_existing, '[]'::jsonb);
  if jsonb_typeof(v_existing) <> 'array' then
    raise exception 'weekly_nfl_picks.picks must be a JSON array';
  end if;
  v_result := v_existing;

  for v_new_pick in
    select value from jsonb_array_elements(p_new_picks)
  loop
    if jsonb_typeof(v_new_pick) <> 'object' then
      raise exception 'every NFL pick must be a JSON object';
    end if;

    v_new_game_id := coalesce(
      nullif(pg_catalog.btrim(v_new_pick->>'bdl_game_id'), ''),
      nullif(pg_catalog.btrim(v_new_pick->>'game_id'), '')
    );
    if v_new_game_id is null then
      raise exception 'every new NFL pick requires bdl_game_id or game_id';
    end if;

    v_new_home := pg_catalog.lower(pg_catalog.btrim(coalesce(v_new_pick->>'homeTeam', '')));
    v_new_away := pg_catalog.lower(pg_catalog.btrim(coalesce(v_new_pick->>'awayTeam', '')));
    v_clash := false;

    for v_existing_pick in
      select value from jsonb_array_elements(v_result)
    loop
      v_existing_game_id := coalesce(
        nullif(pg_catalog.btrim(v_existing_pick->>'bdl_game_id'), ''),
        nullif(pg_catalog.btrim(v_existing_pick->>'game_id'), '')
      );

      if v_existing_game_id is not null then
        v_clash := v_existing_game_id = v_new_game_id;
      else
        -- Legacy records were not game-id stamped. Match them by teams so a
        -- concurrent/new runner cannot publish a second side for that game.
        v_existing_home := pg_catalog.lower(pg_catalog.btrim(coalesce(v_existing_pick->>'homeTeam', '')));
        v_existing_away := pg_catalog.lower(pg_catalog.btrim(coalesce(v_existing_pick->>'awayTeam', '')));
        v_clash := v_new_home <> '' and v_new_away <> ''
          and v_existing_home = v_new_home
          and v_existing_away = v_new_away;
      end if;

      exit when v_clash;
    end loop;

    if v_clash then
      v_skipped := v_skipped + 1;
    else
      v_result := v_result || pg_catalog.jsonb_build_array(v_new_pick);
      v_added := v_added + 1;
      v_game_ids := v_game_ids || pg_catalog.jsonb_build_array(v_new_game_id);
    end if;
  end loop;

  if v_row_found then
    update public.weekly_nfl_picks
       set picks = v_result,
           week_number = coalesce(week_number, p_week_number),
           updated_at = pg_catalog.now()
     where week_start = p_week_start
       and season = p_season;
  else
    insert into public.weekly_nfl_picks (
      week_start,
      week_number,
      season,
      picks,
      updated_at
    ) values (
      p_week_start,
      p_week_number,
      p_season,
      v_result,
      pg_catalog.now()
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'added', v_added,
    'skipped', v_skipped,
    'total', jsonb_array_length(v_result),
    'game_ids', v_game_ids,
    'mode', case when v_row_found then 'append' else 'insert' end
  );
end;
$$;

revoke execute on function public.append_weekly_nfl_picks_atomic(date, integer, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.append_weekly_nfl_picks_atomic(date, integer, integer, jsonb)
  to service_role;

comment on function public.append_weekly_nfl_picks_atomic(date, integer, integer, jsonb) is
  'Atomically appends first-writer-wins NFL game picks to one weekly JSON ledger row.';
