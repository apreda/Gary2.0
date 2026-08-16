-- Serialize every production prop_picks JSON update inside Postgres. The
-- runners are separate processes, so a JavaScript read/merge/upsert can lose
-- an entire sibling game's props when clustered kickoffs finish together.
--
-- Normal writes are first-writer-wins by the prop's natural identity:
-- sport + exact game + player + prop + bet + line + TD category. A forced
-- rerun may replace only the exact provider game ids present in its own new
-- batch. MLB retains its two owned lanes (MLB and MLB HR); an NFL regular-only
-- replacement retains already-published categorized TD picks.

create unique index if not exists prop_picks_date_unique
  on public.prop_picks (date);

create or replace function public.upsert_prop_picks_atomic(
  p_date text,
  p_sport text,
  p_new_picks jsonb,
  p_replace_game_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_sport text;
  v_existing jsonb;
  v_result jsonb;
  v_new_pick jsonb;
  v_existing_pick jsonb;
  v_replace_value jsonb;
  v_row_found boolean := false;
  v_clash boolean;
  v_keep_nfl_td boolean;

  v_new_sport text;
  v_new_game_id text;
  v_new_matchup text;
  v_new_player text;
  v_new_prop text;
  v_new_bet text;
  v_new_line text;
  v_new_line_raw text;
  v_new_td_category text;

  v_existing_sport text;
  v_existing_game_id text;
  v_existing_matchup text;
  v_existing_player text;
  v_existing_prop text;
  v_existing_bet text;
  v_existing_line text;
  v_existing_line_raw text;
  v_existing_td_category text;

  v_incoming_game_ids jsonb := '[]'::jsonb;
  v_replace_ids jsonb := '[]'::jsonb;
  v_added_game_ids jsonb := '[]'::jsonb;
  v_skipped_game_ids jsonb := '[]'::jsonb;
  v_replaced_game_ids jsonb := '[]'::jsonb;
  v_added integer := 0;
  v_skipped integer := 0;
  v_replaced integer := 0;
begin
  if p_date is null or pg_catalog.btrim(p_date) = '' then
    raise exception 'p_date is required';
  end if;

  v_owner_sport := pg_catalog.upper(pg_catalog.btrim(coalesce(p_sport, '')));
  if v_owner_sport = '' then
    raise exception 'p_sport is required';
  end if;

  if p_new_picks is null or jsonb_typeof(p_new_picks) <> 'array' then
    raise exception 'p_new_picks must be a JSON array';
  end if;
  if jsonb_array_length(p_new_picks) = 0 then
    raise exception 'p_new_picks must not be empty';
  end if;

  p_replace_game_ids := coalesce(p_replace_game_ids, '[]'::jsonb);
  if jsonb_typeof(p_replace_game_ids) <> 'array' then
    raise exception 'p_replace_game_ids must be a JSON array';
  end if;

  -- Validate the complete batch before taking ownership of or deleting any
  -- existing game. Football is never allowed to fall back to matchup text.
  for v_new_pick in
    select value from jsonb_array_elements(p_new_picks)
  loop
    if jsonb_typeof(v_new_pick) <> 'object' then
      raise exception 'every prop pick must be a JSON object';
    end if;

    v_new_sport := pg_catalog.upper(pg_catalog.btrim(coalesce(v_new_pick->>'sport', '')));
    if not (
      v_new_sport = v_owner_sport
      or (v_owner_sport = 'MLB' and v_new_sport = 'MLB HR')
    ) then
      raise exception 'incoming sport % is outside the % owned lane', v_new_sport, v_owner_sport;
    end if;

    v_new_game_id := coalesce(
      nullif(pg_catalog.btrim(v_new_pick->>'game_id'), ''),
      nullif(pg_catalog.btrim(v_new_pick->>'bdl_game_id'), '')
    );
    v_new_matchup := pg_catalog.lower(pg_catalog.btrim(coalesce(v_new_pick->>'matchup', '')));
    if v_owner_sport in ('NFL', 'NCAAF') and v_new_game_id is null then
      raise exception 'every % prop requires game_id or bdl_game_id', v_owner_sport;
    end if;
    if v_new_game_id is null and v_new_matchup = '' then
      raise exception 'every prop requires an exact game id or legacy matchup identity';
    end if;

    v_new_player := pg_catalog.lower(pg_catalog.btrim(coalesce(v_new_pick->>'player', '')));
    v_new_prop := pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(
      coalesce(nullif(v_new_pick->>'prop', ''), nullif(v_new_pick->>'prop_type', ''), ''),
      '[[:space:]]+[+-]?[0-9]+([.][0-9]+)?[[:space:]]*$',
      ''
    )));
    v_new_bet := pg_catalog.lower(pg_catalog.btrim(coalesce(
      nullif(v_new_pick->>'bet', ''),
      nullif(v_new_pick->>'direction', ''),
      ''
    )));
    if v_new_bet = 'yes' then v_new_bet := 'over'; end if;
    v_new_line_raw := pg_catalog.btrim(coalesce(v_new_pick->>'line', ''));
    if v_new_line_raw ~ '^[+-]?[0-9]+([.][0-9]+)?$' then
      v_new_line := pg_catalog.trim_scale(v_new_line_raw::numeric)::text;
    else
      v_new_line := pg_catalog.lower(v_new_line_raw);
    end if;

    if v_new_player = '' or v_new_prop = '' or v_new_bet = '' or v_new_line = '' then
      raise exception 'every prop requires player, prop, bet, and line';
    end if;

    if v_new_game_id is not null
      and not v_incoming_game_ids @> pg_catalog.jsonb_build_array(v_new_game_id)
    then
      v_incoming_game_ids := v_incoming_game_ids || pg_catalog.jsonb_build_array(v_new_game_id);
    end if;
  end loop;

  for v_replace_value in
    select value from jsonb_array_elements(p_replace_game_ids)
  loop
    if jsonb_typeof(v_replace_value) not in ('string', 'number') then
      raise exception 'every replacement game id must be a string or number';
    end if;
    v_new_game_id := nullif(pg_catalog.btrim(v_replace_value #>> '{}'), '');
    if v_new_game_id is null
      or not v_incoming_game_ids @> pg_catalog.jsonb_build_array(v_new_game_id)
    then
      raise exception 'replacement game id % is not owned by the incoming batch', coalesce(v_new_game_id, '<empty>');
    end if;
    if not v_replace_ids @> pg_catalog.jsonb_build_array(v_new_game_id) then
      v_replace_ids := v_replace_ids || pg_catalog.jsonb_build_array(v_new_game_id);
    end if;
  end loop;

  -- FOR UPDATE protects an existing row. The transaction-scoped advisory lock
  -- also protects the no-row-yet case before a unique-date row exists.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('prop_picks|' || p_date, 0)
  );

  select coalesce(pp.picks, '[]'::jsonb)
    into v_existing
    from public.prop_picks as pp
   where pp.date = p_date
   for update;

  v_row_found := found;
  v_existing := coalesce(v_existing, '[]'::jsonb);
  if jsonb_typeof(v_existing) <> 'array' then
    raise exception 'prop_picks.picks must be a JSON array for date %', p_date;
  end if;

  -- A force run owns only the exact provider game ids in v_replace_ids. MLB
  -- owns MLB + MLB HR together. An NFL regular-only rerun keeps the prior TD
  -- categories, matching the existing product behavior.
  v_result := '[]'::jsonb;
  for v_existing_pick in
    select value from jsonb_array_elements(v_existing)
  loop
    v_existing_sport := pg_catalog.upper(pg_catalog.btrim(coalesce(v_existing_pick->>'sport', '')));
    v_existing_game_id := coalesce(
      nullif(pg_catalog.btrim(v_existing_pick->>'game_id'), ''),
      nullif(pg_catalog.btrim(v_existing_pick->>'bdl_game_id'), '')
    );

    if (
      v_existing_game_id is not null
      and v_replace_ids @> pg_catalog.jsonb_build_array(v_existing_game_id)
      and (
        v_existing_sport = v_owner_sport
        or (v_owner_sport = 'MLB' and v_existing_sport = 'MLB HR')
      )
    ) then
      v_existing_td_category := pg_catalog.lower(pg_catalog.btrim(coalesce(
        v_existing_pick->>'td_category',
        ''
      )));
      v_keep_nfl_td := v_owner_sport = 'NFL'
        and v_existing_td_category <> ''
        and not exists (
          select 1
            from jsonb_array_elements(p_new_picks) as incoming(value)
           where coalesce(
             nullif(pg_catalog.btrim(incoming.value->>'game_id'), ''),
             nullif(pg_catalog.btrim(incoming.value->>'bdl_game_id'), '')
           ) = v_existing_game_id
             and pg_catalog.btrim(coalesce(incoming.value->>'td_category', '')) <> ''
        );

      if v_keep_nfl_td then
        v_result := v_result || pg_catalog.jsonb_build_array(v_existing_pick);
      else
        v_replaced := v_replaced + 1;
        if not v_replaced_game_ids @> pg_catalog.jsonb_build_array(v_existing_game_id) then
          v_replaced_game_ids := v_replaced_game_ids || pg_catalog.jsonb_build_array(v_existing_game_id);
        end if;
      end if;
    else
      v_result := v_result || pg_catalog.jsonb_build_array(v_existing_pick);
    end if;
  end loop;

  -- Append only identities that are not already present after any explicitly
  -- owned replacement. This is the normal first-writer-wins path.
  for v_new_pick in
    select value from jsonb_array_elements(p_new_picks)
  loop
    v_new_sport := pg_catalog.upper(pg_catalog.btrim(coalesce(v_new_pick->>'sport', '')));
    v_new_game_id := coalesce(
      nullif(pg_catalog.btrim(v_new_pick->>'game_id'), ''),
      nullif(pg_catalog.btrim(v_new_pick->>'bdl_game_id'), '')
    );
    v_new_matchup := pg_catalog.lower(pg_catalog.btrim(coalesce(v_new_pick->>'matchup', '')));
    v_new_player := pg_catalog.lower(pg_catalog.btrim(coalesce(v_new_pick->>'player', '')));
    v_new_prop := pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(
      coalesce(nullif(v_new_pick->>'prop', ''), nullif(v_new_pick->>'prop_type', ''), ''),
      '[[:space:]]+[+-]?[0-9]+([.][0-9]+)?[[:space:]]*$',
      ''
    )));
    v_new_bet := pg_catalog.lower(pg_catalog.btrim(coalesce(
      nullif(v_new_pick->>'bet', ''),
      nullif(v_new_pick->>'direction', ''),
      ''
    )));
    if v_new_bet = 'yes' then v_new_bet := 'over'; end if;
    v_new_line_raw := pg_catalog.btrim(coalesce(v_new_pick->>'line', ''));
    if v_new_line_raw ~ '^[+-]?[0-9]+([.][0-9]+)?$' then
      v_new_line := pg_catalog.trim_scale(v_new_line_raw::numeric)::text;
    else
      v_new_line := pg_catalog.lower(v_new_line_raw);
    end if;
    v_new_td_category := pg_catalog.lower(pg_catalog.btrim(coalesce(
      v_new_pick->>'td_category',
      ''
    )));
    v_clash := false;

    for v_existing_pick in
      select value from jsonb_array_elements(v_result)
    loop
      v_existing_sport := pg_catalog.upper(pg_catalog.btrim(coalesce(v_existing_pick->>'sport', '')));
      v_existing_game_id := coalesce(
        nullif(pg_catalog.btrim(v_existing_pick->>'game_id'), ''),
        nullif(pg_catalog.btrim(v_existing_pick->>'bdl_game_id'), '')
      );
      v_existing_matchup := pg_catalog.lower(pg_catalog.btrim(coalesce(v_existing_pick->>'matchup', '')));
      v_existing_player := pg_catalog.lower(pg_catalog.btrim(coalesce(v_existing_pick->>'player', '')));
      v_existing_prop := pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(
        coalesce(nullif(v_existing_pick->>'prop', ''), nullif(v_existing_pick->>'prop_type', ''), ''),
        '[[:space:]]+[+-]?[0-9]+([.][0-9]+)?[[:space:]]*$',
        ''
      )));
      v_existing_bet := pg_catalog.lower(pg_catalog.btrim(coalesce(
        nullif(v_existing_pick->>'bet', ''),
        nullif(v_existing_pick->>'direction', ''),
        ''
      )));
      if v_existing_bet = 'yes' then v_existing_bet := 'over'; end if;
      v_existing_line_raw := pg_catalog.btrim(coalesce(v_existing_pick->>'line', ''));
      if v_existing_line_raw ~ '^[+-]?[0-9]+([.][0-9]+)?$' then
        v_existing_line := pg_catalog.trim_scale(v_existing_line_raw::numeric)::text;
      else
        v_existing_line := pg_catalog.lower(v_existing_line_raw);
      end if;
      v_existing_td_category := pg_catalog.lower(pg_catalog.btrim(coalesce(
        v_existing_pick->>'td_category',
        ''
      )));

      v_clash := v_existing_sport = v_new_sport
        and (
          (v_new_game_id is not null and v_existing_game_id = v_new_game_id)
          or (
            v_new_game_id is null
            and v_existing_game_id is null
            and v_new_matchup <> ''
            and v_existing_matchup = v_new_matchup
          )
        )
        and v_existing_player = v_new_player
        and v_existing_prop = v_new_prop
        and v_existing_bet = v_new_bet
        and v_existing_line = v_new_line
        and v_existing_td_category = v_new_td_category;

      exit when v_clash;
    end loop;

    if v_clash then
      v_skipped := v_skipped + 1;
      if v_new_game_id is not null
        and not v_skipped_game_ids @> pg_catalog.jsonb_build_array(v_new_game_id)
      then
        v_skipped_game_ids := v_skipped_game_ids || pg_catalog.jsonb_build_array(v_new_game_id);
      end if;
    else
      v_result := v_result || pg_catalog.jsonb_build_array(v_new_pick);
      v_added := v_added + 1;
      if v_new_game_id is not null
        and not v_added_game_ids @> pg_catalog.jsonb_build_array(v_new_game_id)
      then
        v_added_game_ids := v_added_game_ids || pg_catalog.jsonb_build_array(v_new_game_id);
      end if;
    end if;
  end loop;

  if v_row_found then
    update public.prop_picks
       set picks = v_result,
           updated_at = pg_catalog.now()
     where date = p_date;
  else
    insert into public.prop_picks (date, picks, created_at, updated_at)
    values (p_date, v_result, pg_catalog.now(), pg_catalog.now());
  end if;

  return pg_catalog.jsonb_build_object(
    'added', v_added,
    'skipped', v_skipped,
    'replaced', v_replaced,
    'total', jsonb_array_length(v_result),
    'game_ids', v_incoming_game_ids,
    'added_game_ids', v_added_game_ids,
    'skipped_game_ids', v_skipped_game_ids,
    'replaced_game_ids', v_replaced_game_ids,
    'mode', case
      when jsonb_array_length(v_replace_ids) > 0 then 'replace'
      when v_row_found then 'append'
      else 'insert'
    end
  );
end;
$$;

revoke execute on function public.upsert_prop_picks_atomic(text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_prop_picks_atomic(text, text, jsonb, jsonb)
  to service_role;

comment on function public.upsert_prop_picks_atomic(text, text, jsonb, jsonb) is
  'Atomically appends or exact-game replaces one date-keyed prop JSON ledger row.';
