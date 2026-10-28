-- X publisher: one missed five-minute run is held; two in a row open the incident.
alter table gary_ops.social_requests add column if not exists failed boolean;

CREATE OR REPLACE FUNCTION gary_ops.tick()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r record; body jsonb; problems jsonb; detail text; email_key text;
  cfg gary_ops.settings; mailrow gary_ops.mail; ids bigint[]; message text; new_mail uuid;
  response record; http_id bigint; social_failed boolean;
begin
  if not pg_try_advisory_xact_lock(20260916,102) then return; end if;
  select * into cfg from gary_ops.settings where singleton;
  if not found or not cfg.enabled then return; end if;
  update gary_ops.settings set last_tick_at=now() where singleton;
  perform gary_ops.observe('cloud:host',case when exists(
    select 1 from gary_ops.host where received_at>=now()-interval '5 minutes') then '[]'::jsonb
    else '[{"key":"offline","title":"Gary Mac stopped reporting","detail":"No host report for five minutes. The Mac, network or collector may be offline; game and prop generation need attention."}]'::jsonb end);

  -- Record every scheduled request ID, including gateway errors and empty /
  -- malformed responses which have no JSON service label. Never calls the LLM.
  for r in select q.id,q.created_at,n.status_code,n.content,n.timed_out
    from gary_ops.social_requests q left join net._http_response n on n.id=q.id
    where q.checked_at is null and (n.id is not null or q.created_at<now()-interval '3 minutes') order by q.id loop
    body:=null;
    begin body:=r.content::jsonb; exception when others then body:=null; end;
    problems:='[]'::jsonb;
    social_failed:=r.status_code is null or r.timed_out is true or r.status_code>=400
      or body->'health'->>'status' is distinct from 'ok';
    -- ONE MISSED RUN IS NOT AN OUTAGE (Oct 28 2026). The publisher runs every
    -- five minutes and the next run publishes what one missed (Oct 26 2:26 AM:
    -- no response, 2:31 fine, and a FAILURE plus a RECOVERY email). A failure
    -- opens an incident only when the run before it also failed.
    if social_failed and coalesce((select p.failed from gary_ops.social_requests p
      where p.id<r.id and p.checked_at is not null order by p.id desc limit 1),false) then
      detail:='Scheduled X publisher failed twice in a row (HTTP '||coalesce(r.status_code::text,'no response')||').';
      if jsonb_typeof(body->'health'->'issues')='array' then
        detail:=detail||' Codes: '||left(regexp_replace((body->'health'->'issues')::text,'[^A-Z_0-9, \[\]"]','','g'),250);
      end if;
      problems:=jsonb_build_array(jsonb_build_object('key','publisher','title','X posting failed','detail',detail));
    end if;
    perform gary_ops.observe('cloud:social',problems);
    update gary_ops.social_requests set checked_at=now(),failed=social_failed where id=r.id;
  end loop;

  problems:='[]'::jsonb;
  if not exists(select 1 from cron.job j where j.jobname='social-auto-post-hourly' and j.active
    and exists(select 1 from cron.job_run_details d where d.jobid=j.jobid
      and d.start_time>=now()-interval '20 minutes' and d.status in ('succeeded','running'))) then
    problems:=jsonb_build_array(jsonb_build_object('key','cron','title','X posting schedule stopped',
      'detail','The expected posting cron is absent, inactive, failed or has not started in 20 minutes.'));
  end if;
  perform gary_ops.observe('cloud:cron',problems);
  select coalesce(jsonb_agg(jsonb_build_object('key',publication_key,'title','X publication needs reconciliation',
    'detail','An unfinished publication receipt is over five minutes old. Inspect the existing X receipt before retrying.')),'[]')
    into problems from public.social_publication_intents
    where state not in ('completed','expired') and updated_at<now()-interval '5 minutes';
  perform gary_ops.observe('cloud:receipts',problems);

  -- Coalesce new incidents/recoveries into a single small email per tick.
  select array_agg(pending.id),string_agg(upper(pending.kind)||': '||pending.title||E'\n'||pending.detail||E'\nObserved: '||
    to_char(pending.created_at at time zone 'America/New_York','YYYY-MM-DD HH24:MI:SS')||' ET',E'\n\n' order by pending.id)
    into ids,message from (select * from gary_ops.events where mail_id is null order by id limit 20) pending;
  if ids is not null then
    insert into gary_ops.mail(payload) values(jsonb_build_object('from',cfg.sender,'to',jsonb_build_array(cfg.recipient),
      'subject','Gary operations: '||array_length(ids,1)||' update(s)',
      'text',message||E'\n\nAutomatic code check. No AI was used. Repeated unchanged incidents stay quiet.\nDetails: Gary operations incident ledger and the Mac run logs.')) returning id into new_mail;
    update gary_ops.events set mail_id=new_mail where id=any(ids);
  end if;
  select decrypted_secret into email_key from vault.decrypted_secrets where name='GARY_OPS_RESEND_KEY';
  if email_key is null then raise exception 'Operational email credential unavailable'; end if;
  for mailrow in select * from gary_ops.mail where accepted_at is null and not stopped order by created_at limit 5 loop
    if mailrow.request_id is not null then
      select * into response from net._http_response where id=mailrow.request_id;
      if found then
        body:=null;
        begin body:=response.content::jsonb; exception when others then body:=null; end;
        if response.status_code between 200 and 299 and body->>'id' is not null then
          update gary_ops.mail set accepted_at=now(),provider_id=body->>'id',last_error=null where id=mailrow.id;
          continue;
        end if;
        update gary_ops.mail set last_error='Email API HTTP '||coalesce(response.status_code::text,'unknown') where id=mailrow.id;
      end if;
      if mailrow.attempted_at>now()-interval '5 minutes' then continue; end if;
    end if;
    -- Resend's idempotency window is 24 hours. Stop before it expires instead
    -- of risking a duplicate email after an ambiguous send.
    if mailrow.first_sent_at<now()-interval '23 hours' then
      update gary_ops.mail set stopped=true,last_error='Delivery unconfirmed; reconcile before retrying beyond idempotency window' where id=mailrow.id;
      continue;
    end if;
    select net.http_post(url:='https://api.resend.com/emails',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||email_key,
        'Idempotency-Key','gary-ops/'||mailrow.id::text),body:=mailrow.payload,timeout_milliseconds:=15000) into http_id;
    update gary_ops.mail set request_id=http_id,attempted_at=now(),first_sent_at=coalesce(first_sent_at,now()),attempts=attempts+1 where id=mailrow.id;
  end loop;
  delete from gary_ops.social_requests where checked_at<now()-interval '14 days';
end;
$function$;
