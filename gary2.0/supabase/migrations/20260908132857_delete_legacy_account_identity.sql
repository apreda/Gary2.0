-- The signup trigger writes public.users, which has no auth foreign key.
-- Remove only the deleting account's legacy identity in the existing atomic
-- cleanup. Retained orphan rows are deliberately outside this migration.
begin;
set local lock_timeout = '5s';

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
 -- Unlike the tables below, this signup-created identity has no cascade.
 delete from public.users where id=old.id;
 -- Bets, profile, streaks, preferences, deletion intent and cast exclusions
 -- already have ON DELETE CASCADE foreign keys into auth.users.
 return old;
end;
$$;

commit;
