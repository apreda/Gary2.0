-- Change the existing auto-post caller to the configured service credential
-- before deploying service guards. The existing 15-minute cadence and 120s
-- timeout are preserved; applying this migration performs no HTTP or X work.
do $$
declare target_id bigint;
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'GARY_CRON_SERVICE_ROLE_KEY' and length(trim(decrypted_secret)) > 0
  ) then
    raise exception 'Configure the cron service credential in Vault before this migration';
  end if;
  select jobid into target_id from cron.job where jobname = 'social-auto-post-hourly';
  if target_id is null then raise exception 'Existing social auto-post schedule is missing'; end if;
  perform cron.alter_job(target_id, command := $cron$
    select net.http_post(
      url := 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/social-auto-post',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
        (select 'Bearer ' || decrypted_secret from vault.decrypted_secrets where name = 'GARY_CRON_SERVICE_ROLE_KEY')),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$);
end;
$$;
