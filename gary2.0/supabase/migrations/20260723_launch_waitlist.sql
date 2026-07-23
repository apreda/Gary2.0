-- NFL fall-launch waitlist: public email capture from betwithgary.ai/nfl.
-- Same trust model as link_clicks: anon may INSERT one row, never read the
-- list back (no SELECT policy; service-role reads bypass RLS). Idempotent —
-- safe to re-apply.

create table if not exists public.launch_waitlist (
  id bigint generated always as identity primary key,
  email text not null unique,
  source text,
  user_agent text,
  ts timestamptz not null default now()
);

alter table public.launch_waitlist enable row level security;

drop policy if exists waitlist_anon_insert on public.launch_waitlist;
create policy waitlist_anon_insert on public.launch_waitlist
  for insert to anon, authenticated
  with check (
    char_length(email) <= 320
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and (source is null or char_length(source) <= 64)
    and (user_agent is null or char_length(user_agent) <= 400)
  );
