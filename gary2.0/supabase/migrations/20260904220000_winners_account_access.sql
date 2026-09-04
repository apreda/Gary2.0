-- Account-owned access. Public leaderboards must never turn a visible user id
-- into a bearer credential for somebody else's subscription.
begin;

alter table public.user_entitlements add column if not exists livemode boolean not null default true;
alter table public.user_entitlements add column if not exists cancel_at_period_end boolean not null default false;
alter table public.user_entitlements add column if not exists stripe_customer_id text;
alter table public.user_entitlements add column if not exists event_created bigint not null default 0;
-- Stripe session ids identify historical sandbox purchases unambiguously.
update public.user_entitlements set livemode = false where stripe_session_id like 'cs_test_%';
create index if not exists user_entitlements_owner_access on public.user_entitlements(installation_id, status, livemode);

create schema if not exists gary_private;
revoke all on schema gary_private from public, anon, authenticated;

create or replace function gary_private.has_winners_access(p_league text)
returns boolean language sql stable security definer set search_path = '' as $$
  select now() < timestamptz '2026-10-01 00:00:00 America/New_York'
    or exists(select 1 from auth.users u where u.id = (select auth.uid())
      and u.created_at < timestamptz '2026-10-01 00:00:00 America/New_York')
    or exists(select 1 from public.user_entitlements e
      where e.installation_id = (select auth.uid())::text
        and e.livemode and e.status = 'active'
        and (e.expires_at is null or e.expires_at > now())
        and e.product_key in ('ALL', upper(p_league)))
$$;
-- Needed by the RLS expression; the only input is a league, never an owner id.
grant usage on schema gary_private to anon, authenticated;
revoke all on function gary_private.has_winners_access(text) from public;
grant execute on function gary_private.has_winners_access(text) to anon, authenticated, service_role;

create or replace function public.get_my_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'preview_until', '2026-10-01T04:00:00Z',
    'preview', now() < timestamptz '2026-10-01 00:00:00 America/New_York',
    'founding', exists(select 1 from auth.users u where u.id = (select auth.uid())
      and u.created_at < timestamptz '2026-10-01 00:00:00 America/New_York'),
    'sports', coalesce((select jsonb_agg(distinct e.product_key) from public.user_entitlements e
      where e.installation_id = (select auth.uid())::text and e.livemode and e.status = 'active'
        and (e.expires_at is null or e.expires_at > now())), '[]'::jsonb),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object(
      'product_key',e.product_key,'pass_type',e.pass_type,'status',e.status,
      'expires_at',e.expires_at,'cancel_at_period_end',e.cancel_at_period_end))
      from public.user_entitlements e where e.installation_id = (select auth.uid())::text and e.livemode), '[]'::jsonb),
    'can_manage', exists(select 1 from public.user_entitlements e
      where e.installation_id = (select auth.uid())::text and e.livemode and e.stripe_subscription_id is not null)
  )
$$;
revoke all on function public.get_my_access() from public;
grant execute on function public.get_my_access() to anon, authenticated, service_role;

-- Keep the old shape for installed clients, with authenticated ownership.
create or replace function public.get_entitlements(p_ids text[])
returns table(product_key text) language sql stable security definer set search_path = '' as $$
  select distinct e.product_key from public.user_entitlements e
  where e.installation_id = (select auth.uid())::text and e.livemode
    and e.status = 'active' and (e.expires_at is null or e.expires_at > now())
$$;
revoke all on function public.get_entitlements(text[]) from public;
grant execute on function public.get_entitlements(text[]) to anon, authenticated, service_role;

drop policy if exists winners_board_read on public.winners_board;
create policy winners_board_read on public.winners_board for select to anon, authenticated
using (game_date < (now() at time zone 'America/New_York')::date::text
  or gary_private.has_winners_access(league));

-- Locked boards disclose counts only. Tickets/reasons never enter the client.
create or replace function public.get_winners_board(p_date text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_historical boolean;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  if to_char(p_date::date,'YYYY-MM-DD') <> p_date then raise exception 'Invalid date'; end if;
  v_historical := p_date::date < (now() at time zone 'America/New_York')::date;
  return jsonb_build_object(
    'access', public.get_my_access(),
    'boards', coalesce((select jsonb_agg(to_jsonb(b)) from (
      select w.league,w.kind,count(*) as count,
        not (v_historical or gary_private.has_winners_access(w.league)) as locked
      from public.winners_board w where w.game_date=p_date group by w.league,w.kind
      order by w.league,w.kind) b),'[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(to_jsonb(w) order by w.admitted_at,w.candidate_id)
      from public.winners_board w where w.game_date=p_date
      and (v_historical or gary_private.has_winners_access(w.league))),'[]'::jsonb));
end $$;
revoke all on function public.get_winners_board(text) from public;
grant execute on function public.get_winners_board(text) to anon, authenticated, service_role;
-- One authoritative row per subscription/sport/mode; retries are harmless.
create unique index if not exists user_entitlements_subscription_sport
  on public.user_entitlements(stripe_subscription_id,product_key,livemode)
  where stripe_subscription_id is not null;
create or replace function public.sync_subscription_access(
  p_subscription_id text, p_owner text, p_sports text[], p_pass text,
  p_status text, p_expires_at timestamptz, p_cancel boolean,
  p_customer text, p_livemode boolean, p_event_created bigint
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner text; v_sports text[]; v_sport text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Forbidden'; end if;
  if p_subscription_id is null or p_subscription_id !~ '^sub_' or p_status not in ('active','inactive','canceled') then raise exception 'Invalid subscription'; end if;
  select installation_id into v_owner from public.user_entitlements
    where stripe_subscription_id=p_subscription_id and livemode=p_livemode limit 1;
  v_owner := coalesce(v_owner,p_owner);
  if v_owner is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner,914009));
  -- Deletion and synchronization share this lock. A late webhook acknowledges
  -- the event without recreating records for an account that no longer exists.
  if not exists(select 1 from auth.users u where u.id::text=v_owner) then return true; end if;
  if p_owner is not null and p_owner <> v_owner then raise exception 'Subscription owner mismatch'; end if;
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
      event_created=excluded.event_created
    where public.user_entitlements.event_created <= excluded.event_created;
  end loop;
  return true;
end $$;
revoke all on function public.sync_subscription_access(text,text,text[],text,text,timestamptz,boolean,text,boolean,bigint) from public,anon,authenticated;
grant execute on function public.sync_subscription_access(text,text,text[],text,text,timestamptz,boolean,text,boolean,bigint) to service_role;
notify pgrst, 'reload schema';
commit;
