-- Install the existing project service credential as GARY_CRON_SERVICE_ROLE_KEY
-- in Vault before applying. Change the cron callers before deploying the Edge
-- service guards, so grading continues throughout the cutover. Never embed the
-- credential in cron.job, migration SQL or logs. Existing job ids, schedules,
-- active state, request bodies and timeouts are preserved.
do $$
declare
  game_job bigint;
  prop_job bigint;
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'GARY_CRON_SERVICE_ROLE_KEY' and length(trim(decrypted_secret)) > 0
  ) then
    raise exception 'Configure the cron service credential in Vault before this migration';
  end if;
  select jobid into game_job from cron.job where jobname = 'grade-results-3min';
  select jobid into prop_job from cron.job where jobname = 'grade-props-5min';
  if game_job is null or prop_job is null then
    raise exception 'Existing grading schedules are missing';
  end if;
  perform cron.alter_job(game_job, command := $cron$
    select net.http_post(
      url := 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/grade-results',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
        (select 'Bearer ' || decrypted_secret from vault.decrypted_secrets where name = 'GARY_CRON_SERVICE_ROLE_KEY')),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$);
  perform cron.alter_job(prop_job, command := $cron$
    select net.http_post(
      url := 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/grade-props',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
        (select 'Bearer ' || decrypted_secret from vault.decrypted_secrets where name = 'GARY_CRON_SERVICE_ROLE_KEY')),
      body := '{}'::jsonb,
      timeout_milliseconds := 40000
    );
  $cron$);
end;
$$;
