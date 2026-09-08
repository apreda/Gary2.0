-- Per-device delivery evidence prevents an overlapping cron or partial retry
-- from re-sending the devices that already succeeded. Only service_role can
-- see/use it; device_key is SHA-256, never the FCM registration token.
create table public.pick_push_deliveries (
  pick_key text not null,
  device_key text not null check (device_key ~ '^[a-f0-9]{64}$'),
  status text not null default 'ready' check (status in ('ready','sending','sent','failed','unknown','dead','expired','abandoned')),
  attempt_id uuid,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  retry_after timestamptz,
  last_http_status integer,
  updated_at timestamptz not null default now(),
  primary key (pick_key, device_key)
);
alter table public.pick_push_deliveries enable row level security;
revoke all on public.pick_push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.pick_push_deliveries to service_role;
create index pick_push_deliveries_expiry_idx on public.pick_push_deliveries(expires_at);

create function public.claim_pick_push(p_pick_key text, p_device_key text, p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare delivery public.pick_push_deliveries; at_time timestamptz;
begin
  if p_pick_key is null or length(p_pick_key) not between 1 and 600 or p_expires_at is null then
    raise exception 'Invalid pick push identity';
  end if;
  insert into public.pick_push_deliveries(pick_key,device_key,expires_at)
  values(p_pick_key,p_device_key,p_expires_at) on conflict do nothing;
  select * into delivery from public.pick_push_deliveries
    where pick_key=p_pick_key and device_key=p_device_key for update;
  at_time := clock_timestamp();
  -- A lost acknowledgement is uncertain, not a reason to send the same alert
  -- twice. Known HTTP failures alone can retry. A stale worker cannot finish a
  -- newer attempt because completion is conditional on its UUID.
  if delivery.status='sending' and delivery.updated_at < at_time-interval '90 seconds' then
    update public.pick_push_deliveries set status='unknown',updated_at=at_time
      where pick_key=p_pick_key and device_key=p_device_key returning * into delivery;
  elsif delivery.status in ('ready','failed') then
    if least(delivery.expires_at,p_expires_at) <= at_time then
      update public.pick_push_deliveries set status='expired',updated_at=at_time
        where pick_key=p_pick_key and device_key=p_device_key returning * into delivery;
    elsif delivery.attempts >= 3 then
      update public.pick_push_deliveries set status='abandoned',updated_at=at_time
        where pick_key=p_pick_key and device_key=p_device_key returning * into delivery;
    elsif delivery.retry_after is null or delivery.retry_after <= at_time then
      update public.pick_push_deliveries set status='sending',attempt_id=gen_random_uuid(),
        attempts=attempts+1,expires_at=least(expires_at,p_expires_at),updated_at=at_time
        where pick_key=p_pick_key and device_key=p_device_key returning * into delivery;
      return jsonb_build_object('claimed',true,'attempt_id',delivery.attempt_id,'status',delivery.status);
    end if;
  end if;
  return jsonb_build_object('claimed',false,'status',delivery.status);
end;
$$;

create function public.finish_pick_push(p_pick_key text,p_device_key text,p_attempt_id uuid,p_status text,p_http_status integer default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if p_status not in ('sent','failed','unknown','dead','expired') then raise exception 'Invalid push outcome'; end if;
  update public.pick_push_deliveries set status=p_status,last_http_status=p_http_status,
    retry_after=case when p_status='failed' then clock_timestamp()+interval '5 minutes' else null end,
    updated_at=clock_timestamp()
    where pick_key=p_pick_key and device_key=p_device_key and attempt_id=p_attempt_id and status='sending';
  get diagnostics changed = row_count;
  return changed=1;
end;
$$;
revoke all on function public.claim_pick_push(text,text,timestamptz),public.finish_pick_push(text,text,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.claim_pick_push(text,text,timestamptz),public.finish_pick_push(text,text,uuid,text,integer) to service_role;
