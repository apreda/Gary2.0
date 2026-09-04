-- Account deletion is a billing transition followed by one atomic database
-- deletion. Cancellation happens before auth deletion in the edge handler.
begin;
create table if not exists public.account_deletion_requests (
 user_id uuid primary key references auth.users(id) on delete cascade,
 requested_at timestamptz not null default now()
);
alter table public.account_deletion_requests enable row level security;
create policy account_deletion_requests_owner on public.account_deletion_requests for select to authenticated
using ((select auth.uid())=user_id);
grant select on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;
revoke all on public.account_deletion_requests from anon;

create or replace function user_experience_private.delete_account_dependents()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Subscription synchronization uses the same key. A late webhook observes
 -- the deleted user and cannot recreate their entitlement after this commits.
 perform pg_advisory_xact_lock(hashtextextended(old.id::text,914009));
 delete from public.bankroll where user_id=old.id;
 delete from public.user_picks where user_id=old.id;
 delete from public.push_tokens where identity_id=old.id::text;
 delete from public.user_entitlements where installation_id=old.id::text;
 -- Bets, profile, streaks, preferences, deletion intent and cast exclusions
 -- already have ON DELETE CASCADE foreign keys into auth.users.
 return old;
end;
$$;
drop trigger if exists gary_delete_account_dependents on auth.users;
create trigger gary_delete_account_dependents before delete on auth.users for each row
execute function user_experience_private.delete_account_dependents();
notify pgrst,'reload schema';
commit;
