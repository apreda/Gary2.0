-- Keep checkout sessions attached to their authenticated owner until deletion,
-- and make terminal cancellation independent of webhook arrival order.
begin;
create table public.account_checkout_sessions (
 session_id text primary key check(session_id ~ '^cs_'),
 user_id uuid not null references auth.users(id) on delete cascade,
 livemode boolean not null,
 customer_id text,
 created_at timestamptz not null default now()
);
create index account_checkout_sessions_owner on public.account_checkout_sessions(user_id,livemode,created_at desc);
alter table public.account_checkout_sessions enable row level security;
revoke all on public.account_checkout_sessions from public,anon,authenticated;
grant all on public.account_checkout_sessions to service_role;
create or replace function public.sync_subscription_access(
  p_subscription_id text, p_owner text, p_sports text[], p_pass text,
  p_status text, p_expires_at timestamptz, p_cancel boolean,
  p_customer text, p_livemode boolean, p_event_created bigint
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner text; v_sports text[]; v_sport text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Forbidden'; end if;
  if p_subscription_id is null or p_subscription_id !~ '^sub_' or p_status not in ('active','inactive','canceled') then raise exception 'Invalid subscription'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_subscription_id||':'||p_livemode::text,914010));
  select installation_id into v_owner from public.user_entitlements
    where stripe_subscription_id=p_subscription_id and livemode=p_livemode limit 1;
  v_owner := coalesce(v_owner,p_owner);
  if v_owner is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner,914009));
  -- Deletion and synchronization share this lock. A late webhook acknowledges
  -- the event without recreating records for an account that no longer exists.
  if not exists(select 1 from auth.users u where u.id::text=v_owner) then return true; end if;
  if p_owner is not null and p_owner <> v_owner then raise exception 'Subscription owner mismatch'; end if;
  -- Stripe cancellation is terminal for a subscription ID. An earlier fetch
  -- can finish after cancellation, even with the same event.created second.
  if p_status <> 'canceled' and exists(select 1 from public.user_entitlements
    where stripe_subscription_id=p_subscription_id and livemode=p_livemode and status='canceled') then return true; end if;
  select array_agg(distinct product_key) into v_sports from public.user_entitlements
    where stripe_subscription_id=p_subscription_id and livemode=p_livemode;
  v_sports := coalesce(v_sports,p_sports);
  if coalesce(array_length(v_sports,1),0)=0 then return false; end if;
  foreach v_sport in array v_sports loop
    if v_sport not in ('ALL','MLB','NBA','NFL','NCAAF','NHL','NCAAB') then raise exception 'Invalid sport'; end if;
    insert into public.user_entitlements(installation_id,product_key,pass_type,status,
      stripe_session_id,stripe_subscription_id,stripe_customer_id,expires_at,
      livemode,cancel_at_period_end,event_created)
    values(v_owner,v_sport,coalesce(p_pass,'monthly'),p_status,
      p_subscription_id||':'||v_sport,p_subscription_id,p_customer,p_expires_at,
      p_livemode,coalesce(p_cancel,false),p_event_created)
    on conflict(stripe_subscription_id,product_key,livemode) where stripe_subscription_id is not null
    do update set status=excluded.status,expires_at=excluded.expires_at,
      stripe_customer_id=excluded.stripe_customer_id,cancel_at_period_end=excluded.cancel_at_period_end,
      event_created=greatest(public.user_entitlements.event_created,excluded.event_created)
    where (excluded.status='canceled' or public.user_entitlements.event_created <= excluded.event_created)
      and (public.user_entitlements.status<>'canceled' or excluded.status='canceled');
  end loop;
  return true;
end $$;
revoke all on function public.sync_subscription_access(text,text,text[],text,text,timestamptz,boolean,text,boolean,bigint) from public,anon,authenticated;
grant execute on function public.sync_subscription_access(text,text,text[],text,text,timestamptz,boolean,text,boolean,bigint) to service_role;
notify pgrst,'reload schema';
commit;
