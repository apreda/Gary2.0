-- Run ONLY in a disposable local database: psql -X -v ON_ERROR_STOP=1 -d gary_user_access_test -f supabase/tests/winners-access.sql
select current_database() = 'gary_user_access_test' as safe_database \gset
\if :safe_database
\else
  \echo 'Refusing to run access fixtures outside gary_user_access_test'
  \quit 1
\endif
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
create table auth.users(id uuid primary key, created_at timestamptz);
create table public.user_entitlements(id bigint generated always as identity primary key, installation_id text,
 product_key text,pass_type text default 'season',status text default 'active',stripe_session_id text unique,
 stripe_subscription_id text,expires_at timestamptz,created_at timestamptz default now());
alter table public.user_entitlements enable row level security;
create table public.winners_board(candidate_id bigint primary key, game_date text,league text,kind text,
 pick_snapshot jsonb,admitted_at timestamptz default now());
alter table public.winners_board enable row level security;
grant usage on schema auth to anon,authenticated,service_role;
grant select on public.winners_board to anon,authenticated;
\ir ../migrations/20260904220000_winners_account_access.sql
create function public.assert_ok(p_ok boolean,p_name text) returns void language plpgsql as $$begin
 if p_ok is distinct from true then raise exception 'FAILED: %',p_name; end if; raise notice 'PASS: %',p_name; end$$;
select assert_ok((get_my_access()->>'preview')::boolean,'September preview open');

-- Move the clock only in this disposable database, then exercise October's
-- actual deployed policy bodies and APIs under anon and authenticated roles.
do $$declare fn record;begin
 for fn in select pg_get_functiondef(p.oid) as source from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='gary_private' and p.proname='has_winners_access') or (n.nspname='public' and p.proname in ('get_my_access','get_entitlements','get_winners_board')) loop
  execute replace(fn.source,'now()','timestamptz ''2026-10-02 12:00:00+00''');
 end loop;
end$$;
insert into auth.users values
 ('10000000-0000-4000-a000-000000000001','2026-09-10'),
 ('10000000-0000-4000-a000-000000000002','2026-10-01 10:00+00'),
 ('10000000-0000-4000-a000-000000000003','2026-10-01 10:00+00');
insert into winners_board(candidate_id,game_date,league,kind,pick_snapshot) values
 (1,'2026-10-02','MLB','game','{"secret":"MLB ticket"}'),
 (2,'2026-10-02','NFL','game','{"secret":"NFL ticket"}'),
 (3,'2026-10-01','NFL','game','{"secret":"historical"}');
insert into user_entitlements(installation_id,product_key,stripe_session_id,status,expires_at,livemode) values
 ('10000000-0000-4000-a000-000000000002','MLB','cs_live_owner','active','2026-11-01',true),
 ('10000000-0000-4000-a000-000000000002','NFL','cs_test_owner','active','2026-11-01',false),
 ('10000000-0000-4000-a000-000000000003','ALL','cs_live_expired','active','2026-10-01',true);
set role anon;
select assert_ok(jsonb_array_length(get_winners_board('2026-10-02')->'tickets')=0,'anonymous October response has zero ticket snapshots');
select assert_ok(jsonb_array_length(get_winners_board('2026-10-02')->'boards')=2,'locked board counts available');
select assert_ok(jsonb_array_length(get_winners_board('2026-10-01')->'tickets')=1,'historical results remain public');
select assert_ok((select count(*) from get_entitlements(array['10000000-0000-4000-a000-000000000002']))=0,'knowing another account id does not unlock');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"10000000-0000-4000-a000-000000000002"}',false);
set role authenticated;
select assert_ok(get_my_access()->'sports'='["MLB"]','test-mode subscription never grants live access');
select assert_ok(jsonb_array_length(get_winners_board('2026-10-02')->'tickets')=1,'single-sport member sees only that sport');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"10000000-0000-4000-a000-000000000003"}',false);
set role authenticated;
select assert_ok(get_my_access()->'sports'='[]','expired subscription does not grant access');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"10000000-0000-4000-a000-000000000001"}',false);
set role authenticated;
select assert_ok((get_my_access()->>'founding')::boolean,'founding account retains access across devices');
select assert_ok(jsonb_array_length(get_winners_board('2026-10-02')->'tickets')=2,'founding account receives all boards');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
select assert_ok(sync_subscription_access('sub_testcase','10000000-0000-4000-a000-000000000003',array['NFL'],'monthly','active','2026-11-01',false,'cus_test',true,10),'subscription grant');
select sync_subscription_access('sub_testcase',null,null,null,'canceled','2026-10-02',false,'cus_test',true,12);
select sync_subscription_access('sub_testcase',null,null,null,'active','2026-11-01',false,'cus_test',true,11);
select assert_ok((select status='canceled' from user_entitlements where stripe_subscription_id='sub_testcase'),'late delivery cannot resurrect canceled subscription');
select sync_subscription_access('sub_testcase',null,null,null,'canceled','2026-10-02',false,'cus_test',true,12);
select assert_ok((select count(*)=1 from user_entitlements where stripe_subscription_id='sub_testcase'),'webhook retry is idempotent');
