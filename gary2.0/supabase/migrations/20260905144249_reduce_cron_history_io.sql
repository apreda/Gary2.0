-- Keep a month of operational job history. Product/user/pick records are not
-- part of this retention policy. The primary-key window bounds every run's
-- reads even though Supabase owns this extension table and its indexes.
-- 10,000 rows/day comfortably exceeds this project's ~2,700 log rows/day.
select cron.schedule(
  'cleanup-completed-cron-history',
  '37 3 * * *',
  $cleanup$
    with oldest as materialized (
      select runid, status, end_time
      from cron.job_run_details
      order by runid
      limit 10000
    ), expired as (
      select runid from oldest
      where status in ('succeeded', 'failed')
        and end_time < now() - interval '30 days'
    )
    delete from cron.job_run_details d
    using expired e where d.runid = e.runid;
  $cleanup$
);
