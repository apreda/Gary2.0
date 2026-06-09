-- Conversion-funnel events for iOS + web (one shared table).
--
-- The app/web write events via the SECURITY DEFINER `log_app_event` RPC using
-- the anon key — same trust model as `register_push_token`: anon can INSERT
-- (through the function) but has no direct table privileges, so it can't read,
-- enumerate, or tamper. Analyse with your own service-role/dashboard access.
--
-- Funnel events emitted today:
--   paywall_viewed       { surface, trigger, sport_focus }
--   plan_selected        { plan, sport?, billing }
--   checkout_started     { plan, sport, surface }
--   checkout_blocked_signin { sport, surface }
-- (purchase_completed is written server-side by the Stripe webhook — see the
--  stripe handoff — so it can't be spoofed from a client.)

create table if not exists public.app_events (
  id          bigint generated always as identity primary key,
  event       text not null,
  identity    text,                 -- client_reference_id: auth user id or install id
  platform    text,                 -- 'ios' | 'web'
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists app_events_event_created_idx on public.app_events (event, created_at desc);
create index if not exists app_events_identity_idx on public.app_events (identity);

alter table public.app_events enable row level security;
-- No anon/authenticated policies: all writes go through the RPC below, all
-- reads go through privileged (service-role) access only.

create or replace function public.log_app_event(
  p_event    text,
  p_identity text default null,
  p_platform text default null,
  p_props    jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.app_events (event, identity, platform, props)
  values (p_event, p_identity, p_platform, coalesce(p_props, '{}'::jsonb));
$$;

-- The function is the only write path exposed to clients.
grant execute on function public.log_app_event(text, text, text, jsonb) to anon, authenticated;
