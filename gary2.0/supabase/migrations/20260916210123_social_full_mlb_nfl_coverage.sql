-- September 16: every MLB/NFL game pick, with an atomic four-minute guard.
-- Cron is five minutes; the one-minute margin absorbs writer/DB latency.
-- Other sports keep the twelve-root audience budget; existing receipts survive.
create or replace function public.claim_social_publication(p_date text,p_key text,p_payload jsonb,p_reply text default null)
returns setof public.social_publication_intents
language plpgsql security invoker set search_path = '' as $$
begin
  if p_date is distinct from to_char(now() at time zone 'America/New_York','YYYY-MM-DD')
    or nullif(p_key,'') is null or length(p_key)>1024
    or jsonb_typeof(p_payload) is distinct from 'object'
    or nullif(p_payload->>'pick_text','') is null
    or nullif(p_payload->>'post_text','') is null or length(p_payload->>'post_text')>280
    or nullif(p_payload->>'commence_time','') is null
    or to_char((p_payload->>'commence_time')::timestamptz at time zone 'America/New_York','YYYY-MM-DD') is distinct from p_date
    or (p_payload->>'thread_format') is null or (p_payload->>'thread_format') not in ('standard','top_pick')
    or length(p_payload::text)>16000 or length(p_reply)>280 then
    raise exception 'Invalid social publication';
  end if;
  -- Serialize the posting interval and the other-sport cap across overlapping cron runs.
  perform pg_advisory_xact_lock(hashtextextended('social-publication:'||p_date,0));
  -- A confirmed root or an uncertain in-flight attempt occupies the interval.
  -- Exclude this key so its own prepared payload can resume without duplication.
  if exists(select 1 from public.social_publication_intents where post_date=p_date and publication_key<>p_key
    and state<>'expired' and greatest(created_at,root_posted_at,updated_at) > now()-interval '4 minutes')
    or exists(select 1 from public.social_post_log where post_date=p_date
      and thread_format in ('standard','top_pick') and publication_key is distinct from p_key
      and posted_at > now()-interval '4 minutes') then return; end if;
  if exists(select 1 from public.social_publication_intents where post_date=p_date and publication_key=p_key) then
    update public.social_publication_intents set updated_at=now()
      where post_date=p_date and publication_key=p_key and state='prepared';
    return query select * from public.social_publication_intents where post_date=p_date and publication_key=p_key;
    return;
  end if;
  -- Old receipts have no game key. Keep their conservative ticket protection.
  if exists(select 1 from public.social_post_log where post_date=p_date and
    ((publication_key=p_key) or (publication_key is null and pick_text=p_payload->>'pick_text'))
    and thread_format in ('standard','top_pick')) then return; end if;
  if coalesce(upper(p_payload->>'league'),'') not in ('MLB','NFL') and
    (select count(*) from public.social_post_log l where l.post_date=p_date and l.thread_format in ('standard','top_pick')
      and coalesce(upper(l.league),'') not in ('MLB','NFL')
      and not exists(select 1 from public.social_publication_intents i where i.post_date=p_date
        and i.publication_key=l.publication_key and i.state<>'expired'))
    + (select count(*) from public.social_publication_intents where post_date=p_date and state<>'expired'
      and coalesce(upper(log_payload->>'league'),'') not in ('MLB','NFL')) >= 12 then return; end if;
  return query insert into public.social_publication_intents(post_date,publication_key,log_payload,reply_text)
    values(p_date,p_key,p_payload,p_reply) returning *;
end $$;
revoke all on function public.claim_social_publication(text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_social_publication(text,text,jsonb,text) to service_role;

-- Preserve the existing authenticated dispatcher, job ID and active state.
do $$
declare social_job bigint;
begin
  select jobid into social_job from cron.job where jobname='social-auto-post-hourly';
  if social_job is null then raise exception 'Expected social posting cron not found'; end if;
  perform cron.alter_job(social_job,schedule:='*/5 * * * *');
end $$;
