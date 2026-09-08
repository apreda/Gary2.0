begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create schema if not exists push_private;
create table push_private.push_installations (
  installation_id uuid primary key,
  latest_revision bigint not null default 0 check (latest_revision >= 0),
  updated_at timestamptz not null default now()
);
alter table push_private.push_installations enable row level security;
revoke all on push_private.push_installations from public, anon, authenticated;
grant all on push_private.push_installations to service_role;

alter table public.push_tokens add column registration_installation uuid;
create index push_tokens_registration_installation_idx
  on public.push_tokens(registration_installation)
  where registration_installation is not null;

-- The old RPC accepted arbitrary p_identity values. None of these links
-- proves account ownership. Preserve tokens and active state for generic
-- alerts, then rebuild personal links only through authenticated v2 calls.
update public.push_tokens set identity_id = null
where registration_installation is null and identity_id is not null;

-- Older clients retain registration support, but can never assign an account
-- or overwrite the state of a device already adopted by the v2 protocol.
create or replace function push_private.register_legacy_push_token(
  p_device_token text, p_platform text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_device_token is null or length(p_device_token) < 32 or length(p_device_token) > 4096 then
    raise exception 'invalid device token' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'invalid platform' using errcode = '22023';
  end if;
  insert into public.push_tokens(device_token, platform, active, identity_id)
  values(p_device_token, p_platform, true, null)
  on conflict(device_token) do update
    set platform=excluded.platform, active=true, identity_id=null, updated_at=now()
    where public.push_tokens.registration_installation is null;
end;
$$;

create or replace function public.register_push_token(
  p_device_token text, p_platform text, p_identity text default null
) returns void language sql security invoker set search_path = '' as $$
  select push_private.register_legacy_push_token(p_device_token, p_platform);
$$;

-- The random Keychain installation UUID is a device capability, not an
-- account ID. The account comes only from the authenticated request. The
-- installation row serializes token rotation and account/permission changes;
-- late requests cannot restore an older account after sign-out.
create function push_private.sync_push_registration(
  p_device_token text, p_platform text, p_installation_id uuid,
  p_revision bigint, p_active boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_revision bigint;
  v_token_installation uuid;
  v_owner uuid := auth.uid();
begin
  if p_device_token is null or length(p_device_token) < 32 or length(p_device_token) > 4096 then
    raise exception 'invalid device token' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('ios','android')
    or p_installation_id is null or p_revision is null or p_revision < 1
    or p_revision > 9007199254740991 or p_active is null then
    raise exception 'invalid registration' using errcode = '22023';
  end if;
  -- A deleted account's still-valid JWT must never recreate its personal link.
  if v_owner is not null and not exists(select 1 from auth.users where id=v_owner) then
    v_owner := null;
  end if;
  insert into push_private.push_installations(installation_id) values(p_installation_id)
    on conflict(installation_id) do nothing;
  select latest_revision into v_revision from push_private.push_installations
    where installation_id=p_installation_id for update;
  if p_revision <= v_revision then
    return jsonb_build_object('ok',true,'applied',false,'revision',v_revision);
  end if;

  -- A second installation cannot hijack a registered token merely by knowing
  -- its token string. No device/account identity is returned in the response.
  select registration_installation into v_token_installation
    from public.push_tokens where device_token=p_device_token for update;
  if v_token_installation is not null and v_token_installation <> p_installation_id then
    raise exception 'registration unavailable' using errcode = '42501';
  end if;

  update public.push_tokens set active=false, identity_id=null, updated_at=now()
    where registration_installation=p_installation_id and device_token<>p_device_token;
  insert into public.push_tokens(device_token,platform,active,identity_id,registration_installation)
    values(p_device_token,p_platform,p_active,case when p_active then v_owner::text else null end,p_installation_id)
    on conflict(device_token) do update set platform=excluded.platform,
      active=excluded.active, identity_id=excluded.identity_id,
      registration_installation=excluded.registration_installation, updated_at=now()
    where public.push_tokens.registration_installation is null
      or public.push_tokens.registration_installation=p_installation_id;
  if not found then
    raise exception 'registration unavailable' using errcode = '42501';
  end if;
  update push_private.push_installations set latest_revision=p_revision,updated_at=now()
    where installation_id=p_installation_id;
  return jsonb_build_object('ok',true,'applied',true,'revision',p_revision);
end;
$$;

create function public.sync_push_registration(
  p_device_token text, p_platform text, p_installation_id uuid,
  p_revision bigint, p_active boolean default true
) returns jsonb language sql security invoker set search_path = '' as $$
  select push_private.sync_push_registration(p_device_token,p_platform,p_installation_id,p_revision,p_active);
$$;

grant usage on schema push_private to anon, authenticated, service_role;
revoke all on function push_private.register_legacy_push_token(text,text) from public;
revoke all on function push_private.sync_push_registration(text,text,uuid,bigint,boolean) from public;
revoke all on function public.register_push_token(text,text,text) from public;
revoke all on function public.sync_push_registration(text,text,uuid,bigint,boolean) from public;
grant execute on function push_private.register_legacy_push_token(text,text) to anon,authenticated;
grant execute on function push_private.sync_push_registration(text,text,uuid,bigint,boolean) to anon,authenticated;
grant execute on function public.register_push_token(text,text,text) to anon,authenticated;
grant execute on function public.sync_push_registration(text,text,uuid,bigint,boolean) to anon,authenticated;
revoke all on public.push_tokens from public,anon,authenticated;
alter table public.push_tokens enable row level security;
notify pgrst, 'reload schema';
commit;
