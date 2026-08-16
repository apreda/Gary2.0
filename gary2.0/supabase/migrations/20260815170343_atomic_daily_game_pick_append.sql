-- Serialize every daily-picks JSON append inside Postgres. Independent sport
-- runners can finish concurrently without replacing another runner's picks.
--
-- Game picks are first-writer-wins by provider game id, scoped to the sport.
-- Team matching is used only when either side is a legacy record without an
-- id. The existing prop and soccer identities are retained so moving all
-- daily writers onto this RPC does not change their product behavior.

create unique index if not exists daily_picks_date_unique
  on public.daily_picks (date);

create or replace function public.append_daily_picks_atomic(
  p_date text,
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
  v_new_is_prop boolean;
  v_existing_is_prop boolean;
  v_new_soccer_id text;
  v_existing_soccer_id text;
  v_new_game_id text;
  v_existing_game_id text;
  v_new_sport text;
  v_existing_sport text;
  v_new_home text;
  v_new_away text;
  v_existing_home text;
  v_existing_away text;
  v_new_player text;
  v_existing_player text;
  v_new_prop text;
  v_existing_prop text;
  v_new_soccer_category text;
  v_existing_soccer_category text;
  v_row_found boolean := false;
  v_clash boolean;
  v_added integer := 0;
  v_skipped integer := 0;
  v_prop_count integer := 0;
  v_game_ids jsonb := '[]'::jsonb;
begin
  if p_date is null or pg_catalog.btrim(p_date) = '' then
    raise exception 'p_date is required';
  end if;

  if p_new_picks is null or jsonb_typeof(p_new_picks) <> 'array' then
    raise exception 'p_new_picks must be a JSON array';
  end if;

  if jsonb_array_length(p_new_picks) = 0 then
    raise exception 'p_new_picks must not be empty';
  end if;

  -- FOR UPDATE protects an existing row. The transaction-scoped advisory lock
  -- also protects the no-row-yet case before the unique-date insert exists.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('daily_picks|' || p_date, 0)
  );

  select coalesce(d.picks, '[]'::jsonb)
    into v_existing
    from public.daily_picks as d
   where d.date = p_date
   for update;

  v_row_found := found;
  v_existing := coalesce(v_existing, '[]'::jsonb);
  if jsonb_typeof(v_existing) <> 'array' then
    raise exception 'daily_picks.picks must be a JSON array for date %', p_date;
  end if;

  v_result := v_existing;
  select count(*)::integer
    into v_prop_count
    from jsonb_array_elements(v_existing) as item(value)
   where item.value->>'type' = 'prop'
      or item.value->>'pickType' = 'prop';

  for v_new_pick in
    select value from jsonb_array_elements(p_new_picks)
  loop
    if jsonb_typeof(v_new_pick) <> 'object' then
      raise exception 'every daily pick must be a JSON object';
    end if;

    v_new_is_prop := coalesce(v_new_pick->>'type', '') = 'prop'
      or coalesce(v_new_pick->>'pickType', '') = 'prop';
    v_new_soccer_id := nullif(pg_catalog.btrim(v_new_pick->>'soccer_match_id'), '');
    v_new_game_id := coalesce(
      nullif(pg_catalog.btrim(v_new_pick->>'bdl_game_id'), ''),
      nullif(pg_catalog.btrim(v_new_pick->>'game_id'), '')
    );
    v_new_sport := pg_catalog.lower(pg_catalog.btrim(coalesce(
      nullif(v_new_pick->>'league', ''),
      nullif(v_new_pick->>'sport', ''),
      ''
    )));
    v_new_home := pg_catalog.lower(pg_catalog.btrim(coalesce(v_new_pick->>'homeTeam', '')));
    v_new_away := pg_catalog.lower(pg_catalog.btrim(coalesce(v_new_pick->>'awayTeam', '')));
    v_new_player := pg_catalog.lower(pg_catalog.btrim(coalesce(v_new_pick->>'player', '')));
    v_new_prop := pg_catalog.lower(pg_catalog.btrim(coalesce(
      nullif(v_new_pick->>'prop', ''),
      nullif(v_new_pick->>'statType', ''),
      ''
    )));
    v_new_soccer_category := pg_catalog.lower(pg_catalog.btrim(coalesce(
      nullif(v_new_pick->>'pick_category', ''),
      nullif(v_new_pick->>'type', ''),
      'moneyline'
    )));
    v_clash := false;

    for v_existing_pick in
      select value from jsonb_array_elements(v_result)
    loop
      v_existing_is_prop := coalesce(v_existing_pick->>'type', '') = 'prop'
        or coalesce(v_existing_pick->>'pickType', '') = 'prop';
      v_existing_soccer_id := nullif(
        pg_catalog.btrim(v_existing_pick->>'soccer_match_id'),
        ''
      );
      v_existing_game_id := coalesce(
        nullif(pg_catalog.btrim(v_existing_pick->>'bdl_game_id'), ''),
        nullif(pg_catalog.btrim(v_existing_pick->>'game_id'), '')
      );
      v_existing_sport := pg_catalog.lower(pg_catalog.btrim(coalesce(
        nullif(v_existing_pick->>'league', ''),
        nullif(v_existing_pick->>'sport', ''),
        ''
      )));

      if v_new_is_prop and v_existing_is_prop then
        v_existing_player := pg_catalog.lower(pg_catalog.btrim(coalesce(
          v_existing_pick->>'player',
          ''
        )));
        v_existing_prop := pg_catalog.lower(pg_catalog.btrim(coalesce(
          nullif(v_existing_pick->>'prop', ''),
          nullif(v_existing_pick->>'statType', ''),
          ''
        )));
        v_clash := v_existing_sport = v_new_sport
          and v_existing_player = v_new_player
          and v_existing_prop = v_new_prop;
      elsif not v_new_is_prop
        and not v_existing_is_prop
        and v_new_soccer_id is not null
        and v_existing_soccer_id is not null
      then
        v_existing_soccer_category := pg_catalog.lower(pg_catalog.btrim(coalesce(
          nullif(v_existing_pick->>'pick_category', ''),
          nullif(v_existing_pick->>'type', ''),
          'moneyline'
        )));
        v_clash := v_existing_soccer_id = v_new_soccer_id
          and v_existing_soccer_category = v_new_soccer_category;
      elsif not v_new_is_prop
        and not v_existing_is_prop
        and v_new_soccer_id is null
        and v_existing_soccer_id is null
        and v_existing_sport = v_new_sport
      then
        if v_new_game_id is not null and v_existing_game_id is not null then
          -- Provider identity is authoritative and keeps doubleheaders apart.
          v_clash := v_existing_game_id = v_new_game_id;
        else
          -- At least one side predates game-id stamping. Only that legacy case
          -- falls back to the matchup within this date and sport.
          v_existing_home := pg_catalog.lower(pg_catalog.btrim(coalesce(
            v_existing_pick->>'homeTeam',
            ''
          )));
          v_existing_away := pg_catalog.lower(pg_catalog.btrim(coalesce(
            v_existing_pick->>'awayTeam',
            ''
          )));
          v_clash := v_new_home <> ''
            and v_new_away <> ''
            and v_existing_home = v_new_home
            and v_existing_away = v_new_away;
        end if;
      end if;

      exit when v_clash;
    end loop;

    if v_clash then
      v_skipped := v_skipped + 1;
    elsif v_new_is_prop and v_prop_count >= 10 then
      -- Keep the long-standing daily-picks prop cap without ever deleting a
      -- prop that another writer already published.
      v_skipped := v_skipped + 1;
    else
      v_result := v_result || pg_catalog.jsonb_build_array(v_new_pick);
      v_added := v_added + 1;
      if v_new_is_prop then
        v_prop_count := v_prop_count + 1;
      end if;
      if v_new_game_id is not null then
        v_game_ids := v_game_ids || pg_catalog.jsonb_build_array(v_new_game_id);
      end if;
    end if;
  end loop;

  if v_row_found then
    update public.daily_picks
       set picks = v_result,
           updated_at = pg_catalog.now()
     where date = p_date;
  else
    insert into public.daily_picks (date, picks, updated_at)
    values (p_date, v_result, pg_catalog.now());
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

revoke execute on function public.append_daily_picks_atomic(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.append_daily_picks_atomic(text, jsonb)
  to service_role;

comment on function public.append_daily_picks_atomic(text, jsonb) is
  'Atomically appends first-writer-wins picks to one date-keyed daily JSON ledger row.';
