-- Replace a completed private draft batch atomically. Failed inserts must not
-- erase the founder's existing sheet. Only the service role may invoke this.
CREATE OR REPLACE FUNCTION public.replace_engagement_sheet(p_date date, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE inserted_count integer;
BEGIN
  IF p_date IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'A dated batch of 1 to 10 drafts is required';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r
    WHERE coalesce(r->>'tweet_id', '') !~ '^[0-9]+$'
       OR length(coalesce(r->>'draft', '')) NOT BETWEEN 1 AND 240
       OR length(coalesce(r->>'author', '')) = 0)
     OR (SELECT count(DISTINCT r->>'tweet_id') FROM jsonb_array_elements(p_rows) r) <> jsonb_array_length(p_rows) THEN
    RAISE EXCEPTION 'Draft identities or content are invalid';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('engagement-sheet:' || p_date::text));
  DELETE FROM public.engagement_sheet WHERE sheet_date = p_date;
  INSERT INTO public.engagement_sheet
    (sheet_date, author, author_name, tweet_id, tweet_text, eng, matched_pick, draft, url)
  SELECT p_date, r.author, r.author_name, r.tweet_id, r.tweet_text, r.eng,
    r.matched_pick, r.draft, r.url
  FROM jsonb_to_recordset(p_rows) AS r(author text, author_name text, tweet_id text,
    tweet_text text, eng integer, matched_pick text, draft text, url text);
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_engagement_sheet(date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_engagement_sheet(date, jsonb) TO service_role;
