-- Read-only aggregate snapshot. No keys, emails, user agents, or identities.
-- Cron success only proves HTTP enqueueing; retained pg_net responses below
-- prove the poster's actual outcome. pg_net normally retains about six hours.
WITH clock AS (
  SELECT now() AS checked_at, (now() AT TIME ZONE 'America/New_York')::date AS et_day
), posts AS (
  SELECT p.*, CASE WHEN p.posted_at <= c.checked_at - interval '6 days'
    AND p.metrics_updated_at >= p.posted_at + interval '5 days'
    THEN 'mature_observed' ELSE 'immature_or_unobserved' END AS cohort
  FROM public.social_post_log p CROSS JOIN clock c
  WHERE p.post_date >= (c.et_day - 14)::text AND p.post_date < c.et_day::text
), cohorts AS (
  SELECT cohort, thread_format, count(*) AS posts,
    count(impressions) AS measured_impressions, sum(impressions) AS impressions,
    round(avg(impressions)::numeric, 1) AS mean_impressions,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY impressions) AS median_impressions,
    count(likes) AS measured_likes, sum(likes) AS likes,
    count(replies) AS measured_replies, sum(replies) AS replies,
    count(retweets) AS measured_reposts, sum(retweets) AS reposts,
    count(bookmarks) AS measured_bookmarks, sum(bookmarks) AS bookmarks,
    count(profile_clicks) AS measured_profile_clicks, sum(profile_clicks) AS profile_clicks,
    count(link_clicks) AS measured_link_clicks, sum(link_clicks) AS link_clicks,
    count(*) FILTER (WHERE thread_format IN ('standard', 'top_pick', 'launch_pin')
      AND (reasoning_tweet_id IS NOT NULL OR cta_tweet_id IS NOT NULL)) AS threads_with_own_reply,
    count(*) FILTER (WHERE thread_format = 'verdict' AND cta_tweet_id IS NOT NULL) AS threads_with_quoted_original,
    min(posted_at) AS first_post, max(posted_at) AS last_post,
    min(metrics_updated_at) AS oldest_metric_snapshot, max(metrics_updated_at) AS newest_metric_snapshot,
    round(min(extract(epoch FROM (metrics_updated_at - posted_at)) / 86400)::numeric, 2) AS min_observation_days,
    round(max(extract(epoch FROM (metrics_updated_at - posted_at)) / 86400)::numeric, 2) AS max_observation_days
  FROM posts GROUP BY cohort, thread_format
), daily AS (
  SELECT d.day::date AS date, count(p.id) AS logged_posts,
    count(p.id) FILTER (WHERE thread_format IN ('standard', 'top_pick')) AS pick_threads
  FROM clock c CROSS JOIN LATERAL generate_series(c.et_day - 14, c.et_day - 1, interval '1 day') d(day)
  LEFT JOIN posts p ON p.post_date = d.day::date::text GROUP BY d.day
), jobs AS (
  SELECT j.jobname, j.active, j.schedule, r.start_time AS last_started_at,
    r.end_time AS last_finished_at, r.status AS last_sql_status
  FROM cron.job j LEFT JOIN LATERAL (
    SELECT start_time, end_time, status FROM cron.job_run_details
    WHERE jobid = j.jobid ORDER BY start_time DESC LIMIT 1
  ) r ON true
  WHERE j.jobname IN ('social-auto-post-hourly', 'engagement-sheet-daily')
), response_candidates AS MATERIALIZED (
  SELECT created, status_code, content FROM net._http_response
  WHERE content ~ '"service"\s*:\s*"social-auto-post"'
    AND created >= now() - interval '6 hours'
), responses AS (
  SELECT created, status_code, content::jsonb AS body FROM response_candidates
), scheduled_responses AS (
  SELECT created, status_code, body->'health' AS health FROM responses
  WHERE body->>'dry_run' = 'false' AND body->>'run_kind' = 'scheduled'
), redirects AS (
  SELECT 'legacy_link_clicks' AS source_table, ct, count(*) AS raw_events,
    min(ts) AS first_event, max(ts) AS last_event
  FROM public.link_clicks CROSS JOIN clock c
  WHERE ts >= ((c.et_day - 14)::timestamp AT TIME ZONE 'America/New_York')
    AND ts < (c.et_day::timestamp AT TIME ZONE 'America/New_York')
    AND ct !~* 'test|audit|smoke|qa'
  GROUP BY ct
  UNION ALL
  SELECT 'web_link_clicks', ct, count(*), min(created_at), max(created_at)
  FROM public.web_link_clicks CROSS JOIN clock c
  WHERE created_at >= ((c.et_day - 14)::timestamp AT TIME ZONE 'America/New_York')
    AND created_at < (c.et_day::timestamp AT TIME ZONE 'America/New_York')
    AND coalesce(ct, '') !~* 'test|audit|smoke|qa'
  GROUP BY ct
), today_picks AS (
  SELECT pick->>'pick' AS pick, pick->>'commence_time' AS commence_time,
    EXISTS (SELECT 1 FROM public.social_post_log l WHERE l.post_date = c.et_day::text
      AND l.thread_format IN ('standard', 'top_pick') AND l.pick_text = pick->>'pick') AS logged
  FROM public.daily_picks d CROSS JOIN clock c CROSS JOIN LATERAL jsonb_array_elements(d.picks::jsonb) pick
  WHERE d.date::text = c.et_day::text
)
SELECT json_build_object(
  'checked_at', c.checked_at, 'et_date', c.et_day,
  'window', json_build_object('start_inclusive', c.et_day - 14, 'end_exclusive', c.et_day),
  'cohorts', coalesce((SELECT json_agg(x ORDER BY cohort, thread_format) FROM cohorts x), '[]'::json),
  'daily', coalesce((SELECT json_agg(x ORDER BY date) FROM daily x), '[]'::json),
  'jobs', coalesce((SELECT json_agg(x) FROM jobs x), '[]'::json),
  'latest_poster_response', (SELECT row_to_json(x) FROM (SELECT * FROM scheduled_responses ORDER BY created DESC LIMIT 1) x),
  'retained_poster_responses', (SELECT count(*) FROM scheduled_responses),
  'retained_degraded_responses', (SELECT count(*) FROM scheduled_responses WHERE status_code >= 400 OR health->>'status' <> 'ok'),
  'engagement', (SELECT json_build_object('draft_rows', count(*), 'latest_sheet_date', max(sheet_date)) FROM public.engagement_sheet),
  'reply_queue', coalesce((SELECT json_agg(x) FROM (SELECT status, count(*) AS rows FROM public.reply_queue GROUP BY status) x), '[]'::json),
  'redirects_separate_sources', coalesce((SELECT json_agg(x) FROM redirects x), '[]'::json),
  'waitlist_rows', (SELECT count(*) FROM public.launch_waitlist),
  'email_subscriptions', coalesce((SELECT json_agg(x) FROM (SELECT status, count(*) AS rows FROM public.web_email_subscriptions GROUP BY status) x), '[]'::json),
  'today_picks', coalesce((SELECT json_agg(x) FROM today_picks x), '[]'::json)
) AS snapshot FROM clock c;
