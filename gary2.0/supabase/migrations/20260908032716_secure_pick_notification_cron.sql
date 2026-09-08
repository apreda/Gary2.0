-- Configure GARY_CRON_SERVICE_ROLE_KEY in Vault using the existing project
-- service credential before applying. No credential appears in repository SQL.
-- The Edge sender requires that service bearer; the public anon JWT can no
-- longer trigger or preview device alerts. Preserve the existing cron cadence.
do $$
declare target_id bigint;
begin
  if not exists(select 1 from vault.secrets where name='GARY_CRON_SERVICE_ROLE_KEY') then
    raise exception 'Configure the cron service credential in Vault before this migration';
  end if;
  select jobid into target_id from cron.job where jobname='notify-new-pick-5min';
  if target_id is null then raise exception 'Existing pick notification schedule is missing'; end if;
  perform cron.alter_job(target_id, command := $cron$
    select net.http_post(
      url := 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/notify-new-pick',
      headers := jsonb_build_object('Content-Type','application/json','Authorization',
        (select 'Bearer ' || decrypted_secret from vault.decrypted_secrets where name='GARY_CRON_SERVICE_ROLE_KEY')),
      body := '{}'::jsonb,
      timeout_milliseconds := 75000
    );
  $cron$);
end;
$$;
