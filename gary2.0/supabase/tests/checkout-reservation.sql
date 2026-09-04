-- Isolated fixture database only. The lifecycle fixture supplies auth and billing.
select current_database() like 'gary_billing_lifecycle_test_%' as safe_database \gset
\if :safe_database
\else
 \echo 'Refusing reservation fixtures outside a disposable billing database'
 \quit 1
\endif
\ir billing-lifecycle.sql
create table public.account_deletion_requests(user_id uuid primary key references auth.users on delete cascade);
\ir ../migrations/20260904220002_serialize_account_checkout_attempts.sql
insert into auth.users values('20000000-0000-0000-0000-000000000001');
select assert_ok(public.acquire_checkout_reservation('20000000-0000-0000-0000-000000000001',false,'30000000-0000-0000-0000-000000000001') is not null,'first owner-mode checkout acquires reservation');
select assert_ok(public.touch_checkout_reservation('20000000-0000-0000-0000-000000000001',false,'30000000-0000-0000-0000-000000000001')->>'attempt_id' is null,'lease heartbeat works before first Stripe attempt');
select assert_ok(public.acquire_checkout_reservation('20000000-0000-0000-0000-000000000001',false,'30000000-0000-0000-0000-000000000002') is null,'concurrent different plan request cannot acquire reservation');
select assert_ok(public.acquire_checkout_reservation('20000000-0000-0000-0000-000000000001',true,'30000000-0000-0000-0000-000000000002') is not null,'test and live checkout leases are isolated');
select public.record_checkout_reservation('20000000-0000-0000-0000-000000000001',false,'30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','customer=cus_fixture&metadata%5Bsports%5D=ALL',null);
select public.release_checkout_reservation('20000000-0000-0000-0000-000000000001',false,'30000000-0000-0000-0000-000000000002');
select assert_ok((select lease_token='30000000-0000-0000-0000-000000000001' from account_checkout_reservations where livemode=false),'different worker cannot release owner lease');
update account_checkout_reservations set lease_expires_at=now()-interval '1 second' where livemode=false;
select public.acquire_checkout_reservation('20000000-0000-0000-0000-000000000001',false,'30000000-0000-0000-0000-000000000002');
select assert_ok((select attempt_id='40000000-0000-0000-0000-000000000001' and stripe_form='customer=cus_fixture&metadata%5Bsports%5D=ALL' and session_id is null from account_checkout_reservations where livemode=false),'lease takeover preserves unresolved Stripe operation exactly');
do $$begin
 begin
  perform public.record_checkout_reservation('20000000-0000-0000-0000-000000000001',false,'30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','changed',null);
  raise exception 'FAIL: stale worker changed checkout';
 exception when others then if sqlerrm <> 'Checkout lease lost' then raise; end if; end;
 raise notice 'PASS: stale worker cannot create a new attempt';
 begin
  perform public.touch_checkout_reservation('20000000-0000-0000-0000-000000000001',false,'30000000-0000-0000-0000-000000000001');
  raise exception 'FAIL: stale worker touched a newer lease';
 exception when others then if sqlerrm <> 'Checkout lease lost' then raise; end if; end;
 raise notice 'PASS: stale worker cannot renew or close a newer attempt';
 begin
  perform public.record_checkout_reservation('20000000-0000-0000-0000-000000000001',false,'30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','changed',null);
  raise exception 'FAIL: immutable Stripe form changed';
 exception when others then if sqlerrm <> 'Checkout request changed' then raise; end if; end;
 raise notice 'PASS: one attempt cannot change Stripe form';
end $$;
select public.record_checkout_reservation('20000000-0000-0000-0000-000000000001',false,'30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','customer=cus_fixture&metadata%5Bsports%5D=ALL','cs_fixture');
select assert_ok((select session_id='cs_fixture' from account_checkout_reservations where livemode=false),'recovered session is retained before lease release');
select public.release_checkout_reservation('20000000-0000-0000-0000-000000000001',false,'30000000-0000-0000-0000-000000000002');
select assert_ok((select lease_token is null and session_id='cs_fixture' from account_checkout_reservations where livemode=false),'release preserves recovery identity');
select assert_ok(not has_table_privilege('authenticated','account_checkout_reservations','select') and not has_function_privilege('authenticated','acquire_checkout_reservation(uuid,boolean,uuid)','execute'),'clients cannot inspect or reserve checkout operations');
insert into account_deletion_requests values('20000000-0000-0000-0000-000000000001');
do $$begin
 begin
  perform public.acquire_checkout_reservation('20000000-0000-0000-0000-000000000001',false,'30000000-0000-0000-0000-000000000003');
  raise exception 'FAIL: deleting account opened checkout';
 exception when others then if sqlerrm<>'Account unavailable' then raise; end if; end;
 raise notice 'PASS: deleting account cannot acquire checkout';
end $$;
delete from auth.users where id='20000000-0000-0000-0000-000000000001';
select assert_ok(not exists(select 1 from account_checkout_reservations),'account deletion removes both mode reservations');
