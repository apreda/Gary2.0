-- Read-only alert input: inspect every retained failure, not just latest success.
-- No secrets, headers, user identities or X writes. pg_net retention is ~6h.
WITH job AS (
  SELECT j.jobid, j.active, r.start_time, r.status
  FROM cron.job j LEFT JOIN LATERAL (
    SELECT start_time, status FROM cron.job_run_details
    WHERE jobid = j.jobid ORDER BY runid DESC LIMIT 1
  ) r ON true WHERE j.jobname = 'social-auto-post-hourly'
), responses AS MATERIALIZED (
  SELECT id, created, status_code, content::jsonb AS body
  FROM net._http_response
  WHERE created >= now() - interval '6 hours'
    AND content ~ '"service"\s*:\s*"social-auto-post"'
), scheduled AS (
  SELECT * FROM responses WHERE body->>'dry_run' = 'false' AND body->>'run_kind' = 'scheduled'
), incidents AS (
  SELECT id, created, status_code, body->'health' AS health,
    body->'results' AS results, body->'error' AS error,
    body->'source_errors' AS source_errors, body->'publication_recovery' AS publication_recovery
  FROM scheduled WHERE status_code >= 400 OR body->'health'->>'status' IS DISTINCT FROM 'ok'
)
SELECT jsonb_build_object(
  'checked_at', now(),
  'cron', (SELECT to_jsonb(job) FROM job),
  'cron_missing_or_stale', NOT EXISTS (SELECT 1 FROM job WHERE active AND start_time >= now() - interval '20 minutes' AND status IN ('succeeded','running')),
  'response_missing', NOT EXISTS (SELECT 1 FROM scheduled WHERE created >= now() - interval '20 minutes')
    OR EXISTS (SELECT 1 FROM job WHERE start_time < now() - interval '3 minutes'
      AND NOT EXISTS (SELECT 1 FROM scheduled WHERE created >= job.start_time - interval '1 second')),
  'latest_response', (SELECT jsonb_build_object('id',id,'created',created,'status_code',status_code,'health',body->'health') FROM scheduled ORDER BY created DESC LIMIT 1),
  'incidents', coalesce((SELECT jsonb_agg(to_jsonb(incidents) ORDER BY created) FROM incidents),'[]'::jsonb),
  'unresolved_publications', coalesce((SELECT jsonb_agg(jsonb_build_object('publication_key',publication_key,'state',state,'updated_at',updated_at,'pick',log_payload->>'pick_text'))
    FROM public.social_publication_intents
    WHERE state NOT IN ('completed','expired') AND updated_at < now() - interval '5 minutes'),'[]'::jsonb)
) AS snapshot;
