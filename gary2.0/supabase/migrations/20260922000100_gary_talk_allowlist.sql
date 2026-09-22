-- Talk to Gary: who may open the line while it is a founder preview, and the
-- private bucket the Mac worker writes Gary's spoken replies into.
-- The allowlist is read by the gary-talk edge function with the service role.
-- Rule: when the table has any rows, a caller whose email is not listed gets
-- 403; an empty table opens the line to every signed-in member.
begin;

create table if not exists public.gary_talk_allowlist (
  email text primary key check (email = lower(trim(email)) and email <> ''),
  added_at timestamptz not null default now()
);
comment on table public.gary_talk_allowlist is
  'Emails allowed to talk to Gary while the line is a preview. Service role only; no client policies.';
alter table public.gary_talk_allowlist enable row level security;
revoke all on public.gary_talk_allowlist from public, anon, authenticated;
grant select, insert, update, delete on public.gary_talk_allowlist to service_role;

insert into public.gary_talk_allowlist (email) values ('apreda31@gmail.com')
on conflict do nothing;

-- Spoken replies: <YYYY-MM-DD ET>/<job id>.wav, served through one-hour
-- signed URLs minted by the worker. Private: no object policies.
insert into storage.buckets (id, name, public) values ('gary-voice', 'gary-voice', false)
on conflict do nothing;

commit;
