-- Consented Book milestones contain no private bet or account fields.
-- Keep the existing event contract; extend it without backfilling historical activity.
alter table public.web_events drop constraint web_events_event;
alter table public.web_events add constraint web_events_event check (event in (
  'session_started', 'meaningful_pick_view', 'signup_started', 'signup_completed',
  'email_signup_completed', 'book_action_started', 'first_book_action',
  'book_opened', 'manual_bet_saved', 'manual_bet_settled',
  'return_visit', 'share_started', 'share_completed', 'app_store_handoff',
  'paywall_viewed', 'plan_selected'
));

create unique index web_events_book_milestone_idx on public.web_events (
  identity, event, (props ->> 'session_id')
) where event in ('book_opened', 'manual_bet_saved', 'manual_bet_settled');

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
    'session_id', 'first_source', 'first_medium', 'first_campaign', 'first_content', 'first_referrer', 'first_landing',
    'latest_source', 'latest_medium', 'latest_campaign', 'latest_content', 'latest_referrer', 'latest_landing'
  ];
  event_keys text[];
  required_keys text[];
  required_key text;
begin
  event_keys := case p_event
    when 'session_started' then array['path', 'session_id']
    when 'book_opened' then array['path', 'session_id']
    when 'manual_bet_saved' then array['path', 'session_id']
    when 'manual_bet_settled' then array['path', 'session_id']
    when 'meaningful_pick_view' then array['path', 'content_type', 'measurement_version']
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
    when 'session_started' then array['path', 'session_id']
    when 'book_opened' then array['path', 'session_id']
    when 'manual_bet_saved' then array['path', 'session_id']
    when 'manual_bet_settled' then array['path', 'session_id']
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
      'first_source', 'first_medium', 'first_campaign', 'first_content',
      'latest_source', 'latest_medium', 'latest_campaign', 'latest_content'
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

  if p_props ? 'session_id' and p_props ->> 'session_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid session identity' using errcode = '22023';
  end if;
  if p_props ? 'measurement_version' and p_props ->> 'measurement_version' <> 'reasoning_v2' then
    raise exception 'invalid reading measurement version' using errcode = '22023';
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
  if p_event in ('book_opened', 'manual_bet_saved', 'manual_bet_settled') and p_props ->> 'path' <> '/you' then
    raise exception 'invalid book milestone path' using errcode = '22023';
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
  values (p_event, p_identity, p_props)
  on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.log_web_event(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_web_event(text, uuid, text, jsonb) to service_role;

comment on table public.web_events is
  'Consent-gated website product analytics. Locked to service-role ingestion; separate from legacy app_events.';
comment on function public.log_web_event(text, uuid, text, jsonb) is
  'Closed-schema, service-role-only website event writer with server-derived request rate limiting.';
