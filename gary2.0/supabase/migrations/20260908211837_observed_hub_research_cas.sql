-- Body-based compare-and-swap for reviewed current Hub research. Large legacy
-- metadata cannot safely fit in REST URL predicates. This function adds no
-- privileges: only the existing service role may invoke it, as itself.
CREATE OR REPLACE FUNCTION public.replace_current_hub_research(
  p_id bigint,
  p_date date,
  p_league text,
  p_category text,
  p_generated_by text,
  p_game_id text,
  p_team_id text,
  p_player_id text,
  p_expected_detail text,
  p_expected_meta jsonb,
  p_patch jsonb
) RETURNS SETOF public.insight_connections
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_id IS NULL OR p_id <= 0 OR p_date IS NULL
    OR p_league IS DISTINCT FROM 'MLB'
    OR p_generated_by IS DISTINCT FROM 'insights-cli'
    OR p_category IS NULL OR p_category NOT IN (
      'heat_check','cooling_off','starter_team_record','starter_form',
      'head_to_head','rest_fatigue','first_inning','streaking','regression_watch','owned'
    ) THEN
    RAISE EXCEPTION 'Invalid current research identity' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
    OR pg_catalog.jsonb_typeof(p_patch->'detail') IS DISTINCT FROM 'string'
    OR pg_catalog.length(pg_catalog.btrim(p_patch->>'detail')) = 0
    OR pg_catalog.jsonb_typeof(p_patch->'meta') IS DISTINCT FROM 'object'
    OR p_patch->'meta'->'read' IS DISTINCT FROM p_patch->'detail'
    OR p_patch->'meta'->'evidence' IS DISTINCT FROM p_patch->'detail'
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_patch) AS fields(name)
      WHERE name NOT IN ('detail','headline','value','tone','spark','meta')) THEN
    RAISE EXCEPTION 'Invalid research replacement fields' USING ERRCODE = '22023';
  END IF;
  IF (p_patch ? 'headline' AND (pg_catalog.jsonb_typeof(p_patch->'headline') IS DISTINCT FROM 'string'
        OR pg_catalog.length(pg_catalog.btrim(p_patch->>'headline')) = 0))
    OR (p_patch ? 'value' AND pg_catalog.jsonb_typeof(p_patch->'value') NOT IN ('string','null'))
    OR (p_patch ? 'tone' AND (pg_catalog.jsonb_typeof(p_patch->'tone') IS DISTINCT FROM 'string'
        OR p_patch->>'tone' NOT IN ('good','bad','neutral')))
    OR (p_patch ? 'spark' AND pg_catalog.jsonb_typeof(p_patch->'spark') NOT IN ('array','null')) THEN
    RAISE EXCEPTION 'Invalid research display value' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.jsonb_typeof(p_patch->'spark') = 'array' AND EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_patch->'spark') AS entries(value)
    WHERE pg_catalog.jsonb_typeof(value) IS DISTINCT FROM 'number'
  ) THEN
    RAISE EXCEPTION 'Research spark values must be numeric' USING ERRCODE = '22023';
  END IF;

  -- One atomic UPDATE rechecks the complete source snapshot after waiting for
  -- a concurrent writer. Stale, graded, other-date or changed-identity rows
  -- return no rows. Neither the original identity nor historical result moves.
  RETURN QUERY
    UPDATE public.insight_connections AS c SET
      detail = p_patch->>'detail',
      headline = CASE WHEN p_patch ? 'headline' THEN p_patch->>'headline' ELSE c.headline END,
      value = CASE WHEN p_patch ? 'value' THEN p_patch->>'value' ELSE c.value END,
      tone = CASE WHEN p_patch ? 'tone' THEN p_patch->>'tone' ELSE c.tone END,
      spark = CASE WHEN p_patch ? 'spark' THEN NULLIF(p_patch->'spark','null'::jsonb) ELSE c.spark END,
      meta = p_patch->'meta'
    WHERE c.id = p_id
      AND p_date = (pg_catalog.statement_timestamp() AT TIME ZONE 'America/New_York')::date
      AND c.date = p_date AND c.league = p_league AND c.category = p_category
      AND c.generated_by = p_generated_by AND c.result IS NULL AND c.graded_at IS NULL
      AND c.game_id IS NOT DISTINCT FROM p_game_id
      AND c.team_id IS NOT DISTINCT FROM p_team_id
      AND c.player_id IS NOT DISTINCT FROM p_player_id
      AND c.detail IS NOT DISTINCT FROM p_expected_detail
      AND c.meta IS NOT DISTINCT FROM p_expected_meta
    RETURNING c.*;
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_current_hub_research(bigint,date,text,text,text,text,text,text,text,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_current_hub_research(bigint,date,text,text,text,text,text,text,text,jsonb,jsonb)
  TO service_role;
COMMENT ON FUNCTION public.replace_current_hub_research(bigint,date,text,text,text,text,text,text,text,jsonb,jsonb)
  IS 'Service-only exact-snapshot replacement of current ungraded MLB observational research; stale snapshots return no rows.';
NOTIFY pgrst, 'reload schema';
