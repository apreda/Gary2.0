-- Refuse an argument when an exact source was observed after its analysis.
-- Only the primary row is locked; later secondary changes are also checked by
-- native selection and the scheduled current-context refresh.
BEGIN;

CREATE OR REPLACE FUNCTION public.publish_hub_judgment(
  p_row_id bigint,
  p_date date,
  p_league text,
  p_category text,
  p_game_id text,
  p_player_id text,
  p_team_id text,
  p_judgment jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_league text := upper(btrim(p_league));
  v_source_key text;
  v_status text;
  v_as_of timestamptz;
  v_valid_until timestamptz;
  v_previous_as_of timestamptz;
  v_now timestamptz;
  v_meta jsonb;
  v_previous jsonb;
  v_source_meta jsonb;
  v_source_observed timestamptz;
  v_field text;
  v_limit integer;
  v_iso_pattern constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$';
BEGIN
  IF p_row_id IS NULL OR p_row_id <= 0 OR p_date IS NULL
     OR v_league IS NULL OR v_league NOT IN ('MLB', 'NFL', 'NCAAF', 'NBA')
     OR p_category IS NULL OR btrim(p_category) = ''
     OR p_game_id IS NULL OR btrim(p_game_id) = ''
     OR (p_player_id IS NOT NULL AND btrim(p_player_id) = '')
     OR (p_team_id IS NOT NULL AND btrim(p_team_id) = '') THEN
    RAISE EXCEPTION 'Invalid Hub judgment row identity' USING ERRCODE = '22023';
  END IF;

  v_source_key := p_category || '|' || p_game_id || '|' || coalesce(p_player_id, '') || '|' || coalesce(p_team_id, '');
  IF jsonb_typeof(p_judgment) IS DISTINCT FROM 'object'
     OR p_judgment->'schema_version' IS DISTINCT FROM '1'::jsonb
     OR jsonb_typeof(p_judgment->'date') IS DISTINCT FROM 'string'
     OR p_judgment->>'date' IS DISTINCT FROM p_date::text
     OR jsonb_typeof(p_judgment->'league') IS DISTINCT FROM 'string'
     OR upper(p_judgment->>'league') IS DISTINCT FROM v_league
     OR jsonb_typeof(p_judgment->'game_id') IS DISTINCT FROM 'string'
     OR p_judgment->>'game_id' IS DISTINCT FROM p_game_id
     OR jsonb_typeof(p_judgment->'primary_source_key') IS DISTINCT FROM 'string'
     OR p_judgment->>'primary_source_key' IS DISTINCT FROM v_source_key
     OR jsonb_typeof(p_judgment->'status') IS DISTINCT FROM 'string'
     OR (p_judgment->>'status') NOT IN ('ready', 'context_changed', 'context_unavailable', 'superseded')
     OR jsonb_typeof(p_judgment->'input_fingerprint') IS DISTINCT FROM 'string'
     OR (p_judgment->>'input_fingerprint') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid Hub judgment envelope' USING ERRCODE = '22023';
  END IF;
  v_status := p_judgment->>'status';

  FOREACH v_field IN ARRAY ARRAY['as_of', 'valid_until'] LOOP
    IF jsonb_typeof(p_judgment->v_field) IS DISTINCT FROM 'string'
       OR (p_judgment->>v_field) !~ v_iso_pattern THEN
      RAISE EXCEPTION 'Invalid Hub judgment %', v_field USING ERRCODE = '22023';
    END IF;
  END LOOP;
  BEGIN
    v_as_of := (p_judgment->>'as_of')::timestamptz;
    v_valid_until := (p_judgment->>'valid_until')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Invalid Hub judgment timestamps' USING ERRCODE = '22023';
  END;
  IF NOT isfinite(v_as_of) OR NOT isfinite(v_valid_until)
     OR (v_status = 'ready' AND v_valid_until <= v_as_of)
     OR (v_status <> 'ready' AND v_valid_until > v_as_of) THEN
    RAISE EXCEPTION 'Invalid Hub judgment evidence window' USING ERRCODE = '22023';
  END IF;

  -- These checks protect the native envelope at the database boundary. The
  -- writer separately validates the actual facts, citations and interpretation.
  FOR v_field, v_limit IN
    SELECT * FROM (VALUES ('take', 150), ('explanation', 650), ('full_case', 4000),
      ('counterargument', 700), ('watch_for', 450)) AS fields(name, max_length)
  LOOP
    IF jsonb_typeof(p_judgment->v_field) IS DISTINCT FROM 'string'
       OR btrim(p_judgment->>v_field) = '' OR length(p_judgment->>v_field) > v_limit THEN
      RAISE EXCEPTION 'Invalid Hub judgment %', v_field USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR v_field, v_limit IN
    SELECT * FROM (VALUES ('critical_condition', 200), ('what_changed', 500),
      ('writer_version', 200)) AS fields(name, max_length)
  LOOP
    IF p_judgment->v_field IS NOT NULL AND p_judgment->v_field <> 'null'::jsonb
       AND (jsonb_typeof(p_judgment->v_field) IS DISTINCT FROM 'string'
         OR btrim(p_judgment->>v_field) = '' OR length(p_judgment->>v_field) > v_limit) THEN
      RAISE EXCEPTION 'Invalid Hub judgment %', v_field USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF jsonb_typeof(p_judgment->'horizon') IS DISTINCT FROM 'string'
     OR (p_judgment->>'horizon') NOT IN ('pregame', 'next_game')
     OR jsonb_typeof(p_judgment->'prominence') IS DISTINCT FROM 'string'
     OR (p_judgment->>'prominence') NOT IN ('standard', 'major') THEN
    RAISE EXCEPTION 'Invalid Hub judgment reading context' USING ERRCODE = '22023';
  END IF;
  FOREACH v_field IN ARRAY ARRAY['evidence', 'supporting_evidence_ids', 'counter_evidence_ids',
      'supersedes_source_keys', 'related_subject_ids', 'evidence_state'] LOOP
    IF jsonb_typeof(p_judgment->v_field) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid Hub judgment %', v_field USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF jsonb_array_length(p_judgment->'evidence') < 2
     OR jsonb_array_length(p_judgment->'supporting_evidence_ids') < 2
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_judgment->'evidence') AS evidence(item)
       WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
         OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string' OR btrim(item->>'id') = '')
     OR (SELECT count(*) <> count(DISTINCT item->>'id')
       FROM jsonb_array_elements(p_judgment->'evidence') AS evidence(item)) THEN
    RAISE EXCEPTION 'Invalid Hub judgment evidence' USING ERRCODE = '22023';
  END IF;
  FOREACH v_field IN ARRAY ARRAY['supporting_evidence_ids', 'counter_evidence_ids',
      'supersedes_source_keys', 'related_subject_ids'] LOOP
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_judgment->v_field) AS entries(item)
        WHERE jsonb_typeof(item) IS DISTINCT FROM 'string' OR btrim(item #>> '{}') = '') THEN
      RAISE EXCEPTION 'Invalid Hub judgment %', v_field USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH v_field IN ARRAY ARRAY['supporting_evidence_ids', 'counter_evidence_ids'] LOOP
    IF (SELECT count(*) <> count(DISTINCT item)
          FROM jsonb_array_elements(p_judgment->v_field) AS refs(item))
       OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_judgment->v_field) AS refs(id)
         WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_judgment->'evidence') AS evidence(item)
           WHERE item->>'id' = refs.id)) THEN
      RAISE EXCEPTION 'Invalid Hub judgment evidence references' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- The full identity is rechecked by SELECT FOR UPDATE after a concurrent
  -- writer commits. An exact-ID miss never falls back to player/team names.
  SELECT c.meta INTO v_meta FROM public.insight_connections AS c
  WHERE c.id = p_row_id AND c.date = p_date AND c.league = v_league
    AND c.category = p_category AND c.game_id = p_game_id
    AND c.player_id IS NOT DISTINCT FROM p_player_id
    AND c.team_id IS NOT DISTINCT FROM p_team_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_meta IS NOT NULL AND jsonb_typeof(v_meta) <> 'object' THEN RETURN false; END IF;

  -- now() is a transaction-start clock. A blocked writer may cross first
  -- pitch while acquiring this lock, so freshness uses the wall clock here.
  v_now := clock_timestamp();
  IF v_as_of > v_now + interval '5 minutes' THEN
    RAISE EXCEPTION 'Hub judgment evidence is in the future' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'ready' AND v_valid_until <= v_now THEN RETURN false; END IF;

  -- Recheck after acquiring the primary lock and before identical-JSON success.
  -- created_at/updated_at describe persistence, which may legitimately occur
  -- after this same pass analyzed the collector results. They are not evidence
  -- clocks. Missing capped secondary rows are allowed; a present newer source
  -- in this exact partition is enough to reject stale ready advice.
  IF v_status = 'ready' THEN
    FOR v_source_meta IN
      SELECT c.meta FROM public.insight_connections AS c
      WHERE c.date = p_date AND c.league = v_league AND c.game_id = p_game_id
        AND (c.id = p_row_id OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(p_judgment->'evidence') AS evidence(item)
          WHERE item->>'source_key' = c.category || '|' || c.game_id || '|' || coalesce(c.player_id, '') || '|' || coalesce(c.team_id, '')
            AND (p_judgment->'supporting_evidence_ids' ? (item->>'id')
              OR p_judgment->'counter_evidence_ids' ? (item->>'id'))))
    LOOP
      FOREACH v_field IN ARRAY ARRAY['computed_as_of', 'source_collected_at'] LOOP
        IF v_source_meta->v_field IS NULL OR v_source_meta->v_field = 'null'::jsonb THEN CONTINUE; END IF;
        IF jsonb_typeof(v_source_meta->v_field) IS DISTINCT FROM 'string'
           OR (v_source_meta->>v_field) !~ v_iso_pattern THEN RETURN false; END IF;
        BEGIN
          v_source_observed := (v_source_meta->>v_field)::timestamptz;
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
          RETURN false;
        END;
        IF NOT isfinite(v_source_observed) OR v_source_observed > v_as_of THEN RETURN false; END IF;
      END LOOP;
    END LOOP;
  END IF;

  v_previous := v_meta->'judgment';
  IF v_previous IS NOT NULL AND v_previous <> 'null'::jsonb THEN
    IF v_previous = p_judgment THEN RETURN true; END IF;
    -- Unknown existing chronology is not authorization to overwrite it.
    IF jsonb_typeof(v_previous) <> 'object'
       OR jsonb_typeof(v_previous->'as_of') IS DISTINCT FROM 'string'
       OR (v_previous->>'as_of') !~ v_iso_pattern THEN RETURN false; END IF;
    BEGIN
      v_previous_as_of := (v_previous->>'as_of')::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RETURN false;
    END;
    IF NOT isfinite(v_previous_as_of) OR v_as_of <= v_previous_as_of THEN RETURN false; END IF;
  ELSIF v_status <> 'ready' THEN
    -- An invalidation retires an existing opinion; it cannot create one.
    RETURN false;
  END IF;

  UPDATE public.insight_connections AS c
  SET meta = jsonb_set(coalesce(v_meta, '{}'::jsonb), '{judgment}', p_judgment, true)
  WHERE c.id = p_row_id;
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.publish_hub_judgment(bigint, date, text, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_hub_judgment(bigint, date, text, text, text, text, text, jsonb)
  TO service_role;
COMMENT ON FUNCTION public.publish_hub_judgment(bigint, date, text, text, text, text, text, jsonb) IS
  'Service-only atomic meta.judgment publication; exact source identity, monotonic evidence time, current ready windows, original source observation guards, preserved source content.';
NOTIFY pgrst, 'reload schema';
COMMIT;
