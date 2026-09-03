-- Website-only growth measurement. The legacy public.log_app_event function
-- and its app_events table are intentionally untouched so iOS behavior stays
-- byte-for-byte compatible. Trusted web metrics live in a separate table.

create table if not exists public.web_events (
  id bigint generated always as identity primary key,
  event text not null,
  identity uuid not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint web_events_event check (event in (
    'meaningful_pick_view', 'signup_started', 'signup_completed',
    'email_signup_completed', 'book_action_started', 'first_book_action',
    'return_visit', 'share_started', 'share_completed', 'app_store_handoff',
    'paywall_viewed', 'plan_selected'
  )),
  constraint web_events_props_object check (jsonb_typeof(props) = 'object')
);

-- An older unpublished draft stored rate keys beside analytics indefinitely.
-- Remove that column if this migration is replayed over such an environment.
alter table public.web_events drop column if exists request_fingerprint;

create index if not exists web_events_event_created_at_idx
  on public.web_events (event, created_at desc);

alter table public.web_events enable row level security;
alter table public.web_events force row level security;
revoke all on table public.web_events from public, anon, authenticated;
grant select, insert on table public.web_events to service_role;
revoke all on sequence public.web_events_id_seq from public, anon, authenticated;
grant usage, select on sequence public.web_events_id_seq to service_role;

create table if not exists public.web_ingest_rate_limits (
  kind text not null,
  request_fingerprint text not null,
  bucket_start timestamptz not null,
  hits integer not null default 1,
  primary key (kind, request_fingerprint, bucket_start),
  constraint web_ingest_rate_limits_kind check (kind in ('event', 'link')),
  constraint web_ingest_rate_limits_fingerprint check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint web_ingest_rate_limits_hits check (hits > 0)
);

create index if not exists web_ingest_rate_limits_bucket_start_idx
  on public.web_ingest_rate_limits (bucket_start);

alter table public.web_ingest_rate_limits enable row level security;
alter table public.web_ingest_rate_limits force row level security;
revoke all on table public.web_ingest_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.web_ingest_rate_limits to service_role;

create or replace function public.consume_web_ingest_quota(
  p_kind text,
  p_request_fingerprint text
) returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_hits integer;
  max_hits integer;
  current_bucket timestamptz := date_trunc('minute', statement_timestamp());
begin
  max_hits := case p_kind when 'event' then 60 when 'link' then 30 else null end;
  if max_hits is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid web ingress quota' using errcode = '22023';
  end if;

  -- Every ingress deterministically removes expired keys. The table is only a
  -- short-lived abuse-control bucket; durable analytics rows contain no IP/UA key.
  delete from public.web_ingest_rate_limits
  where bucket_start < current_bucket - interval '5 minutes';

  insert into public.web_ingest_rate_limits (kind, request_fingerprint, bucket_start, hits)
  values (p_kind, p_request_fingerprint, current_bucket, 1)
  on conflict (kind, request_fingerprint, bucket_start)
  do update set hits = public.web_ingest_rate_limits.hits + 1
  returning hits into current_hits;

  return current_hits <= max_hits;
end;
$$;

revoke all on function public.consume_web_ingest_quota(text, text) from public, anon, authenticated;
grant execute on function public.consume_web_ingest_quota(text, text) to service_role;

-- Bound retention even if no later request arrives to run the inline cleanup.
-- This project already provides pg_cron; every run removes expired one-way keys.
select cron.unschedule(jobid)
from cron.job
where jobname = 'cleanup-web-ingest-rate-limits';

select cron.schedule(
  'cleanup-web-ingest-rate-limits',
  '*/5 * * * *',
  $$delete from public.web_ingest_rate_limits
    where bucket_start < statement_timestamp() - interval '5 minutes'$$
);

-- Remove the pre-hardening browser-callable overload if this migration is
-- replayed in an environment where an earlier draft was installed.
drop function if exists public.log_web_event(text, text, jsonb);
drop function if exists public.log_web_event(text, uuid, text, jsonb);

create or replace function public.log_web_event(
  p_event text,
  p_identity uuid,
  p_request_fingerprint text,
  p_props jsonb default '{}'::jsonb
) returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  attribution_keys constant text[] := array[
    'first_source', 'first_medium', 'first_campaign', 'first_referrer', 'first_landing',
    'latest_source', 'latest_medium', 'latest_campaign', 'latest_referrer', 'latest_landing'
  ];
  event_keys text[];
  required_keys text[];
  required_key text;
begin
  event_keys := case p_event
    when 'meaningful_pick_view' then array['path', 'content_type']
    when 'signup_started' then array['method']
    when 'signup_completed' then array['method']
    when 'email_signup_completed' then array['cadence', 'source']
    when 'book_action_started' then array['action', 'content_type', 'item_id', 'path']
    when 'first_book_action' then array['action', 'content_type', 'item_id', 'path']
    when 'return_visit' then array['path', 'days_since_last_visit']
    when 'share_started' then array['method', 'surface', 'content_type', 'item_id', 'path']
    when 'share_completed' then array['method', 'surface', 'content_type', 'item_id', 'path']
    when 'app_store_handoff' then array['surface', 'click_id', 'destination', 'plan', 'sport', 'billing']
    when 'paywall_viewed' then array['surface', 'trigger']
    when 'plan_selected' then array['surface', 'plan', 'sport', 'billing']
    else null
  end;
  required_keys := case p_event
    when 'meaningful_pick_view' then array['path', 'content_type']
    when 'signup_started' then array['method']
    when 'signup_completed' then array['method']
    when 'email_signup_completed' then array['cadence']
    when 'book_action_started' then array['action', 'content_type']
    when 'first_book_action' then array['action', 'content_type']
    when 'return_visit' then array['path', 'days_since_last_visit']
    when 'share_started' then array['method', 'surface', 'content_type', 'path']
    when 'share_completed' then array['method', 'surface', 'content_type', 'path']
    when 'app_store_handoff' then array['surface', 'click_id', 'destination']
    when 'paywall_viewed' then array['surface', 'trigger']
    when 'plan_selected' then array['surface', 'plan', 'billing']
    else null
  end;

  if event_keys is null then
    raise exception 'unsupported web event' using errcode = '22023';
  end if;
  if p_identity::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid web identity' using errcode = '22023';
  end if;
  if p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid request fingerprint' using errcode = '22023';
  end if;

  p_props := coalesce(p_props, '{}'::jsonb);
  if jsonb_typeof(p_props) <> 'object' or octet_length(p_props::text) > 4096 then
    raise exception 'invalid web event properties' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(p_props)) > 24 then
    raise exception 'too many web event properties' using errcode = '22023';
  end if;
  foreach required_key in array required_keys loop
    if not (p_props ? required_key) then
      raise exception 'missing required web event property' using errcode = '22023';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_each(p_props) as property(key, value)
    where not (property.key = any(attribution_keys || event_keys))
      or jsonb_typeof(property.value) <> case when property.key = 'days_since_last_visit' then 'number' else 'string' end
      or (jsonb_typeof(property.value) = 'string' and (
        length(property.value #>> '{}') > 240
        or property.value #>> '{}' <> btrim(property.value #>> '{}')
        or property.value #>> '{}' ~ '[[:cntrl:]]'
        or property.value #>> '{}' ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}'
      ))
  ) then
    raise exception 'unsupported web event property' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_each_text(p_props) as property(key, value)
    where property.key in (
      'first_source', 'first_medium', 'first_campaign',
      'latest_source', 'latest_medium', 'latest_campaign'
    ) and property.value !~ '^[a-z0-9._-]{1,80}$'
  ) or exists (
    select 1 from jsonb_each_text(p_props) as property(key, value)
    where property.key in ('first_referrer', 'latest_referrer')
      and (length(property.value) > 253 or property.value !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$')
  ) or exists (
    select 1 from jsonb_each_text(p_props) as property(key, value)
    where property.key in ('first_landing', 'latest_landing', 'path')
      and property.value !~ '^/[^?#[:cntrl:]]{0,239}$'
  ) or exists (
    select 1 from jsonb_each_text(p_props) as property(key, value)
    where property.key in ('surface', 'trigger', 'source', 'sport')
      and property.value !~ '^[a-z0-9._-]{1,100}$'
  ) or exists (
    select 1 from jsonb_each_text(p_props) as property(key, value)
    where property.key = 'item_id' and property.value !~ '^[a-z0-9._:-]{1,160}$'
  ) then
    raise exception 'invalid web event property value' using errcode = '22023';
  end if;

  if p_props ? 'days_since_last_visit'
    and ((p_props ->> 'days_since_last_visit')::numeric <> trunc((p_props ->> 'days_since_last_visit')::numeric)
      or (p_props ->> 'days_since_last_visit')::numeric not between 0 and 3650) then
    raise exception 'invalid return interval' using errcode = '22023';
  end if;
  if p_event in ('signup_started', 'signup_completed') and p_props ->> 'method' not in ('email', 'google') then
    raise exception 'invalid signup method' using errcode = '22023';
  end if;
  if p_event in ('share_started', 'share_completed') and p_props ->> 'method' not in ('native', 'copy_link') then
    raise exception 'invalid share method' using errcode = '22023';
  end if;
  if p_event in ('book_action_started', 'first_book_action')
    and (p_props ->> 'action' not in ('tail', 'fade') or p_props ->> 'content_type' not in ('game', 'prop')) then
    raise exception 'invalid book action' using errcode = '22023';
  end if;
  if p_event = 'meaningful_pick_view' and p_props ->> 'content_type' <> 'pick' then
    raise exception 'invalid pick view' using errcode = '22023';
  end if;
  if p_event in ('share_started', 'share_completed') and p_props ->> 'content_type' not in ('pick', 'dataset') then
    raise exception 'invalid share content' using errcode = '22023';
  end if;
  if p_event = 'email_signup_completed' and p_props ->> 'cadence' not in ('daily', 'weekly', 'both') then
    raise exception 'invalid email cadence' using errcode = '22023';
  end if;
  if p_event = 'app_store_handoff'
    and (p_props ->> 'destination' <> 'app_store'
      or p_props ->> 'click_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
    raise exception 'invalid app handoff' using errcode = '22023';
  end if;
  if p_props ? 'plan' and p_props ->> 'plan' not in ('all_access', 'all_access_annual', 'single') then
    raise exception 'invalid plan' using errcode = '22023';
  end if;
  if p_props ? 'billing' and p_props ->> 'billing' not in ('monthly', 'annual') then
    raise exception 'invalid billing cadence' using errcode = '22023';
  end if;

  -- The caller cannot influence this key: Next.js derives it from Vercel's
  -- trusted client-IP header with a daily rotating HMAC before using service role.
  if not public.consume_web_ingest_quota('event', p_request_fingerprint) then
    return false;
  end if;

  insert into public.web_events (event, identity, props)
  values (p_event, p_identity, p_props);
  return true;
end;
$$;

revoke all on function public.log_web_event(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_web_event(text, uuid, text, jsonb) to service_role;

comment on table public.web_events is
  'Consent-gated website product analytics. Locked to service-role ingestion; separate from legacy app_events.';
comment on function public.log_web_event(text, uuid, text, jsonb) is
  'Closed-schema, service-role-only website event writer with server-derived request rate limiting.';

-- Website redirect measurement is isolated from the pre-existing link_clicks
-- table. This migration never alters its columns, sequence, grants, or policies,
-- so a legacy/iOS caller cannot be affected by website hardening.
create table if not exists public.web_link_clicks (
  id bigint generated always as identity primary key,
  click_id uuid not null unique,
  surface text not null,
  ct text not null default 'website',
  referrer_host text,
  first_source text,
  first_medium text,
  first_campaign text,
  first_referrer text,
  first_landing text,
  latest_source text,
  latest_medium text,
  latest_campaign text,
  latest_referrer text,
  latest_landing text,
  created_at timestamptz not null default now()
);

create index if not exists web_link_clicks_created_at_idx
  on public.web_link_clicks (created_at desc);
create index if not exists web_link_clicks_surface_created_at_idx
  on public.web_link_clicks (surface, created_at desc);

alter table public.web_link_clicks enable row level security;
alter table public.web_link_clicks force row level security;
revoke all on table public.web_link_clicks from public, anon, authenticated;
grant select, insert on table public.web_link_clicks to service_role;
revoke all on sequence public.web_link_clicks_id_seq from public, anon, authenticated;
grant usage, select on sequence public.web_link_clicks_id_seq to service_role;

drop function if exists public.log_web_link_click(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
);

create or replace function public.log_web_link_click(
  p_click_id uuid,
  p_surface text,
  p_request_fingerprint text,
  p_ct text default null,
  p_referrer_host text default null,
  p_first_source text default null,
  p_first_medium text default null,
  p_first_campaign text default null,
  p_first_referrer text default null,
  p_first_landing text default null,
  p_latest_source text default null,
  p_latest_medium text default null,
  p_latest_campaign text default null,
  p_latest_referrer text default null,
  p_latest_landing text default null
) returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_click_id is null or p_click_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid click id' using errcode = '22023';
  end if;
  if p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid request fingerprint' using errcode = '22023';
  end if;
  if p_surface is null or p_surface !~ '^(home_app_section|pricing_footer|pricing_plan|how_it_works|contact|app_page_(hero|footer)|nfl_page_(hero|joined|footer)|league_day_[a-z0-9_]{1,24}|game_page_[a-z0-9_]{1,24}|x_bio|creator|unknown)$' then
    raise exception 'invalid app store surface' using errcode = '22023';
  end if;
  if p_ct is not null and p_ct !~ '^[a-zA-Z0-9._-]{1,40}$' then
    raise exception 'invalid campaign token' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(array[p_referrer_host, p_first_referrer, p_latest_referrer]) as value
    where value is not null and (length(value) > 253 or value !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$')
  ) then
    raise exception 'invalid referrer hostname' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(array[
      p_first_source, p_first_medium, p_first_campaign,
      p_latest_source, p_latest_medium, p_latest_campaign
    ]) as value
    where value is not null and value !~ '^[a-z0-9._-]{1,80}$'
  ) then
    raise exception 'invalid attribution token' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(array[p_first_landing, p_latest_landing]) as value
    where value is not null and value !~ '^/[^?#[:cntrl:]]{0,239}$'
  ) then
    raise exception 'invalid landing path' using errcode = '22023';
  end if;

  if not public.consume_web_ingest_quota('link', p_request_fingerprint) then
    return false;
  end if;

  insert into public.web_link_clicks (
    click_id, surface, ct, referrer_host,
    first_source, first_medium, first_campaign, first_referrer, first_landing,
    latest_source, latest_medium, latest_campaign, latest_referrer, latest_landing
  ) values (
    p_click_id, p_surface, coalesce(p_ct, 'website'), p_referrer_host,
    p_first_source, p_first_medium, p_first_campaign, p_first_referrer, p_first_landing,
    p_latest_source, p_latest_medium, p_latest_campaign, p_latest_referrer, p_latest_landing
  )
  on conflict (click_id) do nothing;
  return true;
end;
$$;

revoke all on function public.log_web_link_click(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.log_web_link_click(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to service_role;

comment on table public.web_link_clicks is
  'Website-only App Store handoff log. Rows retain no raw address, user-agent, or request fingerprint.';
comment on function public.log_web_link_click(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) is 'Service-role-only, constrained App Store handoff writer with server-derived request rate limiting.';
