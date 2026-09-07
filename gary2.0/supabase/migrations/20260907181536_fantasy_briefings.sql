-- One complete, dated Fantasy decision board. A single row prevents a refresh
-- from briefly mixing old and new calls for the same player.
CREATE TABLE public.fantasy_briefings (
  date date NOT NULL,
  league text NOT NULL CHECK (league IN ('MLB', 'NFL')),
  generated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  fetched_as_of timestamptz NOT NULL,
  input_fingerprint text NOT NULL CHECK (input_fingerprint ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, league),
  CHECK (expires_at > generated_at),
  CHECK (generated_at >= fetched_as_of)
);

ALTER TABLE public.fantasy_briefings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fantasy_briefings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fantasy_briefings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.fantasy_briefings TO service_role;
CREATE POLICY "fantasy briefings public read" ON public.fantasy_briefings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "fantasy briefings service write" ON public.fantasy_briefings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Return false when an older, slower run tries to overwrite a newer snapshot.
-- No delete is involved, and a malformed write cannot erase the previous board.
CREATE FUNCTION public.publish_fantasy_briefing(
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
       OR length(coalesce(d->>'player_id', '')) = 0
       OR length(coalesce(d->>'player_name', '')) = 0
  ) OR (SELECT count(DISTINCT d->>'player_id') FROM jsonb_array_elements(p_payload->'decisions') d)
       <> jsonb_array_length(p_payload->'decisions') THEN
    RAISE EXCEPTION 'Fantasy decisions require one named identity per player';
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
  RETURN written = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_fantasy_briefing(jsonb, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_fantasy_briefing(jsonb, timestamptz, text) TO service_role;
