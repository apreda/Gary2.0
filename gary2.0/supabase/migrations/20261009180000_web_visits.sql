-- Every website page load, counted without cookies or consent (founder,
-- Oct 9 2026: "count page and source only"). web_events only hears from
-- visitors who allow analytics, so it saw 15 people in 30 days. A row here
-- holds the page, where the visit came from and, for a crawler, its name:
-- no IP, no user agent string, no visitor or session id. The site's proxy
-- writes it with the service role; nobody else can read or write.

create table if not exists public.web_visits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  path text not null,
  source text not null,
  medium text not null,
  bot text,
  constraint web_visits_path check (char_length(path) between 1 and 200 and path like '/%'),
  constraint web_visits_source check (source ~ '^[a-z0-9._-]{1,64}$'),
  constraint web_visits_medium check (medium in ('direct', 'organic', 'social', 'referral', 'internal', 'campaign', 'crawler')),
  constraint web_visits_bot check (bot is null or bot ~ '^[a-z0-9_-]{1,32}$')
);

create index if not exists web_visits_created_at_idx on public.web_visits (created_at desc);

alter table public.web_visits enable row level security;
alter table public.web_visits force row level security;
revoke all on table public.web_visits from public, anon, authenticated;
grant select, insert on table public.web_visits to service_role;
revoke all on sequence public.web_visits_id_seq from public, anon, authenticated;
grant usage, select on sequence public.web_visits_id_seq to service_role;
