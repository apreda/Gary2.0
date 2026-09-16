-- Non-AI incident emails. Private tables are not exposed through the Data API.
-- The two public ingestion/config RPCs are executable by service_role only.
create schema if not exists gary_ops;
revoke all on schema gary_ops from public, anon, authenticated;
create table gary_ops.settings (
  singleton boolean primary key default true check(singleton), recipient text not null,
  sender text not null, enabled boolean not null default false, enabled_at timestamptz,
  last_tick_at timestamptz
);
create table gary_ops.host (
  singleton boolean primary key default true check(singleton), received_at timestamptz not null,
  scheduler_at timestamptz
);
create table gary_ops.incidents (
  source text not null, key text not null, title text not null, detail text not null,
  opened_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  resolved_at timestamptz, primary key(source,key)
);
create table gary_ops.events (
  id bigint generated always as identity primary key, source text not null, key text not null,
  title text not null, detail text not null, kind text not null check(kind in ('failure','recovery','test')),
  created_at timestamptz not null default now(), mail_id uuid
);
create table gary_ops.mail (
  id uuid primary key default gen_random_uuid(), payload jsonb not null,
  created_at timestamptz not null default now(), first_sent_at timestamptz, attempted_at timestamptz,
  request_id bigint, attempts integer not null default 0, accepted_at timestamptz,
  provider_id text, last_error text, stopped boolean not null default false
);
create table gary_ops.social_requests (
  id bigint primary key, created_at timestamptz not null default now(), checked_at timestamptz
);
alter table gary_ops.settings enable row level security;
alter table gary_ops.host enable row level security;
alter table gary_ops.incidents enable row level security;
alter table gary_ops.events enable row level security;
alter table gary_ops.mail enable row level security;
alter table gary_ops.social_requests enable row level security;

create function gary_ops.observe(p_source text, p_rows jsonb, p_resolve boolean default true)
returns void language plpgsql set search_path='' as $$
declare item jsonb; previous gary_ops.incidents; r gary_ops.incidents;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Expected observations array'; end if;
  perform pg_advisory_xact_lock(20260916, 101);
  for item in select value from jsonb_array_elements(p_rows) loop
    if length(coalesce(item->>'key','')) not between 1 and 300
      or length(coalesce(item->>'title','')) not between 1 and 300 then raise exception 'Invalid incident identity'; end if;
    select * into previous from gary_ops.incidents where source=p_source and key=item->>'key';
    if not found or previous.resolved_at is not null then
      insert into gary_ops.events(source,key,title,detail,kind)
        values(p_source,item->>'key',item->>'title',left(coalesce(item->>'detail',''),1000),'failure');
    end if;
    insert into gary_ops.incidents(source,key,title,detail)
      values(p_source,item->>'key',item->>'title',left(coalesce(item->>'detail',''),1000))
    on conflict(source,key) do update set title=excluded.title, detail=excluded.detail,
      opened_at=case when incidents.resolved_at is not null then now() else incidents.opened_at end,
      last_seen_at=now(), resolved_at=null;
  end loop;
  if p_resolve then
    for r in update gary_ops.incidents set resolved_at=now()
      where source=p_source and resolved_at is null
        and not exists(select 1 from jsonb_array_elements(p_rows) v where v->>'key'=incidents.key)
      returning * loop
      insert into gary_ops.events(source,key,title,detail,kind)
        values(p_source,r.key,r.title,'A successful observation cleared this incident.','recovery');
    end loop;
  end if;
end;
$$;

create function public.report_operational_health(p_date text, p_scheduler_at timestamptz,
  p_observations jsonb, p_complete boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_date <> to_char(now() at time zone 'America/New_York','YYYY-MM-DD')
    or jsonb_typeof(p_observations) is distinct from 'array'
    or jsonb_array_length(p_observations)>500 then raise exception 'Invalid current observation'; end if;
  insert into gary_ops.host(singleton,received_at,scheduler_at) values(true,now(),p_scheduler_at)
    on conflict(singleton) do update set received_at=now(),scheduler_at=excluded.scheduler_at;
  -- A calendar rollover is not recovery evidence for an older game's failure.
  perform gary_ops.observe('local:'||p_date,coalesce((select jsonb_agg(v) from jsonb_array_elements(p_observations) v
    where v->>'key' like p_date||':%'),'[]'),p_complete);
  perform gary_ops.observe('local:health',coalesce((select jsonb_agg(v) from jsonb_array_elements(p_observations) v
    where v->>'key' not like p_date||':%'),'[]'),p_complete and not exists(
      select 1 from jsonb_array_elements(p_observations) v where v->>'key'='coverage:unverified'));
end;
$$;
revoke all on function public.report_operational_health(text,timestamptz,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.report_operational_health(text,timestamptz,jsonb,boolean) to service_role;

create function public.configure_operational_email(p_key text,p_recipient text,p_sender text)
returns void language plpgsql security definer set search_path='' as $$
declare secret_id uuid;
begin
  if length(p_key)<15 or p_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_sender ~ '[\r\n]' then raise exception 'Invalid email configuration'; end if;
  select id into secret_id from vault.secrets where name='GARY_OPS_RESEND_KEY';
  if secret_id is null then perform vault.create_secret(p_key,'GARY_OPS_RESEND_KEY');
  else perform vault.update_secret(secret_id,p_key); end if;
  insert into gary_ops.settings(singleton,recipient,sender) values(true,p_recipient,p_sender)
    on conflict(singleton) do update set recipient=excluded.recipient,sender=excluded.sender;
end;
$$;
revoke all on function public.configure_operational_email(text,text,text) from public,anon,authenticated;
grant execute on function public.configure_operational_email(text,text,text) to service_role;

create function gary_ops.enqueue_social() returns bigint language plpgsql set search_path='' as $$
declare request_id bigint;
begin
  select net.http_post(
    url:='https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/social-auto-post',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization',
      (select 'Bearer '||decrypted_secret from vault.decrypted_secrets where name='GARY_CRON_SERVICE_ROLE_KEY')),
    body:='{}'::jsonb, timeout_milliseconds:=120000) into request_id;
  insert into gary_ops.social_requests(id) values(request_id);
  return request_id;
end;
$$;

create function gary_ops.tick() returns void language plpgsql set search_path='' as $$
declare r record; body jsonb; problems jsonb; detail text; email_key text;
  cfg gary_ops.settings; mailrow gary_ops.mail; ids bigint[]; message text; new_mail uuid;
  response record; http_id bigint;
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
    if r.status_code is null or r.timed_out is true or r.status_code>=400
      or body->'health'->>'status' is distinct from 'ok' then
      detail:='Scheduled X publisher failed (HTTP '||coalesce(r.status_code::text,'no response')||').';
      if jsonb_typeof(body->'health'->'issues')='array' then
        detail:=detail||' Codes: '||left(regexp_replace((body->'health'->'issues')::text,'[^A-Z_0-9, \[\]"]','','g'),250);
      end if;
      problems:=jsonb_build_array(jsonb_build_object('key','publisher','title','X posting failed','detail',detail));
    end if;
    perform gary_ops.observe('cloud:social',problems);
    update gary_ops.social_requests set checked_at=now() where id=r.id;
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
$$;
revoke all on all functions in schema gary_ops from public,anon,authenticated;

-- Preserve the existing X posting schedule and its active state. Only wrap
-- its normal HTTP enqueue to retain the request ID for failure detection.
do $$
declare social_job bigint;
begin
  select jobid into social_job from cron.job where jobname='social-auto-post-hourly';
  if social_job is null then raise exception 'Expected social posting job missing'; end if;
  perform cron.alter_job(social_job,command:='select gary_ops.enqueue_social();');
  perform cron.schedule('gary-operational-alerts','* * * * *','select gary_ops.tick();');
end;
$$;
