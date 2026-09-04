\set ON_ERROR_STOP on
-- Shapes independently verified against production; fixture-only missing tables.
create table public.bankroll(id bigint generated always as identity,user_id uuid references auth.users(id));
create table public.push_tokens(id uuid default gen_random_uuid(),identity_id text);
create table public.user_entitlements(id bigint generated always as identity,installation_id text);
\ir ../../migrations/20260904212639_complete_account_deletion.sql
insert into auth.users(id) values('10000000-0000-0000-0000-000000000005');
insert into public.bankroll(user_id) values('10000000-0000-0000-0000-000000000005'),('10000000-0000-0000-0000-000000000002');
insert into public.user_picks(user_id) values('10000000-0000-0000-0000-000000000005');
insert into public.push_tokens(identity_id) values('10000000-0000-0000-0000-000000000005'),('10000000-0000-0000-0000-000000000002');
insert into public.user_entitlements(installation_id) values('10000000-0000-0000-0000-000000000005'),('10000000-0000-0000-0000-000000000002');
insert into public.public_profiles(user_id,display_name) values('10000000-0000-0000-0000-000000000005','DeleteFive');
insert into public.user_preferences(user_id) values('10000000-0000-0000-0000-000000000005');
insert into public.account_deletion_requests(user_id) values('10000000-0000-0000-0000-000000000005');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',false);
select expect((select count(*) from public.account_deletion_requests)=0,'other account cannot see deletion intent');
select expect_error($q$insert into public.account_deletion_requests(user_id) values(auth.uid())$q$,'permission denied');
reset role;
-- A database cleanup error rolls back auth deletion and all dependent deletion.
create function public.refuse_test_deletion() returns trigger language plpgsql as $$begin raise exception 'fixture cleanup failure'; end$$;
create trigger test_deletion_failure before delete on public.user_entitlements for each row execute function public.refuse_test_deletion();
select expect_error($q$delete from auth.users where id='10000000-0000-0000-0000-000000000005'$q$,'fixture cleanup failure');
select expect((select count(*) from public.bankroll where user_id='10000000-0000-0000-0000-000000000005')=1,'partial cleanup is rolled back on deletion failure');
drop trigger test_deletion_failure on public.user_entitlements;
delete from auth.users where id='10000000-0000-0000-0000-000000000005';
select expect((select count(*) from public.bankroll where user_id='10000000-0000-0000-0000-000000000005')=0,'bankroll cleaned on account deletion');
select expect((select count(*) from public.user_picks where user_id='10000000-0000-0000-0000-000000000005')=0,'legacy picks cleaned on account deletion');
select expect((select count(*) from public.push_tokens where identity_id='10000000-0000-0000-0000-000000000005')=0,'owned device tokens cleaned on account deletion');
select expect((select count(*) from public.user_entitlements where installation_id='10000000-0000-0000-0000-000000000005')=0,'owned subscription records cleaned on account deletion');
select expect((select count(*) from public.user_preferences where user_id='10000000-0000-0000-0000-000000000005')=0,'preferences cascade on account deletion');
select expect((select count(*) from public.public_profiles where user_id='10000000-0000-0000-0000-000000000005')=0,'public identity cascades on account deletion');
select expect((select count(*) from public.account_deletion_requests where user_id='10000000-0000-0000-0000-000000000005')=0,'deletion intent cascades on account deletion');
select expect((select count(*) from public.push_tokens where identity_id='10000000-0000-0000-0000-000000000002')=1,'other accounts device tokens survive deletion');
