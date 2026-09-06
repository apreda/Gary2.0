-- Account and billing fields are private. Permissive SELECT policies combine
-- with OR, so the legacy public-read policy defeated the existing owner check.
set local lock_timeout = '5s';
alter table public.users enable row level security;
drop policy if exists "Allow read access to all users" on public.users;
drop policy if exists "Users can view their own data" on public.users;
create policy users_read_own on public.users for select to authenticated
  using ((select auth.uid()) = id);

-- Clients have never had a write policy here; retain server-owned billing and
-- auth-trigger writes while removing the old default client grants.
revoke all on table public.users from anon, authenticated;
grant select on table public.users to authenticated;
