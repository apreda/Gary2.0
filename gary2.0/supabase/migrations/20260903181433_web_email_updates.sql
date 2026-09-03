-- Website-only email subscriptions. These tables are intentionally not exposed
-- to anon/authenticated clients; Next.js server code accesses them with the
-- service-role key. No app, pick-generation, or grading objects are changed.

create table public.web_email_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  cadence text not null default 'both',
  pending_cadence text,
  sports text[] not null default array[]::text[],
  status text not null default 'pending',
  source text not null default 'website',
  consent_version text not null default '2026-09-03',
  pending_consent_version text,
  user_agent text,
  confirmation_token_hash text,
  confirmation_requested_at timestamptz,
  consented_at timestamptz,
  unsubscribed_at timestamptz,
  last_daily_sent_at timestamptz,
  last_weekly_sent_at timestamptz,
  suppressed_at timestamptz,
  suppression_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_email_subscriptions_email_normalized
    check (email = lower(btrim(email)) and length(email) between 3 and 320 and email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  constraint web_email_subscriptions_cadence
    check (cadence in ('daily', 'weekly', 'both')),
  constraint web_email_subscriptions_pending_cadence
    check (pending_cadence is null or pending_cadence in ('daily', 'weekly', 'both')),
  constraint web_email_subscriptions_status
    check (status in ('pending', 'active', 'unsubscribed', 'suppressed')),
  constraint web_email_subscriptions_confirmation_hash
    check (confirmation_token_hash is null or confirmation_token_hash ~ '^[0-9a-f]{64}$'),
  constraint web_email_subscriptions_source_length
    check (length(source) between 1 and 100),
  constraint web_email_subscriptions_consent_version_length
    check (length(consent_version) between 1 and 100),
  constraint web_email_subscriptions_pending_consent_version_length
    check (pending_consent_version is null or length(pending_consent_version) between 1 and 100),
  constraint web_email_subscriptions_user_agent_length
    check (user_agent is null or length(user_agent) <= 500),
  constraint web_email_subscriptions_suppression_reason_length
    check (suppression_reason is null or length(suppression_reason) <= 100),
  constraint web_email_subscriptions_sports
    check (sports <@ array['nba', 'nfl', 'nhl', 'mlb', 'ncaab', 'ncaaf']::text[])
);

create index web_email_subscriptions_active_cadence_idx
  on public.web_email_subscriptions (cadence, id)
  where status = 'active';

alter table public.web_email_subscriptions enable row level security;
alter table public.web_email_subscriptions force row level security;
revoke all on table public.web_email_subscriptions from public, anon, authenticated;
grant select, insert, update on table public.web_email_subscriptions to service_role;

comment on table public.web_email_subscriptions is
  'Website email-update consent and delivery preferences. Service-role only.';

create table public.web_email_consent_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.web_email_subscriptions(id) on delete cascade,
  event text not null,
  cadence text not null,
  consent_version text not null,
  source text not null,
  occurred_at timestamptz not null default now(),
  constraint web_email_consent_events_event check (event in ('confirmed', 'unsubscribed')),
  constraint web_email_consent_events_cadence check (cadence in ('daily', 'weekly', 'both')),
  constraint web_email_consent_events_version_length check (length(consent_version) between 1 and 100),
  constraint web_email_consent_events_source_length check (length(source) between 1 and 100)
);

create index web_email_consent_events_subscription_idx
  on public.web_email_consent_events (subscription_id, occurred_at desc);

alter table public.web_email_consent_events enable row level security;
alter table public.web_email_consent_events force row level security;
revoke all on table public.web_email_consent_events from public, anon, authenticated;
grant select, insert on table public.web_email_consent_events to service_role;

-- Every bearer token included in an accepted message is stored only as a hash.
-- Validation consults this ledger, so links issued before a secret rotation keep
-- working while the current signing secret can still mint future tokens.
create table public.web_email_unsubscribe_tokens (
  subscription_id uuid not null references public.web_email_subscriptions(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  primary key (subscription_id, token_hash),
  constraint web_email_unsubscribe_tokens_hash check (token_hash ~ '^[0-9a-f]{64}$')
);

alter table public.web_email_unsubscribe_tokens enable row level security;
alter table public.web_email_unsubscribe_tokens force row level security;
revoke all on table public.web_email_unsubscribe_tokens from public, anon, authenticated;
grant select, insert on table public.web_email_unsubscribe_tokens to service_role;

create table public.web_email_signup_rate_limits (
  fingerprint_hash text not null,
  scope text not null,
  bucket_start timestamptz not null,
  attempts integer not null default 1,
  primary key (fingerprint_hash, scope, bucket_start),
  constraint web_email_signup_rate_limits_hash check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  constraint web_email_signup_rate_limits_scope check (scope in ('ip_minute', 'ip_hour', 'ip_day', 'global_hour', 'global_day')),
  constraint web_email_signup_rate_limits_attempts check (attempts > 0)
);

create index web_email_signup_rate_limits_bucket_idx
  on public.web_email_signup_rate_limits (bucket_start);

alter table public.web_email_signup_rate_limits enable row level security;
alter table public.web_email_signup_rate_limits force row level security;
revoke all on table public.web_email_signup_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.web_email_signup_rate_limits to service_role;

create or replace function public.request_web_email_subscription(
  p_email text,
  p_cadence text,
  p_source text,
  p_user_agent text,
  p_token_hash text,
  p_fingerprint_hash text,
  p_consent_version text
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  subscription public.web_email_subscriptions%rowtype;
  should_send boolean := false;
  global_fingerprint constant text := repeat('0', 64);
begin
  -- Layered per-address limits. Check these before consuming the global quota,
  -- so one blocked source cannot exhaust confirmation capacity for everyone.
  insert into public.web_email_signup_rate_limits (fingerprint_hash, scope, bucket_start, attempts)
  values
    (p_fingerprint_hash, 'ip_minute', date_trunc('minute', statement_timestamp()), 1),
    (p_fingerprint_hash, 'ip_hour', date_trunc('hour', statement_timestamp()), 1),
    (p_fingerprint_hash, 'ip_day', date_trunc('day', statement_timestamp()), 1)
  on conflict (fingerprint_hash, scope, bucket_start)
  do update set attempts = public.web_email_signup_rate_limits.attempts + 1;

  if exists (
    select 1 from public.web_email_signup_rate_limits
    where fingerprint_hash = p_fingerprint_hash
      and (
        (scope = 'ip_minute' and bucket_start = date_trunc('minute', statement_timestamp()) and attempts > 3)
        or (scope = 'ip_hour' and bucket_start = date_trunc('hour', statement_timestamp()) and attempts > 6)
        or (scope = 'ip_day' and bucket_start = date_trunc('day', statement_timestamp()) and attempts > 12)
      )
  ) then
    raise exception 'email signup rate limit exceeded' using errcode = '54000';
  end if;

  insert into public.web_email_subscriptions (
    email, cadence, pending_cadence, status, source, consent_version,
    pending_consent_version, user_agent, confirmation_token_hash,
    confirmation_requested_at
  ) values (
    p_email, p_cadence, p_cadence, 'pending', p_source, p_consent_version,
    p_consent_version, p_user_agent, p_token_hash, statement_timestamp()
  )
  on conflict (email) do nothing
  returning * into subscription;

  if found then
    should_send := true;
  else
    select * into subscription
    from public.web_email_subscriptions
    where email = p_email
    for update;

    if subscription.status = 'suppressed' then
      should_send := false;
    elsif subscription.status = 'active'
      and subscription.cadence = p_cadence
      and subscription.consent_version = p_consent_version then
      should_send := false;
    elsif subscription.confirmation_requested_at is null
      or subscription.confirmation_requested_at < statement_timestamp() - interval '20 hours' then
      update public.web_email_subscriptions
      set pending_cadence = p_cadence,
          pending_consent_version = p_consent_version,
          source = p_source,
          user_agent = p_user_agent,
          confirmation_token_hash = p_token_hash,
          confirmation_requested_at = statement_timestamp(),
          updated_at = statement_timestamp()
      where id = subscription.id
      returning * into subscription;
      should_send := true;
    end if;
  end if;

  if should_send then
    -- Preserve headroom under the sender's launch quota even if an attacker
    -- distributes requests across many addresses. No-send requests do not
    -- consume this capacity.
    insert into public.web_email_signup_rate_limits (fingerprint_hash, scope, bucket_start, attempts)
    values
      (global_fingerprint, 'global_hour', date_trunc('hour', statement_timestamp()), 1),
      (global_fingerprint, 'global_day', date_trunc('day', statement_timestamp()), 1)
    on conflict (fingerprint_hash, scope, bucket_start)
    do update set attempts = public.web_email_signup_rate_limits.attempts + 1;

    if exists (
      select 1 from public.web_email_signup_rate_limits
      where fingerprint_hash = global_fingerprint
        and (
          (scope = 'global_hour' and bucket_start = date_trunc('hour', statement_timestamp()) and attempts > 50)
          or (scope = 'global_day' and bucket_start = date_trunc('day', statement_timestamp()) and attempts > 80)
        )
    ) then
      raise exception 'email signup capacity exceeded' using errcode = '54000';
    end if;
  end if;

  return jsonb_build_object(
    'id', subscription.id,
    'email', subscription.email,
    'cadence', subscription.cadence,
    'pending_cadence', subscription.pending_cadence,
    'status', subscription.status,
    'consented_at', subscription.consented_at,
    'confirmation_requested_at', subscription.confirmation_requested_at,
    'last_daily_sent_at', subscription.last_daily_sent_at,
    'last_weekly_sent_at', subscription.last_weekly_sent_at,
    'send_confirmation', should_send
  );
end;
$$;

create or replace function public.confirm_web_email_subscription(
  p_id uuid,
  p_token_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  subscription public.web_email_subscriptions%rowtype;
begin
  update public.web_email_subscriptions
  set cadence = pending_cadence,
      pending_cadence = null,
      status = 'active',
      consent_version = pending_consent_version,
      pending_consent_version = null,
      confirmation_token_hash = null,
      confirmation_requested_at = null,
      consented_at = statement_timestamp(),
      unsubscribed_at = null,
      updated_at = statement_timestamp()
  where id = p_id
    and pending_cadence is not null
    and pending_consent_version is not null
    and confirmation_token_hash = p_token_hash
    and confirmation_requested_at >= statement_timestamp() - interval '24 hours'
  returning * into subscription;

  if not found then
    return null;
  end if;

  insert into public.web_email_consent_events (
    subscription_id, event, cadence, consent_version, source, occurred_at
  ) values (
    subscription.id, 'confirmed', subscription.cadence,
    subscription.consent_version, subscription.source, subscription.consented_at
  );

  return jsonb_build_object(
    'id', subscription.id,
    'cadence', subscription.cadence,
    'source', subscription.source,
    'status', subscription.status
  );
end;
$$;

create or replace function public.is_web_email_unsubscribe_token_valid(
  p_id uuid,
  p_token_hash text
) returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.web_email_unsubscribe_tokens
    where subscription_id = p_id
      and token_hash = p_token_hash
  );
$$;

create or replace function public.unsubscribe_web_email_subscription(
  p_id uuid,
  p_token_hash text
) returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  subscription public.web_email_subscriptions%rowtype;
begin
  select s.* into subscription
  from public.web_email_subscriptions s
  join public.web_email_unsubscribe_tokens t on t.subscription_id = s.id
  where s.id = p_id
    and t.token_hash = p_token_hash
  for update of s;

  if not found then
    return false;
  end if;

  -- A provider suppression is stronger than a normal opt-out. Keep that state,
  -- while treating its already-valid footer link as a successful request.
  if subscription.status not in ('unsubscribed', 'suppressed') then
    update public.web_email_subscriptions
    set status = 'unsubscribed',
        pending_cadence = null,
        pending_consent_version = null,
        confirmation_token_hash = null,
        confirmation_requested_at = null,
        unsubscribed_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where id = subscription.id
    returning * into subscription;

    insert into public.web_email_consent_events (
      subscription_id, event, cadence, consent_version, source, occurred_at
    ) values (
      subscription.id, 'unsubscribed', subscription.cadence,
      subscription.consent_version, subscription.source, subscription.unsubscribed_at
    );
  end if;

  return true;
end;
$$;

revoke all on function public.request_web_email_subscription(text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.confirm_web_email_subscription(uuid, text) from public, anon, authenticated;
revoke all on function public.is_web_email_unsubscribe_token_valid(uuid, text) from public, anon, authenticated;
revoke all on function public.unsubscribe_web_email_subscription(uuid, text) from public, anon, authenticated;
grant execute on function public.request_web_email_subscription(text, text, text, text, text, text, text) to service_role;
grant execute on function public.confirm_web_email_subscription(uuid, text) to service_role;
grant execute on function public.is_web_email_unsubscribe_token_valid(uuid, text) to service_role;
grant execute on function public.unsubscribe_web_email_subscription(uuid, text) to service_role;

create table public.web_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.web_email_subscriptions(id) on delete cascade,
  kind text not null,
  content_key text not null,
  idempotency_key text not null unique,
  status text not null default 'queued',
  provider_id text,
  error_code text,
  provider_event_at timestamptz,
  capacity_reserved_at timestamptz,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint web_email_deliveries_kind check (kind in ('confirmation', 'daily_board', 'weekly_record')),
  constraint web_email_deliveries_status check (status in ('queued', 'sent', 'delivered', 'request_failed', 'provider_failed', 'bounced', 'complained', 'suppressed', 'skipped')),
  constraint web_email_deliveries_content_key_length check (length(content_key) between 1 and 100),
  constraint web_email_deliveries_error_code_length check (error_code is null or length(error_code) <= 100)
);

create unique index web_email_deliveries_subscription_content_idx
  on public.web_email_deliveries (subscription_id, kind, content_key);

create unique index web_email_deliveries_provider_id_idx
  on public.web_email_deliveries (provider_id)
  where provider_id is not null;

create index web_email_deliveries_status_attempted_idx
  on public.web_email_deliveries (status, attempted_at desc);

alter table public.web_email_deliveries enable row level security;
alter table public.web_email_deliveries force row level security;
revoke all on table public.web_email_deliveries from public, anon, authenticated;
grant select, insert, update on table public.web_email_deliveries to service_role;

comment on table public.web_email_deliveries is
  'Idempotent website email delivery ledger. Service-role only.';

create or replace function public.claim_web_email_delivery(
  p_subscription_id uuid,
  p_kind text,
  p_content_key text,
  p_idempotency_key text,
  p_unsubscribe_token_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  subscription public.web_email_subscriptions%rowtype;
  delivery public.web_email_deliveries%rowtype;
  eligible boolean := false;
  now_at timestamptz := statement_timestamp();
begin
  -- This row lock makes the eligibility decision and delivery claim atomic
  -- with unsubscribe, cadence changes, and provider suppression updates.
  select * into subscription
  from public.web_email_subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    return jsonb_build_object('state', 'ineligible');
  end if;

  eligible := case p_kind
    when 'confirmation' then
      subscription.status <> 'suppressed'
      and subscription.pending_cadence is not null
      and subscription.confirmation_token_hash = p_content_key
      and subscription.confirmation_requested_at >= now_at - interval '24 hours'
    when 'daily_board' then
      subscription.status = 'active' and subscription.cadence in ('daily', 'both')
    when 'weekly_record' then
      subscription.status = 'active' and subscription.cadence in ('weekly', 'both')
    else false
  end;

  if not eligible then
    return jsonb_build_object('state', 'ineligible');
  end if;

  insert into public.web_email_deliveries (
    subscription_id, kind, content_key, idempotency_key, status, attempted_at
  ) values (
    p_subscription_id, p_kind, p_content_key, p_idempotency_key, 'queued', now_at
  )
  on conflict (subscription_id, kind, content_key) do nothing
  returning * into delivery;

  if not found then
    select * into delivery
    from public.web_email_deliveries
    where subscription_id = p_subscription_id
      and kind = p_kind
      and content_key = p_content_key
    for update;

    -- Only uncertain request failures and abandoned pre-send claims retry.
    -- An asynchronous provider-final failure is never replayed with the
    -- already-consumed idempotency key.
    if delivery.status in ('request_failed', 'queued')
      and delivery.attempted_at >= now_at - interval '23 hours'
      and delivery.attempted_at < now_at - interval '15 minutes' then
      update public.web_email_deliveries
      set status = 'queued',
          provider_id = null,
          error_code = null,
          attempted_at = now_at,
          updated_at = now_at
      where id = delivery.id
      returning * into delivery;
    else
      return jsonb_build_object('state', 'duplicate');
    end if;
  end if;

  insert into public.web_email_unsubscribe_tokens (subscription_id, token_hash)
  values (p_subscription_id, p_unsubscribe_token_hash)
  on conflict (subscription_id, token_hash) do nothing;

  return jsonb_build_object(
    'state', 'claimed',
    'id', delivery.id,
    'status', delivery.status,
    'subscription_id', delivery.subscription_id
  );
end;
$$;

create or replace function public.is_web_email_delivery_eligible(
  p_delivery_id uuid,
  p_subscription_id uuid,
  p_kind text
) returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.web_email_deliveries d
    join public.web_email_subscriptions s on s.id = d.subscription_id
    where d.id = p_delivery_id
      and d.subscription_id = p_subscription_id
      and d.kind = p_kind
      and d.status = 'queued'
      and case p_kind
        when 'confirmation' then
          s.status <> 'suppressed'
          and s.pending_cadence is not null
          and s.confirmation_token_hash = d.content_key
          and s.confirmation_requested_at >= statement_timestamp() - interval '24 hours'
        when 'daily_board' then s.status = 'active' and s.cadence in ('daily', 'both')
        when 'weekly_record' then s.status = 'active' and s.cadence in ('weekly', 'both')
        else false
      end
  );
$$;

-- One row serializes provider request starts across every Vercel process and
-- every API key used by this website. The 550ms default stays below a two-
-- request-per-second account limit with headroom for clock/network variance.
create table public.web_email_provider_state (
  singleton boolean primary key default true,
  next_slot_at timestamptz not null default '-infinity',
  updated_at timestamptz not null default now(),
  constraint web_email_provider_state_singleton check (singleton)
);

insert into public.web_email_provider_state (singleton) values (true);

alter table public.web_email_provider_state enable row level security;
alter table public.web_email_provider_state force row level security;
revoke all on table public.web_email_provider_state from public, anon, authenticated;
grant select, update on table public.web_email_provider_state to service_role;

create or replace function public.reserve_web_email_provider_slot(
  p_spacing_ms integer default 550,
  p_max_wait_ms integer default 15000
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  slot_at timestamptz;
  wait_ms integer;
begin
  if p_spacing_ms < 500 or p_spacing_ms > 5000
    or p_max_wait_ms < 0 or p_max_wait_ms > 30000 then
    raise exception 'invalid email provider slot limits' using errcode = '22023';
  end if;

  select greatest(next_slot_at, clock_timestamp()) into slot_at
  from public.web_email_provider_state
  where singleton = true
  for update;

  wait_ms := greatest(
    0,
    ceil(extract(epoch from (slot_at - clock_timestamp())) * 1000)::integer
  );

  if wait_ms > p_max_wait_ms then
    return jsonb_build_object('granted', false, 'wait_ms', wait_ms);
  end if;

  update public.web_email_provider_state
  set next_slot_at = slot_at + make_interval(secs => p_spacing_ms::double precision / 1000.0),
      updated_at = clock_timestamp()
  where singleton = true;

  return jsonb_build_object('granted', true, 'wait_ms', wait_ms);
end;
$$;

-- Conservative local accounting for Resend's free transactional allowance.
-- The 90/day and 2,700/month defaults retain a ten-percent margin for inbound
-- or out-of-band traffic; confirmation sends cannot consume campaign reserve.
create table public.web_email_provider_capacity (
  period text not null,
  bucket_start date not null,
  reserved_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (period, bucket_start),
  constraint web_email_provider_capacity_period check (period in ('day', 'month')),
  constraint web_email_provider_capacity_count check (reserved_count >= 0)
);

alter table public.web_email_provider_capacity enable row level security;
alter table public.web_email_provider_capacity force row level security;
revoke all on table public.web_email_provider_capacity from public, anon, authenticated;
grant select, insert, update, delete on table public.web_email_provider_capacity to service_role;

create or replace function public.reserve_web_email_provider_capacity(
  p_delivery_id uuid,
  p_daily_limit integer default 90,
  p_monthly_limit integer default 2700,
  p_daily_campaign_reserve integer default 20,
  p_monthly_campaign_reserve integer default 600
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  delivery public.web_email_deliveries%rowtype;
  day_bucket date := (clock_timestamp() at time zone 'UTC')::date;
  month_bucket date := date_trunc('month', clock_timestamp() at time zone 'UTC')::date;
  day_used integer;
  month_used integer;
  day_ceiling integer;
  month_ceiling integer;
begin
  if p_daily_limit < 1 or p_monthly_limit < 1
    or p_daily_campaign_reserve < 0 or p_daily_campaign_reserve >= p_daily_limit
    or p_monthly_campaign_reserve < 0 or p_monthly_campaign_reserve >= p_monthly_limit then
    raise exception 'invalid email capacity limits' using errcode = '22023';
  end if;

  select * into delivery
  from public.web_email_deliveries
  where id = p_delivery_id
  for update;

  if not found or delivery.status <> 'queued' then
    return jsonb_build_object('granted', false, 'reason', 'delivery_not_queued');
  end if;

  insert into public.web_email_provider_capacity (period, bucket_start)
  values ('day', day_bucket), ('month', month_bucket)
  on conflict (period, bucket_start) do nothing;

  -- All callers lock the shared rows in the same order.
  select reserved_count into day_used
  from public.web_email_provider_capacity
  where period = 'day' and bucket_start = day_bucket
  for update;

  select reserved_count into month_used
  from public.web_email_provider_capacity
  where period = 'month' and bucket_start = month_bucket
  for update;

  if delivery.capacity_reserved_at is not null then
    return jsonb_build_object(
      'granted', true,
      'already_reserved', true,
      'daily_used', day_used,
      'daily_limit', p_daily_limit,
      'monthly_used', month_used,
      'monthly_limit', p_monthly_limit
    );
  end if;

  day_ceiling := case when delivery.kind = 'confirmation'
    then p_daily_limit - p_daily_campaign_reserve else p_daily_limit end;
  month_ceiling := case when delivery.kind = 'confirmation'
    then p_monthly_limit - p_monthly_campaign_reserve else p_monthly_limit end;

  if day_used >= day_ceiling or month_used >= month_ceiling then
    return jsonb_build_object(
      'granted', false,
      'reason', 'capacity_exhausted',
      'daily_used', day_used,
      'daily_limit', p_daily_limit,
      'monthly_used', month_used,
      'monthly_limit', p_monthly_limit
    );
  end if;

  update public.web_email_provider_capacity
  set reserved_count = reserved_count + 1,
      updated_at = clock_timestamp()
  where (period = 'day' and bucket_start = day_bucket)
     or (period = 'month' and bucket_start = month_bucket);

  update public.web_email_deliveries
  set capacity_reserved_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = delivery.id;

  return jsonb_build_object(
    'granted', true,
    'already_reserved', false,
    'daily_used', day_used + 1,
    'daily_limit', p_daily_limit,
    'monthly_used', month_used + 1,
    'monthly_limit', p_monthly_limit
  );
end;
$$;

create table public.web_email_campaign_leases (
  kind text not null,
  content_key text not null,
  owner_id uuid not null,
  lease_until timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (kind, content_key),
  constraint web_email_campaign_leases_kind check (kind in ('daily_board', 'weekly_record')),
  constraint web_email_campaign_leases_content_key_length check (length(content_key) between 1 and 100)
);

alter table public.web_email_campaign_leases enable row level security;
alter table public.web_email_campaign_leases force row level security;
revoke all on table public.web_email_campaign_leases from public, anon, authenticated;
grant select, insert, update, delete on table public.web_email_campaign_leases to service_role;

create or replace function public.acquire_web_email_campaign_lease(
  p_kind text,
  p_content_key text,
  p_owner_id uuid,
  p_lease_seconds integer default 330
) returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  acquired_owner uuid;
begin
  if p_lease_seconds < 30 or p_lease_seconds > 600 then
    raise exception 'invalid email campaign lease duration' using errcode = '22023';
  end if;

  insert into public.web_email_campaign_leases (
    kind, content_key, owner_id, lease_until, updated_at
  ) values (
    p_kind, p_content_key, p_owner_id,
    clock_timestamp() + make_interval(secs => p_lease_seconds), clock_timestamp()
  )
  on conflict (kind, content_key) do update
  set owner_id = excluded.owner_id,
      lease_until = excluded.lease_until,
      updated_at = excluded.updated_at
  where public.web_email_campaign_leases.lease_until <= clock_timestamp()
     or public.web_email_campaign_leases.owner_id = excluded.owner_id
  returning owner_id into acquired_owner;

  return coalesce(acquired_owner = p_owner_id, false);
end;
$$;

create or replace function public.release_web_email_campaign_lease(
  p_kind text,
  p_content_key text,
  p_owner_id uuid
) returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  delete from public.web_email_campaign_leases
  where kind = p_kind
    and content_key = p_content_key
    and owner_id = p_owner_id;
$$;

create table public.web_email_provider_events (
  svix_id text primary key,
  provider_id text not null,
  event_type text not null,
  event_at timestamptz not null,
  recipients text[] not null default array[]::text[],
  campaign_tag text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint web_email_provider_events_svix_length check (length(svix_id) between 1 and 200),
  constraint web_email_provider_events_provider_id_length check (length(provider_id) between 1 and 200),
  constraint web_email_provider_events_type check (event_type in ('email.delivered', 'email.bounced', 'email.complained', 'email.failed', 'email.suppressed')),
  constraint web_email_provider_events_campaign_tag check (
    campaign_tag is null
    or campaign_tag in ('confirmation', 'daily-board', 'weekly-record')
  )
);

create index web_email_provider_events_unprocessed_idx
  on public.web_email_provider_events (provider_id, event_at, svix_id)
  where processed_at is null;

alter table public.web_email_provider_events enable row level security;
alter table public.web_email_provider_events force row level security;
revoke all on table public.web_email_provider_events from public, anon, authenticated;
grant select, insert, update, delete on table public.web_email_provider_events to service_role;

create or replace function public.reconcile_web_email_provider_events(
  p_provider_id text
) returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  event_row public.web_email_provider_events%rowtype;
  delivery_row public.web_email_deliveries%rowtype;
  delivery_found boolean;
  next_status text;
  applied_subscription_id uuid;
  processed_count integer := 0;
  is_suppression boolean;
  incoming_rank integer;
begin
  for event_row in
    select *
    from public.web_email_provider_events
    where provider_id = p_provider_id
      and processed_at is null
    order by event_at, svix_id
    for update
  loop
    select * into delivery_row
    from public.web_email_deliveries
    where provider_id = p_provider_id
    for update;
    delivery_found := found;

    next_status := case event_row.event_type
      when 'email.delivered' then 'delivered'
      when 'email.bounced' then 'bounced'
      when 'email.complained' then 'complained'
      when 'email.failed' then 'provider_failed'
      when 'email.suppressed' then 'suppressed'
    end;
    is_suppression := next_status in ('bounced', 'complained', 'suppressed');
    incoming_rank := case
      when is_suppression then 4
      when next_status = 'delivered' then 3
      when next_status = 'provider_failed' then 2
      else 1
    end;
    applied_subscription_id := null;

    if delivery_found then
      update public.web_email_deliveries
      set status = next_status,
          provider_event_at = greatest(
            coalesce(provider_event_at, event_row.event_at),
            event_row.event_at
          ),
          error_code = case when next_status = 'provider_failed' then 'provider_failed' else null end,
          updated_at = clock_timestamp()
      where id = delivery_row.id
        and (
          incoming_rank > case
            when status in ('bounced', 'complained', 'suppressed') then 4
            when status = 'delivered' then 3
            when status = 'provider_failed' then 2
            else 1
          end
          or (
            incoming_rank = case
              when status in ('bounced', 'complained', 'suppressed') then 4
              when status = 'delivered' then 3
              when status = 'provider_failed' then 2
              else 1
            end
            and event_row.event_at >= coalesce(provider_event_at, '-infinity'::timestamptz)
          )
        )
      returning subscription_id into applied_subscription_id;

      if is_suppression and applied_subscription_id is not null then
        update public.web_email_subscriptions
        set status = 'suppressed',
            suppressed_at = event_row.event_at,
            suppression_reason = next_status,
            pending_cadence = null,
            pending_consent_version = null,
            confirmation_token_hash = null,
            confirmation_requested_at = null,
            updated_at = clock_timestamp()
        where id = applied_subscription_id
          and (suppressed_at is null or event_row.event_at >= suppressed_at);
      end if;

      update public.web_email_provider_events
      set processed_at = clock_timestamp()
      where svix_id = event_row.svix_id;
      processed_count := processed_count + 1;
    elsif is_suppression
      and event_row.campaign_tag in ('confirmation', 'daily-board', 'weekly-record') then
      -- A terminal event can arrive before the provider ID is checkpointed.
      -- Only a verified Gary campaign tag authorizes recipient-only fallback;
      -- otherwise unrelated sends sharing this Resend account could suppress a
      -- website subscriber. Leave the event pending so an eventual authoritative
      -- provider-ID checkpoint can still reconcile the delivery ledger.
      update public.web_email_subscriptions
      set status = 'suppressed',
          suppressed_at = event_row.event_at,
          suppression_reason = next_status,
          pending_cadence = null,
          pending_consent_version = null,
          confirmation_token_hash = null,
          confirmation_requested_at = null,
          updated_at = clock_timestamp()
      where email = any(event_row.recipients)
        and (suppressed_at is null or event_row.event_at >= suppressed_at);
    end if;
  end loop;

  return processed_count;
end;
$$;

create or replace function public.record_web_email_provider_event(
  p_svix_id text,
  p_provider_id text,
  p_event_type text,
  p_event_at timestamptz,
  p_recipients text[],
  p_campaign_tag text default null
) returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  insert into public.web_email_provider_events (
    svix_id, provider_id, event_type, event_at, recipients, campaign_tag
  ) values (
    p_svix_id,
    p_provider_id,
    p_event_type,
    p_event_at,
    coalesce(
      array(
        select distinct lower(btrim(recipient))
        from unnest(p_recipients) as recipient
        where recipient is not null and btrim(recipient) <> ''
      ),
      array[]::text[]
    ),
    case
      when p_campaign_tag in ('confirmation', 'daily-board', 'weekly-record')
        then p_campaign_tag
      else null
    end
  )
  on conflict (svix_id) do nothing;

  return public.reconcile_web_email_provider_events(p_provider_id);
end;
$$;

create or replace function public.finish_web_email_delivery(
  p_delivery_id uuid,
  p_subscription_id uuid,
  p_kind text,
  p_status text,
  p_provider_id text default null,
  p_error_code text default null
) returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  delivery public.web_email_deliveries%rowtype;
  finished_at timestamptz := statement_timestamp();
begin
  if p_status not in ('sent', 'request_failed', 'provider_failed', 'skipped')
    or (p_status = 'sent' and coalesce(length(p_provider_id), 0) = 0)
    or (p_status <> 'sent' and p_provider_id is not null) then
    raise exception 'invalid email delivery finish state' using errcode = '22023';
  end if;

  select * into delivery
  from public.web_email_deliveries
  where id = p_delivery_id
    and subscription_id = p_subscription_id
    and kind = p_kind
  for update;

  if not found then
    return false;
  end if;

  -- Only the owner of an active claim may finish it. Webhook terminal states
  -- and a previously completed idempotent result are never downgraded.
  if delivery.status <> 'queued' then
    return delivery.status = p_status
      and (p_provider_id is null or delivery.provider_id = p_provider_id);
  end if;

  update public.web_email_deliveries
  set status = p_status,
      provider_id = p_provider_id,
      error_code = left(p_error_code, 100),
      sent_at = case when p_status = 'sent' then finished_at else null end,
      updated_at = finished_at
  where id = delivery.id;

  if p_status = 'sent' and p_kind in ('daily_board', 'weekly_record') then
    update public.web_email_subscriptions
    set last_daily_sent_at = case when p_kind = 'daily_board' then finished_at else last_daily_sent_at end,
        last_weekly_sent_at = case when p_kind = 'weekly_record' then finished_at else last_weekly_sent_at end,
        updated_at = finished_at
    where id = p_subscription_id;
  end if;

  if p_status = 'sent' then
    perform public.reconcile_web_email_provider_events(p_provider_id);
  end if;

  return true;
end;
$$;

create or replace function public.cleanup_web_email_operational_data()
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from public.web_email_signup_rate_limits
  where bucket_start < statement_timestamp() - interval '2 days';

  delete from public.web_email_campaign_leases
  where lease_until < statement_timestamp() - interval '2 days';

  delete from public.web_email_provider_capacity
  where bucket_start < current_date - 400;

  delete from public.web_email_provider_events
  where received_at < statement_timestamp() - interval '180 days';
end;
$$;

revoke all on function public.claim_web_email_delivery(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.is_web_email_delivery_eligible(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reserve_web_email_provider_slot(integer, integer) from public, anon, authenticated;
revoke all on function public.reserve_web_email_provider_capacity(uuid, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.acquire_web_email_campaign_lease(text, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_web_email_campaign_lease(text, text, uuid) from public, anon, authenticated;
revoke all on function public.reconcile_web_email_provider_events(text) from public, anon, authenticated;
revoke all on function public.record_web_email_provider_event(text, text, text, timestamptz, text[], text) from public, anon, authenticated;
revoke all on function public.finish_web_email_delivery(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.cleanup_web_email_operational_data() from public, anon, authenticated;

grant execute on function public.claim_web_email_delivery(uuid, text, text, text, text) to service_role;
grant execute on function public.is_web_email_delivery_eligible(uuid, uuid, text) to service_role;
grant execute on function public.reserve_web_email_provider_slot(integer, integer) to service_role;
grant execute on function public.reserve_web_email_provider_capacity(uuid, integer, integer, integer, integer) to service_role;
grant execute on function public.acquire_web_email_campaign_lease(text, text, uuid, integer) to service_role;
grant execute on function public.release_web_email_campaign_lease(text, text, uuid) to service_role;
grant execute on function public.reconcile_web_email_provider_events(text) to service_role;
grant execute on function public.record_web_email_provider_event(text, text, text, timestamptz, text[], text) to service_role;
grant execute on function public.finish_web_email_delivery(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.cleanup_web_email_operational_data() to service_role;

-- Make the stated short retention deterministic even during long periods with
-- no signup traffic. Supabase provides pg_cron in this project already.
select cron.unschedule(jobid)
from cron.job
where jobname = 'cleanup-web-email-signup-rate-limits';

select cron.schedule(
  'cleanup-web-email-signup-rate-limits',
  '17 4 * * *',
  $$select public.cleanup_web_email_operational_data()$$
);
