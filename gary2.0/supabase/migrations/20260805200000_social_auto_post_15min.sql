-- POSTING CADENCE (founder, Aug 5 2026): "those cannot go out after the game starts... that's like making
-- a pick after the game starts."
--
-- social-auto-post now selects picks by LEAD TIME to first pitch (5-120 min) instead of by clock slot, and
-- posts every pick inside that window rather than one per run. On the old hourly cron each pick still gets
-- 1-2 shots at its window, so this reschedule is a ROBUSTNESS upgrade, not a correctness requirement: at
-- every 15 min a pick gets ~7 shots, so a transient Gemini/X failure costs a retry instead of the pick.
-- (Aug 5 is exactly that failure: one dead run at 1:45 PM ET lost the Astros AND Cubs/Dodgers picks for good.)
--
-- X API cost is unchanged: the metrics refresh inside the function is throttled on its own stored timestamp
-- (METRICS_MIN_INTERVAL_MIN = 45), so it still runs ~hourly no matter how often the cron fires.
--
-- Matched on the command rather than the job name so this applies whatever the job ended up being called.
do $$
declare
  target_jobid bigint;
begin
  select jobid into target_jobid
  from cron.job
  where command like '%social-auto-post%'
  limit 1;

  if target_jobid is null then
    raise warning 'social-auto-post cron job not found — nothing rescheduled';
  else
    perform cron.alter_job(target_jobid, schedule => '*/15 * * * *');
    raise notice 'social-auto-post rescheduled to */15 * * * * (jobid %)', target_jobid;
  end if;
end $$;
