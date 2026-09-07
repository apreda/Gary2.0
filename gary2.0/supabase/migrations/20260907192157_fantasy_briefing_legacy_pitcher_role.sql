-- Installed Swift categorizes starter cards by meta.role=SP. Normalize only
-- that legacy display field; the nested decision and new briefing stay intact.
CREATE OR REPLACE FUNCTION public.publish_fantasy_briefing(
  p_payload jsonb,
  p_fetched_as_of timestamptz,
  p_input_fingerprint text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  written integer;
  briefing_date date;
  briefing_league text;
  generated timestamptz;
  expires timestamptz;
  legacy_category text;
  legacy_kind text;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR p_payload->>'schema_version' IS DISTINCT FROM '1'
     OR jsonb_typeof(p_payload->'decisions') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'coverage') IS DISTINCT FROM 'object'
     OR p_fetched_as_of IS NULL
     OR coalesce(p_input_fingerprint, '') !~ '^[a-f0-9]{64}$'
     OR p_payload->>'input_fingerprint' IS DISTINCT FROM p_input_fingerprint THEN
    RAISE EXCEPTION 'Invalid Fantasy briefing envelope';
  END IF;
  IF jsonb_array_length(p_payload->'decisions') > 24
     OR p_payload->'coverage'->>'complete' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Fantasy publication requires a complete, bounded decision board';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_payload->'decisions') d
    WHERE jsonb_typeof(d) IS DISTINCT FROM 'object'
       OR jsonb_typeof(d->'opportunities') IS DISTINCT FROM 'array'
       OR jsonb_typeof(d->'evidence') IS DISTINCT FROM 'array'
       OR coalesce(d->>'action', '') NOT IN ('CONSIDER_ADD', 'START', 'HOLD', 'WATCH', 'SIT')
       OR EXISTS (
         SELECT 1 FROM (VALUES ('player_id'), ('player_name'), ('headline'), ('why_now'), ('fit'), ('risk'), ('watch_for')) required(key)
         WHERE jsonb_typeof(d->required.key) IS DISTINCT FROM 'string'
            OR length(btrim(coalesce(d->>required.key, ''))) = 0
       )
  ) OR (SELECT count(DISTINCT d->>'player_id') FROM jsonb_array_elements(p_payload->'decisions') d)
       <> jsonb_array_length(p_payload->'decisions') THEN
    RAISE EXCEPTION 'Fantasy decisions require one named identity and complete call per player';
  END IF;

  briefing_date := (p_payload->>'date')::date;
  briefing_league := p_payload->>'league';
  generated := (p_payload->>'generated_at')::timestamptz;
  expires := (p_payload->>'expires_at')::timestamptz;
  IF briefing_date IS NULL OR briefing_league NOT IN ('MLB', 'NFL')
     OR generated IS NULL OR expires IS NULL
     OR generated < p_fetched_as_of OR expires <= generated
     OR (p_payload->>'fetched_as_of')::timestamptz IS DISTINCT FROM p_fetched_as_of THEN
    RAISE EXCEPTION 'Invalid Fantasy briefing identity or freshness';
  END IF;

  INSERT INTO public.fantasy_briefings AS prior
    (date, league, generated_at, expires_at, fetched_as_of, input_fingerprint, payload)
  VALUES
    (briefing_date, briefing_league, generated, expires, p_fetched_as_of, p_input_fingerprint, p_payload)
  ON CONFLICT (date, league) DO UPDATE SET
    generated_at = EXCLUDED.generated_at,
    expires_at = EXCLUDED.expires_at,
    fetched_as_of = EXCLUDED.fetched_as_of,
    input_fingerprint = EXCLUDED.input_fingerprint,
    payload = EXCLUDED.payload,
    updated_at = now()
  WHERE EXCLUDED.fetched_as_of > prior.fetched_as_of
     OR (EXCLUDED.fetched_as_of = prior.fetched_as_of AND EXCLUDED.generated_at > prior.generated_at);
  GET DIAGNOSTICS written = ROW_COUNT;
  IF written = 0 THEN RETURN false; END IF;

  -- The guarded upsert holds this partition's row lock until BOTH writes
  -- commit. A rejected older run never changes the installed app's rows.
  -- Injury return_watch, other leagues/dates and betting lanes are untouched.
  DELETE FROM public.insight_connections
  WHERE date = briefing_date AND league = briefing_league
    AND ((briefing_league = 'MLB' AND category IN ('fantasy_pickups', 'two_start_week', 'closer_watch', 'cut_list'))
      OR (briefing_league = 'NFL' AND category IN ('fantasy_usage', 'fantasy_trend', 'fantasy_matchup')));

  legacy_category := CASE briefing_league WHEN 'MLB' THEN 'fantasy_pickups' ELSE 'fantasy_usage' END;
  legacy_kind := CASE briefing_league WHEN 'MLB' THEN 'fantasy_pickup' ELSE 'fantasy_usage' END;
  INSERT INTO public.insight_connections
    (date, league, category, headline, detail, game, value, tone, relevance_score,
     player_id, team_id, game_id, generated_by, created_at, updated_at, meta)
  SELECT
    briefing_date, briefing_league, legacy_category, d->>'player_name',
    call_text || E'\n\n' || read_text,
    coalesce(nullif(d->'opportunities'->0->>'game_label', ''),
      CASE WHEN nullif(d->'opportunities'->0->>'opponent', '') IS NOT NULL
        THEN CASE WHEN d->'opportunities'->0->>'home' = 'true' THEN 'vs ' ELSE 'at ' END || (d->'opportunities'->0->>'opponent')
        ELSE '' END),
    action_label, 'neutral', 100 - ordinal,
    d->>'player_id', d->>'team_id', d->'opportunities'->0->>'game_id',
    'fantasy_briefing_v1', generated, generated,
    jsonb_build_object(
      'kind', legacy_kind, 'version', 1, 'source', 'fantasy_briefing_v1',
      'team', d->>'team', 'position', d->>'position',
      'role', CASE WHEN briefing_league = 'MLB' AND lower(d->>'role') = 'pitcher' THEN 'SP' ELSE d->>'role' END,
      'read', read_text, 'verdict', call_text,
      -- SwapMeta.evidence is String in the installed app; an array here would
      -- fail its entire Connection response. Keep structured evidence nested.
      'evidence', coalesce((SELECT string_agg(e->>'summary', E'\n' ORDER BY evidence_order)
        FROM jsonb_array_elements(d->'evidence') WITH ORDINALITY AS proof(e, evidence_order)
        WHERE nullif(e->>'summary', '') IS NOT NULL), ''),
      'as_of', p_payload->>'fetched_as_of', 'published_at', p_payload->>'generated_at',
      'expires_at', p_payload->>'expires_at', 'valid_until', d->>'valid_until',
      'decision_id', d->>'id', 'display_rank', ordinal, 'fantasy_decision', d
    )
  FROM jsonb_array_elements(p_payload->'decisions') WITH ORDINALITY AS decisions(d, ordinal)
  CROSS JOIN LATERAL (SELECT CASE d->>'action'
    WHEN 'CONSIDER_ADD' THEN 'CONSIDER ADD' WHEN 'START' THEN 'START' WHEN 'HOLD' THEN 'HOLD'
    WHEN 'WATCH' THEN 'WATCH' WHEN 'SIT' THEN 'SIT' END AS action_label) action
  CROSS JOIN LATERAL (SELECT action_label || ': ' || (d->>'headline') AS call_text,
    format(E'Why now: %s\n\nWho it fits: %s\n\nThe risk: %s\n\nWatch next: %s\n\nEvidence as of %s ET.%s',
      d->>'why_now', d->>'fit', d->>'risk', d->>'watch_for',
      to_char(p_fetched_as_of AT TIME ZONE 'America/New_York', 'Mon DD, HH12:MI AM'),
      CASE WHEN nullif(d->>'valid_until', '') IS NOT NULL
        THEN ' Next-game call closes at ' || to_char((d->>'valid_until')::timestamptz AT TIME ZONE 'America/New_York', 'Mon DD, HH12:MI AM') || ' ET.'
        ELSE '' END) AS read_text) prose;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_fantasy_briefing(jsonb, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_fantasy_briefing(jsonb, timestamptz, text) TO service_role;
