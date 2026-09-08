-- Install the existing project service credential as GARY_CRON_SERVICE_ROLE_KEY
-- in Vault before applying. Change the cron callers before deploying the cache writer
-- service guards, so cache refreshing continues throughout the cutover. Never embed the
-- credential in cron.job, migration SQL or logs. Existing job ids, schedules,
-- active state, request bodies and timeouts are preserved.
do $$
declare
  score_job bigint;
  lineup_job bigint;
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'GARY_CRON_SERVICE_ROLE_KEY' and length(trim(decrypted_secret)) > 0
  ) then
    raise exception 'Configure the cron service credential in Vault before this migration';
  end if;
  select jobid into score_job from cron.job where jobname = 'live-scores-2min';
  select jobid into lineup_job from cron.job where jobname = 'mlb-field-lineups-30min';
  if score_job is null or lineup_job is null then
    raise exception 'Existing cache refresh schedules are missing';
  end if;
  perform cron.alter_job(score_job, command := $cron$
    select net.http_post(
      url := 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/live-scores',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
        (select 'Bearer ' || decrypted_secret from vault.decrypted_secrets where name = 'GARY_CRON_SERVICE_ROLE_KEY')),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$);
  perform cron.alter_job(lineup_job, command := $cron$
    select net.http_post(
      url := 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/mlb-field-lineups',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
        (select 'Bearer ' || decrypted_secret from vault.decrypted_secrets where name = 'GARY_CRON_SERVICE_ROLE_KEY')),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$);
end;
$$;
