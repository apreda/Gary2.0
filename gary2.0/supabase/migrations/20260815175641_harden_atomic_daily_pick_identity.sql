-- Follow-up to 20260815170343_atomic_daily_game_pick_append.sql.
--
-- The deployed function used SQL's three-valued boolean result for prop
-- detection (`false OR null` => `null`). A normal game pick without
-- `pickType` therefore missed every `not v_*_is_prop` branch and a repeated
-- writer could append the same game again. Keep the original migration
-- immutable and replace the RPC here with total booleans plus canonical sport
-- aliases. Exact provider ids remain sport-scoped so unrelated games and
-- cross-provider legacy data are not collapsed.

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
  v_new_sport_token text;
  v_existing_sport_token text;
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
   where pg_catalog.lower(pg_catalog.btrim(coalesce(item.value->>'type', ''))) = 'prop'
      or pg_catalog.lower(pg_catalog.btrim(coalesce(item.value->>'pickType', ''))) = 'prop';

  for v_new_pick in
    select value from jsonb_array_elements(p_new_picks)
  loop
    if jsonb_typeof(v_new_pick) <> 'object' then
      raise exception 'every daily pick must be a JSON object';
    end if;

    -- COALESCE makes this a real true/false value even when one or both keys
    -- are absent. This is the production duplicate's direct root-cause fix.
    v_new_is_prop :=
      pg_catalog.lower(pg_catalog.btrim(coalesce(v_new_pick->>'type', ''))) = 'prop'
      or pg_catalog.lower(pg_catalog.btrim(coalesce(v_new_pick->>'pickType', ''))) = 'prop';
    v_new_soccer_id := nullif(pg_catalog.btrim(v_new_pick->>'soccer_match_id'), '');
    v_new_game_id := coalesce(
      nullif(pg_catalog.btrim(v_new_pick->>'bdl_game_id'), ''),
      nullif(pg_catalog.btrim(v_new_pick->>'game_id'), ''),
      nullif(pg_catalog.btrim(v_new_pick->>'bdlGameId'), ''),
      nullif(pg_catalog.btrim(v_new_pick->>'gameId'), '')
    );
    v_new_sport_token := pg_catalog.regexp_replace(
      pg_catalog.lower(pg_catalog.btrim(coalesce(
        nullif(v_new_pick->>'league', ''),
        nullif(v_new_pick->>'sport', ''),
        nullif(v_new_pick->>'sport_key', ''),
        ''
      ))),
      '[^a-z0-9]+',
      '',
      'g'
    );
    v_new_sport := case v_new_sport_token
      when 'baseballmlb' then 'mlb'
      when 'basketballnba' then 'nba'
      when 'basketballwnba' then 'wnba'
      when 'basketballncaab' then 'ncaab'
      when 'icehockeynhl' then 'nhl'
      when 'americanfootballnfl' then 'nfl'
      when 'footballnfl' then 'nfl'
      when 'americanfootballncaaf' then 'ncaaf'
      when 'footballncaaf' then 'ncaaf'
      when 'collegefootball' then 'ncaaf'
      else v_new_sport_token
    end;
    v_new_home := pg_catalog.lower(pg_catalog.btrim(coalesce(
      nullif(v_new_pick->>'homeTeam', ''),
      nullif(v_new_pick->>'home_team', ''),
      ''
    )));
    v_new_away := pg_catalog.lower(pg_catalog.btrim(coalesce(
      nullif(v_new_pick->>'awayTeam', ''),
      nullif(v_new_pick->>'away_team', ''),
      ''
    )));
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
      v_existing_is_prop :=
        pg_catalog.lower(pg_catalog.btrim(coalesce(v_existing_pick->>'type', ''))) = 'prop'
        or pg_catalog.lower(pg_catalog.btrim(coalesce(v_existing_pick->>'pickType', ''))) = 'prop';
      v_existing_soccer_id := nullif(
        pg_catalog.btrim(v_existing_pick->>'soccer_match_id'),
        ''
      );
      v_existing_game_id := coalesce(
        nullif(pg_catalog.btrim(v_existing_pick->>'bdl_game_id'), ''),
        nullif(pg_catalog.btrim(v_existing_pick->>'game_id'), ''),
        nullif(pg_catalog.btrim(v_existing_pick->>'bdlGameId'), ''),
        nullif(pg_catalog.btrim(v_existing_pick->>'gameId'), '')
      );
      v_existing_sport_token := pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.btrim(coalesce(
          nullif(v_existing_pick->>'league', ''),
          nullif(v_existing_pick->>'sport', ''),
          nullif(v_existing_pick->>'sport_key', ''),
          ''
        ))),
        '[^a-z0-9]+',
        '',
        'g'
      );
      v_existing_sport := case v_existing_sport_token
        when 'baseballmlb' then 'mlb'
        when 'basketballnba' then 'nba'
        when 'basketballwnba' then 'wnba'
        when 'basketballncaab' then 'ncaab'
        when 'icehockeynhl' then 'nhl'
        when 'americanfootballnfl' then 'nfl'
        when 'footballnfl' then 'nfl'
        when 'americanfootballncaaf' then 'ncaaf'
        when 'footballncaaf' then 'ncaaf'
        when 'collegefootball' then 'ncaaf'
        else v_existing_sport_token
      end;

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
          v_clash := v_existing_game_id = v_new_game_id;
        else
          v_existing_home := pg_catalog.lower(pg_catalog.btrim(coalesce(
            nullif(v_existing_pick->>'homeTeam', ''),
            nullif(v_existing_pick->>'home_team', ''),
            ''
          )));
          v_existing_away := pg_catalog.lower(pg_catalog.btrim(coalesce(
            nullif(v_existing_pick->>'awayTeam', ''),
            nullif(v_existing_pick->>'away_team', ''),
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
  'Atomically appends first-writer-wins picks using total prop booleans and canonical sport/game identity.';
