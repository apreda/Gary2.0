-- One leased checkout operation per account/mode. The exact Stripe request is
-- retained across crashes so lease recovery replays the same idempotent call.
begin;
create table public.account_checkout_reservations (
 user_id uuid not null references auth.users(id) on delete cascade,
 livemode boolean not null,
 lease_token uuid,
 lease_expires_at timestamptz,
 attempt_id uuid,
 stripe_form text,
 session_id text check(session_id is null or session_id ~ '^cs_'),
 updated_at timestamptz not null default now(),
 primary key(user_id,livemode),
 check((attempt_id is null) = (stripe_form is null)),
 check(session_id is null or attempt_id is not null)
);
alter table public.account_checkout_reservations enable row level security;
revoke all on public.account_checkout_reservations from public,anon,authenticated;
grant all on public.account_checkout_reservations to service_role;

create function public.acquire_checkout_reservation(p_owner uuid,p_livemode boolean,p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.account_checkout_reservations;
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Forbidden'; end if;
 if p_owner is null or p_livemode is null or p_token is null then raise exception 'Invalid reservation'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,914009));
 if not exists(select 1 from auth.users where id=p_owner)
   or exists(select 1 from public.account_deletion_requests where user_id=p_owner) then raise exception 'Account unavailable'; end if;
 insert into public.account_checkout_reservations(user_id,livemode) values(p_owner,p_livemode) on conflict do nothing;
 select * into v from public.account_checkout_reservations where user_id=p_owner and livemode=p_livemode for update;
 if v.lease_token is not null and v.lease_token<>p_token and v.lease_expires_at>clock_timestamp() then return null; end if;
 update public.account_checkout_reservations set lease_token=p_token,lease_expires_at=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp()
 where user_id=p_owner and livemode=p_livemode returning * into v;
 return to_jsonb(v);
end $$;

create function public.touch_checkout_reservation(p_owner uuid,p_livemode boolean,p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.account_checkout_reservations;
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Forbidden'; end if;
 if p_token is null then raise exception 'Checkout lease lost'; end if;
 if exists(select 1 from public.account_deletion_requests where user_id=p_owner) then raise exception 'Account unavailable'; end if;
 update public.account_checkout_reservations set lease_expires_at=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp()
 where user_id=p_owner and livemode=p_livemode and lease_token=p_token and lease_expires_at>clock_timestamp() returning * into v;
 if not found then raise exception 'Checkout lease lost'; end if;
 return to_jsonb(v);
end $$;

create function public.record_checkout_reservation(p_owner uuid,p_livemode boolean,p_token uuid,p_attempt_id uuid,p_form text,p_session_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.account_checkout_reservations;
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Forbidden'; end if;
 if p_token is null then raise exception 'Checkout lease lost'; end if;
 if p_attempt_id is null or coalesce(length(p_form),0)=0 or length(p_form)>12000 then raise exception 'Invalid checkout attempt'; end if;
 select * into v from public.account_checkout_reservations where user_id=p_owner and livemode=p_livemode for update;
 if not found or v.lease_token is distinct from p_token or v.lease_expires_at<=clock_timestamp() then raise exception 'Checkout lease lost'; end if;
 if exists(select 1 from public.account_deletion_requests where user_id=p_owner) then raise exception 'Account unavailable'; end if;
 if v.attempt_id=p_attempt_id and v.stripe_form is distinct from p_form then raise exception 'Checkout request changed'; end if;
 update public.account_checkout_reservations set attempt_id=p_attempt_id,stripe_form=p_form,session_id=p_session_id,
 lease_expires_at=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp()
 where user_id=p_owner and livemode=p_livemode returning * into v;
 return to_jsonb(v);
end $$;

create function public.release_checkout_reservation(p_owner uuid,p_livemode boolean,p_token uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Forbidden'; end if;
 update public.account_checkout_reservations set lease_token=null,lease_expires_at=null
 where user_id=p_owner and livemode=p_livemode and lease_token=p_token;
end $$;
revoke all on function public.touch_checkout_reservation(uuid,boolean,uuid) from public,anon,authenticated;
revoke all on function public.acquire_checkout_reservation(uuid,boolean,uuid) from public,anon,authenticated;
revoke all on function public.record_checkout_reservation(uuid,boolean,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.release_checkout_reservation(uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function public.touch_checkout_reservation(uuid,boolean,uuid) to service_role;
grant execute on function public.acquire_checkout_reservation(uuid,boolean,uuid) to service_role;
grant execute on function public.record_checkout_reservation(uuid,boolean,uuid,uuid,text,text) to service_role;
grant execute on function public.release_checkout_reservation(uuid,boolean,uuid) to service_role;
notify pgrst,'reload schema';
commit;
