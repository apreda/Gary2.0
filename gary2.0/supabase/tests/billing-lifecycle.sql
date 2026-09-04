-- Run in an isolated local DB with name gary_billing_lifecycle_test_*.
select current_database() like 'gary_billing_lifecycle_test_%' as safe_database \gset
\if :safe_database
\else
 \echo 'Refusing to run billing fixtures outside a disposable billing database'
 \quit 1
\endif
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
create table auth.users(id uuid primary key);
create table public.user_entitlements(
 id bigint generated always as identity primary key,installation_id text,product_key text,pass_type text,status text,
 stripe_session_id text unique,stripe_subscription_id text,stripe_customer_id text,expires_at timestamptz,
 livemode boolean not null default true,cancel_at_period_end boolean,event_created bigint not null default 0
);
create unique index user_entitlements_subscription_sport on public.user_entitlements(stripe_subscription_id,product_key,livemode)
where stripe_subscription_id is not null;
\ir ../migrations/20260904220001_billing_checkout_lifecycle.sql
create function public.assert_ok(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end$$;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
insert into auth.users values('10000000-0000-0000-0000-000000000001');
select public.sync_subscription_access('sub_terminal','10000000-0000-0000-0000-000000000001',array['ALL'],'monthly','active',now()+interval '1 month',false,'cus_a',true,20);
select public.sync_subscription_access('sub_terminal',null,null,null,'canceled',now(),false,'cus_a',true,20);
select public.sync_subscription_access('sub_terminal',null,null,null,'active',now()+interval '1 month',false,'cus_a',true,20);
select assert_ok((select status='canceled' from user_entitlements where stripe_subscription_id='sub_terminal'),'same-second delayed active cannot resurrect canceled subscription');
select public.sync_subscription_access('sub_terminal',null,null,null,'active',now()+interval '1 month',false,'cus_a',true,99);
select assert_ok((select status='canceled' from user_entitlements where stripe_subscription_id='sub_terminal'),'even higher event timestamp cannot resurrect terminal cancellation');
select public.sync_subscription_access('sub_terminal',null,null,null,'inactive',now()+interval '1 month',false,'cus_a',true,100);
select assert_ok((select status='canceled' from user_entitlements where stripe_subscription_id='sub_terminal'),'terminal cancellation also rejects inactive transition');
select public.sync_subscription_access('sub_cancel_older','10000000-0000-0000-0000-000000000001',array['NFL'],'monthly','active',now()+interval '1 month',false,'cus_a',true,100);
select public.sync_subscription_access('sub_cancel_older',null,null,null,'canceled',now(),false,'cus_a',true,90);
select assert_ok((select status='canceled' and event_created=100 from user_entitlements where stripe_subscription_id='sub_cancel_older'),'canonical cancellation wins even when carried by older delivery');
select public.sync_subscription_access('sub_fresh','10000000-0000-0000-0000-000000000001',array['MLB'],'monthly','active',now()+interval '1 month',false,'cus_a',true,101);
select assert_ok((select status='active' from user_entitlements where stripe_subscription_id='sub_fresh'),'a genuinely new subscription can grant access after cancellation');
select public.sync_subscription_access('sub_resume','10000000-0000-0000-0000-000000000001',array['NBA'],'monthly','inactive',now(),false,'cus_a',false,1);
select public.sync_subscription_access('sub_resume',null,null,null,'active',now()+interval '1 month',false,'cus_a',false,2);
select assert_ok((select status='active' from user_entitlements where stripe_subscription_id='sub_resume'),'nonterminal paused/unpaid access can recover');
insert into account_checkout_sessions(session_id,user_id,livemode) values('cs_owned','10000000-0000-0000-0000-000000000001',true);
select assert_ok(not has_table_privilege('authenticated','public.account_checkout_sessions','INSERT'),'clients cannot forge checkout ownership');
select assert_ok(not has_table_privilege('authenticated','public.account_checkout_sessions','SELECT'),'checkout session IDs remain service-only');
delete from auth.users where id='10000000-0000-0000-0000-000000000001';
select assert_ok((select count(*) from account_checkout_sessions)=0,'checkout tracking cascades with account deletion');
select public.sync_subscription_access('sub_orphan','10000000-0000-0000-0000-000000000001',array['ALL'],'monthly','active',now()+interval '1 month',false,'cus_a',true,101);
select assert_ok((select count(*) from user_entitlements where stripe_subscription_id='sub_orphan')=0,'late deleted-owner webhook cannot recreate entitlement');
