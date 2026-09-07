-- Reserve the game before contacting X. An uncertain send is never auto-retried.
alter table public.social_post_log add column publication_key text;
alter table public.social_post_log drop constraint social_post_log_unique_pick;
create unique index social_post_log_unique_pick on public.social_post_log(post_date,pick_text) where publication_key is null;
create unique index social_post_log_unique_publication on public.social_post_log(post_date,publication_key);

create table public.social_publication_intents (
  id uuid primary key default gen_random_uuid(),
  post_date text not null,
  publication_key text not null,
  state text not null default 'prepared' check (state in ('prepared','root_sending','root_sent','reply_sending','reply_sent','completed','expired')),
  log_payload jsonb not null,
  reply_text text,
  hook_tweet_id text,
  reply_tweet_id text,
  root_posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(post_date,publication_key),
  check (state not in ('root_sent','reply_sending','reply_sent','completed') or (hook_tweet_id is not null and root_posted_at is not null)),
  check (state <> 'reply_sent' or reply_tweet_id is not null)
);
alter table public.social_publication_intents enable row level security;
revoke all on public.social_publication_intents from public,anon,authenticated;
grant select,insert,update on public.social_publication_intents to service_role;
create policy service_publication_access on public.social_publication_intents to service_role using (true) with check (true);

create function public.claim_social_publication(p_date text,p_key text,p_payload jsonb,p_reply text default null)
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
  -- Serialize this day's reservations: overlapping invocations share the 30-root cap.
  perform pg_advisory_xact_lock(hashtextextended('social-publication:'||p_date,0));
  if exists(select 1 from public.social_publication_intents where post_date=p_date and publication_key=p_key) then
    return query select * from public.social_publication_intents where post_date=p_date and publication_key=p_key;
    return;
  end if;
  -- Old receipts have no game key. Keep their conservative ticket protection.
  if exists(select 1 from public.social_post_log where post_date=p_date and
    ((publication_key=p_key) or (publication_key is null and pick_text=p_payload->>'pick_text'))
    and thread_format in ('standard','top_pick')) then return; end if;
  if (select count(*) from public.social_post_log where post_date=p_date and publication_key is null and thread_format in ('standard','top_pick'))
    + (select count(*) from public.social_publication_intents where post_date=p_date and state<>'expired') >= 30 then return; end if;
  return query insert into public.social_publication_intents(post_date,publication_key,log_payload,reply_text)
    values(p_date,p_key,p_payload,p_reply) returning *;
end $$;
revoke all on function public.claim_social_publication(text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_social_publication(text,text,jsonb,text) to service_role;
