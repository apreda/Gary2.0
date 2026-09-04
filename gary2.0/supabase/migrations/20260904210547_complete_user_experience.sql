-- Complete the account experience without mixing private, self-reported bets
-- into verified competition. Existing client RPC signatures remain supported.
begin;
create schema if not exists user_experience_private;
revoke all on schema user_experience_private from public, anon, authenticated;

alter table public.public_profiles add column if not exists leaderboard_visible boolean not null default true;
alter table public.user_bets
  add column if not exists is_favorite boolean not null default false,
  add column if not exists notes text,
  add column if not exists bookmaker text,
  add column if not exists source_game_id text,
  add column if not exists source_pick_id text,
  add column if not exists source_line numeric,
  add column if not exists source_side text;

-- Identical display text can occur in both halves of a doubleheader.
drop index if exists public.user_bets_one_tailfade;
create unique index user_bets_one_tailfade on public.user_bets
 (user_id,game_date,pick_type,pick_text,(coalesce(source_game_id,''))) where kind in ('tail','fade');

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  favorite_sports text[] not null default '{}',
  unit_value numeric(10,2),
  updated_at timestamptz not null default now(),
  constraint user_preferences_sports check (favorite_sports <@ array['MLB','NFL','NBA','NCAAF']::text[]),
  constraint user_preferences_unit check (unit_value is null or (unit_value > 0 and unit_value <= 100000))
);
alter table public.user_preferences enable row level security;
create policy user_preferences_owner on public.user_preferences for select to authenticated using ((select auth.uid())=user_id);
grant select on public.user_preferences to authenticated;
revoke all on public.user_preferences from anon;

-- The old demonstration cast is retained for audit but can never pose as users.
-- This is a one-time server-owned exclusion list, not authorization based on
-- editable user metadata. No public client can add/remove these exclusions.
create table if not exists user_experience_private.excluded_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null
);
alter table user_experience_private.excluded_profiles enable row level security;
insert into user_experience_private.excluded_profiles(user_id,reason)
select id,'legacy demonstration cast' from auth.users
where raw_user_meta_data->>'test_cast'='true'
on conflict do nothing;

create index if not exists user_bets_verified_window on public.user_bets(game_date,user_id,league)
where kind in ('tail','fade') and graded_by='system';

create or replace function user_experience_private.streak_summary(p_user uuid,p_league text default 'all')
returns jsonb language sql stable set search_path='' as $$
  with stars as (
    select id,game_date,placed_at,status,graded_by
    from public.user_bets where user_id=p_user and streak_pick and kind in ('tail','fade')
      and (p_league='all' or upper(league)=p_league)
  ), decided as (
    select *,count(*) filter(where status='lost') over(order by game_date,placed_at,id) as segment
    from stars where graded_by='system' and status in ('won','lost')
      -- An unresolved earlier play cannot be silently skipped by later grades.
      and game_date < coalesce((select min(game_date) from stars where status='pending'),'infinity'::date)
  ), runs as (
    select *,count(*) filter(where status='won') over(partition by segment order by game_date,placed_at,id)::int as wins_run
    from decided
  ), latest as (select * from runs order by game_date desc,placed_at desc,id desc limit 1),
  loss_run as (select count(*)::int as n from decided where status='lost' and game_date >
    coalesce((select max(game_date) from decided where status='won'),'-infinity'::date))
  select jsonb_build_object(
    'current',coalesce((select wins_run from latest),0),
    'best',coalesce((select max(wins_run) from runs),0),
    'prev_current',coalesce((select wins_run from runs order by game_date desc,placed_at desc,id desc offset 1 limit 1),0),
    'last_counted_date',(select game_date from latest),
    'last_result',(select status from latest),
    'streak_len',case when (select status from latest)='lost' then (select n from loss_run) else coalesce((select wins_run from latest),0) end,
    'streak_kind',case (select status from latest) when 'won' then 'W' when 'lost' then 'L' else '' end
  );
$$;

create or replace function user_experience_private.refresh_streak(p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,914007));
  if not exists(select 1 from auth.users where id=p_user) then return; end if;
  s := user_experience_private.streak_summary(p_user);
  insert into public.user_streaks(user_id,current,best,prev_current,last_counted_date,last_result,updated_at)
  values(p_user,(s->>'current')::int,(s->>'best')::int,(s->>'prev_current')::int,
    (s->>'last_counted_date')::date,s->>'last_result',now())
  on conflict(user_id) do update set current=excluded.current,best=excluded.best,
    prev_current=excluded.prev_current,last_counted_date=excluded.last_counted_date,
    last_result=excluded.last_result,updated_at=excluded.updated_at;
end;
$$;

create or replace function public.user_bets_guard()
returns trigger language plpgsql set search_path='' as $$
declare trusted boolean := current_user in ('postgres','supabase_admin','service_role')
  or coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role'='service_role'
  or current_setting('app.user_bets_rpc',true)='1';
begin
  -- Serialize writes for the same account before mutation, including graders.
  perform pg_advisory_xact_lock(hashtextextended(coalesce(new.user_id,old.user_id)::text,914007));
  if tg_op='DELETE' then return old; end if;
  if coalesce(trusted,false) then return new; end if;
  if new.user_id is distinct from auth.uid() then raise exception 'not your bet'; end if;
  if length(coalesce(new.notes,''))>2000 or length(coalesce(new.bookmaker,''))>80 then
    raise exception 'notes or sportsbook name too long'; end if;
  if new.stake_units is null or new.stake_units::text='NaN' or new.stake_units<=0 or new.stake_units>10 then
    raise exception 'stake must be between 0.01 and 10 units'; end if;
  if tg_op='UPDATE' and (new.id is distinct from old.id or new.user_id is distinct from old.user_id
    or new.kind is distinct from old.kind or new.placed_at is distinct from old.placed_at) then
    raise exception 'bet identity is immutable'; end if;
  if new.kind='manual' then
    if new.odds_american is null or abs(new.odds_american::bigint) not between 100 and 100000 then
      raise exception 'American odds must be -100000 to -100 or +100 to +100000'; end if;
    if length(btrim(coalesce(new.pick_text,''))) not between 1 and 300
       or length(coalesce(new.description,''))>500 then raise exception 'enter a pick of 1 to 300 characters'; end if;
    if new.game_date < date '1900-01-01' or new.game_date > (now() at time zone 'America/New_York')::date+366 then
      raise exception 'bet date out of range'; end if;
    new.pick_text := btrim(new.pick_text);
    new.streak_pick := false; new.lock_at := null; new.odds_estimated := false;
    new.source_game_id := null; new.source_pick_id := null; new.source_line := null; new.source_side := null;
    new.gary_confidence := null;
    if tg_op='INSERT' then new.placed_at := now(); end if;
    new.graded_by := case when new.status='pending' then null else 'user' end;
    new.graded_at := case when new.status='pending' then null else now() end;
    new.units_net := case new.status when 'pending' then null when 'lost' then -new.stake_units
      when 'won' then round(new.stake_units * case when new.odds_american>0 then new.odds_american/100.0 else 100.0/abs(new.odds_american) end,2)
      when 'push' then 0 when 'void' then 0 end;
    return new;
  end if;
  if tg_op='INSERT' then raise exception 'verified bets must be placed through the app'; end if;
  -- Only personal annotation is editable on locked verified tickets. Before
  -- lock, stake and legacy streak flag edits remain supported; identity and
  -- grading cannot be forged using the old broad UPDATE policy.
  if (to_jsonb(new)-array['is_favorite','notes','bookmaker','stake_units','streak_pick']) is distinct from
     (to_jsonb(old)-array['is_favorite','notes','bookmaker','stake_units','streak_pick']) then
    raise exception 'verified ticket and result are server-owned'; end if;
  if (new.stake_units is distinct from old.stake_units or new.streak_pick is distinct from old.streak_pick)
     and (old.status<>'pending' or old.lock_at is null or now()>=old.lock_at) then
    raise exception 'game is locked'; end if;
  return new;
end;
$$;
drop trigger if exists user_bets_guard on public.user_bets;
create trigger user_bets_guard before insert or update or delete on public.user_bets for each row execute function public.user_bets_guard();
drop policy if exists user_bets_update on public.user_bets;
create policy user_bets_update on public.user_bets for update to authenticated
using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists user_bets_delete on public.user_bets;
create policy user_bets_delete on public.user_bets for delete to authenticated using (
 (select auth.uid())=user_id and (kind='manual' or (status='pending' and lock_at is not null and now()<lock_at)));

create or replace function user_experience_private.bet_streak_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    if old.streak_pick then perform user_experience_private.refresh_streak(old.user_id); end if;
    return old;
  end if;
  if new.streak_pick or (tg_op='UPDATE' and old.streak_pick) then
    perform user_experience_private.refresh_streak(new.user_id);
  end if;
  return new;
end;
$$;
create trigger user_bets_streak_refresh after insert or update or delete on public.user_bets
for each row execute function user_experience_private.bet_streak_changed();

create or replace function user_experience_private.assert_pregame(p_lock timestamptz,p_day date,p_league text,p_game text)
returns void language plpgsql stable set search_path='' as $$
begin
 if p_lock is null or now()>=p_lock then raise exception 'game is locked'; end if;
 if exists(select 1 from public.daily_slate d where d.date=p_day and upper(d.league)=upper(p_league)
   and d.bdl_game_id::text=p_game and (d.game_status in ('live','final','postponed','suspended','cancelled')
     or d.kickoff_status='date_only')) then raise exception 'game is not available for pregame tracking'; end if;
end;
$$;

create or replace function public.set_streak_pick(p_bet_id uuid,p_star boolean default true)
returns public.user_bets language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); b public.user_bets; other public.user_bets;
begin
  if u is null then raise exception 'not signed in'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,914007));
  select * into b from public.user_bets where id=p_bet_id and user_id=u for update;
  if b.id is null then raise exception 'bet not found'; end if;
  if b.kind not in ('tail','fade') then raise exception 'only verified picks can count toward a streak'; end if;
  if b.streak_pick=coalesce(p_star,true) then return b; end if;
  if b.status<>'pending' or b.lock_at is null or now()>=b.lock_at then raise exception 'game is locked'; end if;
  perform user_experience_private.assert_pregame(b.lock_at,b.game_date,b.league,b.source_game_id);
  if coalesce(p_star,true) then
    select * into other from public.user_bets where user_id=u and game_date=b.game_date and streak_pick and id<>b.id for update;
    if other.id is not null and (other.status<>'pending' or other.lock_at is null or now()>=other.lock_at) then
      raise exception 'your streak pick for this day is already locked'; end if;
    if other.id is not null then perform user_experience_private.assert_pregame(other.lock_at,other.game_date,other.league,other.source_game_id); end if;
    update public.user_bets set streak_pick=false where id=other.id;
  end if;
  update public.user_bets set streak_pick=coalesce(p_star,true) where id=b.id returning * into b;
  return b;
end;
$$;
revoke all on function public.set_streak_pick(uuid,boolean) from public,anon;
grant execute on function public.set_streak_pick(uuid,boolean) to authenticated;

create or replace function public.get_my_profile()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
  if u is null then raise exception 'not signed in'; end if;
  return jsonb_build_object('ok',true,'profile',(select to_jsonb(p) from public.public_profiles p where user_id=u),
    'preferences',coalesce((select to_jsonb(p) from public.user_preferences p where user_id=u),
      jsonb_build_object('favorite_sports','[]'::jsonb,'unit_value',null)));
end;
$$;

create or replace function public.save_my_profile(
 p_handle text default null,p_avatar text default null,p_bio text default null,
 p_leaderboard_visible boolean default null,p_favorite_sports text[] default null,p_unit_value numeric default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); h text:=nullif(btrim(p_handle),''); existing public.public_profiles;
begin
  if u is null then raise exception 'not signed in'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,914007));
  if h is not null and (length(h) not between 3 and 18 or h !~ '^[A-Za-z0-9_]+$') then
    raise exception 'handles are 3-18 letters, numbers, or underscores'; end if;
  if h is not null and lower(h)~'(gary|admin|official|moderator)' then raise exception 'that handle is reserved'; end if;
  if length(coalesce(p_bio,''))>160 then raise exception 'bio must be 160 characters or fewer'; end if;
  if p_avatar is not null and p_avatar not in ('','initials','flame.fill','baseball.fill','basketball.fill','football.fill','bolt.fill','target','crown.fill') then
    raise exception 'choose an available avatar'; end if;
  if p_favorite_sports is not null and (not p_favorite_sports <@ array['MLB','NFL','NBA','NCAAF']::text[] or cardinality(p_favorite_sports)>4) then
    raise exception 'choose available sports'; end if;
  if p_unit_value is not null and (p_unit_value::text='NaN' or p_unit_value<0 or p_unit_value>100000) then
    raise exception 'unit value must be between 0 and 100000'; end if;
  -- Serialize cross-column handle claims: older clients treated display_name
  -- as the handle, while newer clients wrote a second unique column.
  if h is not null then
    perform pg_advisory_xact_lock(hashtextextended(lower(h),914008));
    if exists(select 1 from public.public_profiles where user_id<>u and
      (lower(display_name)=lower(h) or lower(handle)=lower(h))) then raise exception 'that handle is taken'; end if;
  end if;
  select * into existing from public.public_profiles where user_id=u;
  if h is not null or existing.user_id is not null then
    insert into public.public_profiles(user_id,display_name,handle,avatar,bio,leaderboard_visible)
    values(u,coalesce(h,existing.display_name),coalesce(h,existing.handle),
      nullif(coalesce(p_avatar,existing.avatar),'initials'),
      case when p_bio is null then existing.bio else nullif(btrim(p_bio),'') end,
      coalesce(p_leaderboard_visible,existing.leaderboard_visible,false))
    on conflict(user_id) do update set display_name=excluded.display_name,handle=excluded.handle,
      avatar=excluded.avatar,bio=excluded.bio,leaderboard_visible=excluded.leaderboard_visible;
  end if;
  insert into public.user_preferences(user_id,favorite_sports,unit_value)
  values(u,coalesce(p_favorite_sports,'{}'),nullif(p_unit_value,0))
  on conflict(user_id) do update set
    favorite_sports=coalesce(p_favorite_sports,public.user_preferences.favorite_sports),
    unit_value=case when p_unit_value is null then public.user_preferences.unit_value else nullif(p_unit_value,0) end,
    updated_at=now();
  return public.get_my_profile();
exception when unique_violation then raise exception 'that handle is taken';
end;
$$;

create or replace function public.claim_handle(p_name text)
returns public.public_profiles language plpgsql security definer set search_path='' as $$
declare b public.public_profiles;
begin
  if nullif(btrim(p_name),'') is null then raise exception 'enter a handle'; end if;
  perform public.save_my_profile(p_handle=>p_name,p_leaderboard_visible=>true);
  select * into b from public.public_profiles where user_id=auth.uid(); return b;
end;
$$;
create or replace function public.update_my_profile(p_handle text default null,p_avatar text default null,p_bio text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin return public.save_my_profile(p_handle=>p_handle,p_avatar=>p_avatar,p_bio=>p_bio);
exception when others then return jsonb_build_object('ok',false,'error',sqlerrm); end;
$$;
revoke all on function public.get_my_profile(),public.save_my_profile(text,text,text,boolean,text[],numeric),public.claim_handle(text),public.update_my_profile(text,text,text) from public,anon;
grant execute on function public.get_my_profile(),public.save_my_profile(text,text,text,boolean,text[],numeric),public.claim_handle(text),public.update_my_profile(text,text,text) to authenticated;

create or replace function public.your_book_leaderboard_v3(
 p_window text default '30d',p_sort text default 'streak',p_league text default 'all',p_limit integer default 50,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w text:=lower(coalesce(p_window,'30d')); s text:=lower(coalesce(p_sort,'streak'));
 l text:=case when lower(coalesce(p_league,'all'))='all' then 'all' else upper(p_league) end;
 today date:=(now() at time zone 'America/New_York')::date; start_day date; answer jsonb;
begin
  if w not in ('7d','30d','season') or s not in ('streak','wins','record','units') or l not in ('all','MLB','NFL','NBA','NCAAF') then
    raise exception 'invalid leaderboard filter'; end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then raise exception 'invalid leaderboard page'; end if;
  -- 7d and 30d include today and the preceding 6/29 ET calendar days.
  -- Season begins at the later of the verified-record launch and January 1.
  start_day:=case w when '7d' then today-6 when '30d' then today-29 else greatest(date '2026-03-01',date_trunc('year',today)::date) end;
  with totals as (
    select user_id,count(*) filter(where status='won') wins,count(*) filter(where status='lost') losses,
      count(*) filter(where status='push') pushes,count(*) filter(where status in ('won','lost')) decided,
      coalesce(sum(units_net/nullif(stake_units,0)),0) units
    from public.user_bets where kind in ('tail','fade') and graded_by='system' and status in ('won','lost','push')
      and game_date between start_day and today and (l='all' or upper(league)=l)
    group by user_id
  ), eligible as (
    select t.*,p.display_name,coalesce(p.handle,p.display_name) handle,p.avatar,
      round(100.0*t.wins/nullif(t.decided,0),1) win_pct,
      user_experience_private.streak_summary(t.user_id,l) streak
    from totals t join public.public_profiles p using(user_id)
    where t.decided>=5 and p.leaderboard_visible
      and not exists(select 1 from user_experience_private.excluded_profiles e where e.user_id=t.user_id)
  ), metrics as (
    select user_id,display_name,handle,avatar,wins,losses,pushes,round(units,2) units,win_pct,decided,
      (streak->>'streak_len')::int streak_len,streak->>'streak_kind' streak_kind,(streak->>'best')::int best_streak,
      case s when 'streak' then (streak->>'current')::numeric when 'wins' then wins::numeric
        when 'record' then wins::numeric/nullif(decided,0) when 'units' then units end score
    from eligible
  ), ranked as (
    select rank() over(order by score desc,wins desc,decided desc) rank,metrics.* from metrics
  ), paged as (select * from ranked order by rank,user_id limit p_limit offset p_offset)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)-'score' order by rank,user_id) from paged p),'[]'),
    'me',(select to_jsonb(r)-'score' from ranked r where user_id=auth.uid()),
    'qualified_count',(select count(*) from ranked),'min_decided',5,
    'my_decided',coalesce((select decided from totals where user_id=auth.uid()),0),
    'window',w,'sort',s,'league',l,'window_start',start_day,'window_end',today,
    'has_more',(select count(*) from ranked)>p_offset+p_limit) into answer;
  return answer;
end;
$$;
revoke all on function public.your_book_leaderboard_v3(text,text,text,integer,integer) from public;
grant execute on function public.your_book_leaderboard_v3(text,text,text,integer,integer) to anon,authenticated;

-- Legacy clients use the same truthful board and privacy decision.
create or replace function public.your_book_leaderboard_v2(p_window text default 'season')
returns table(display_name text,wins bigint,losses bigint,pushes bigint,units numeric,win_pct numeric,streak_len int,streak_kind text,best_streak int)
language sql stable security definer set search_path='' as $$
 select r.display_name,r.wins,r.losses,r.pushes,r.units,r.win_pct,r.streak_len,r.streak_kind,r.best_streak
 from jsonb_to_recordset(public.your_book_leaderboard_v3(p_window,'streak','all',100,0)->'rows') as r(
 display_name text,wins bigint,losses bigint,pushes bigint,units numeric,win_pct numeric,streak_len int,streak_kind text,best_streak int);
$$;
create or replace function public.your_book_leaderboard(p_window text default '30d')
returns table(display_name text,wins bigint,losses bigint,pushes bigint,units numeric,best_streak int)
language sql stable security definer set search_path='' as $$
 select r.display_name,r.wins,r.losses,r.pushes,r.units,r.best_streak
 from jsonb_to_recordset(public.your_book_leaderboard_v3(p_window,'units','all',50,0)->'rows') as r(
 display_name text,wins bigint,losses bigint,pushes bigint,units numeric,best_streak int);
$$;
create or replace function public.leaderboard(p_lane text default 'tail',p_days integer default 30,p_min_graded integer default 5)
returns table(rank bigint,user_id uuid,display_name text,handle text,avatar text,graded bigint,wins bigint,losses bigint,units numeric)
language sql stable security definer set search_path='' as $$
 with totals as (
 select b.user_id,count(*) filter(where status in ('won','lost')) graded,
 count(*) filter(where status='won') wins,count(*) filter(where status='lost') losses,sum(units_net/nullif(stake_units,0)) units
 from public.user_bets b where b.kind=case p_lane when 'fade' then 'fade' else 'tail' end
 and p_lane in ('tail','fade') and graded_by='system' and status in ('won','lost','push')
 and game_date between (now() at time zone 'America/New_York')::date-least(greatest(coalesce(p_days,30),1),366)+1
 and (now() at time zone 'America/New_York')::date group by b.user_id
 ) select rank() over(order by t.wins-t.losses desc,t.wins desc,t.graded desc),t.user_id,p.display_name,
 coalesce(p.handle,p.display_name),p.avatar,t.graded,t.wins,t.losses,t.units
 from totals t join public.public_profiles p using(user_id)
 where p.leaderboard_visible and t.graded>=greatest(coalesce(p_min_graded,5),5)
 and not exists(select 1 from user_experience_private.excluded_profiles e where e.user_id=t.user_id)
 order by 1,t.user_id limit 100;
$$;
revoke all on function public.your_book_leaderboard_v2(text),public.your_book_leaderboard(text),public.leaderboard(text,integer,integer) from public;
grant execute on function public.your_book_leaderboard_v2(text),public.your_book_leaderboard(text),public.leaderboard(text,integer,integer) to anon,authenticated;

create or replace function public.profile_card(p_user uuid,p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare owner boolean:=coalesce(auth.uid()=p_user,false); result jsonb;
 start_day date:=(now() at time zone 'America/New_York')::date-least(greatest(coalesce(p_days,30),1),366)+1;
 today date:=(now() at time zone 'America/New_York')::date;
begin
  if not owner and (not exists(select 1 from public.public_profiles where user_id=p_user and leaderboard_visible)
    or exists(select 1 from user_experience_private.excluded_profiles where user_id=p_user)) then
    return null; end if;
  with verified as (
    select id,kind,status,game_date,placed_at,units_net
    from public.user_bets where user_id=p_user and kind in ('tail','fade') and graded_by='system'
      and status in ('won','lost') and game_date between start_day and today
  ), ordered as (
    select *,lag(status) over(order by game_date,placed_at,id) previous from verified
  ), logged as (
    select count(*) filter(where status in ('won','lost')) graded,
      count(*) filter(where status='won') wins,count(*) filter(where status='lost') losses,coalesce(sum(units_net),0) units
    from public.user_bets where owner and user_id=p_user and kind='manual' and game_date between start_day and today
  ) select jsonb_build_object(
    'profile',(select jsonb_build_object('display_name',display_name,'handle',coalesce(handle,display_name),
      'avatar',avatar,'bio',bio,'leaderboard_visible',leaderboard_visible) from public.public_profiles where user_id=p_user),
    'graded',(select count(*) from verified),'wins',(select count(*) from verified where status='won'),
    'losses',(select count(*) from verified where status='lost'),
    'tail',(select jsonb_build_object('graded',count(*),'wins',count(*)filter(where status='won'),'losses',count(*)filter(where status='lost')) from verified where kind='tail'),
    'fade',(select jsonb_build_object('graded',count(*),'wins',count(*)filter(where status='won'),'losses',count(*)filter(where status='lost')) from verified where kind='fade'),
    'gary_on_same_picks',(select jsonb_build_object('wins',count(*)filter(where (kind='tail' and status='won')or(kind='fade' and status='lost')),
      'losses',count(*)filter(where (kind='tail' and status='lost')or(kind='fade' and status='won'))) from verified),
    'streak',user_experience_private.streak_summary(p_user),
    'logged',case when owner then (select to_jsonb(l) from logged l) else null end,
    'after_loss',case when owner then (select jsonb_build_object('graded',count(*),'wins',count(*)filter(where status='won'),
      'losses',count(*)filter(where status='lost')) from ordered where previous='lost') else null end,
    'recent',case when owner then (select coalesce(jsonb_agg(jsonb_build_object('decision',case kind when 'tail' then 'bet' else 'fade' end,
      'outcome',status,'date',game_date) order by game_date desc,placed_at desc,id desc),'[]') from
      (select * from verified order by game_date desc,placed_at desc,id desc limit 20) r) else '[]'::jsonb end,
    'is_owner',owner,'window_start',start_day,'window_end',today
  ) into result;
  return result;
end;
$$;
revoke all on function public.profile_card(uuid,integer) from public;
grant execute on function public.profile_card(uuid,integer) to anon,authenticated;

-- Safe parsers are private: malformed provider JSON fails closed for a ticket.
create or replace function user_experience_private.timestamp_or_null(v text)
returns timestamptz language plpgsql immutable set search_path='' as $$
begin return nullif(v,'')::timestamptz; exception when others then return null; end;
$$;
create or replace function user_experience_private.american_odds(v text)
returns integer language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
 if btrim(coalesce(v,'')) !~ '^[+-]?[0-9]+([.]0+)?$' then return null; end if;
 n:=v::numeric; if abs(n) not between 100 and 100000 then return null; end if;
 return n::integer;
exception when others then return null; end;
$$;

create or replace function public.place_user_bet(
 p_game_date date,p_pick_id text,p_pick_text text,p_kind text,p_stake numeric default 1.0,p_streak boolean default false
) returns public.user_bets language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); v_pick jsonb; candidates jsonb[]; b public.user_bets; old_b public.user_bets;
 lock_time timestamptz; odds integer; home text; away text; picked_home boolean; league text; game_id text;
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_kind is null or p_kind not in ('tail','fade') then raise exception 'kind must be tail or fade'; end if;
 if p_stake is null or p_stake::text='NaN' or p_stake<0.01 or p_stake>10 then raise exception 'stake must be between 0.01 and 10 units'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,914007));
 with published as (
   select e p from public.daily_picks d cross join lateral jsonb_array_elements(
     case jsonb_typeof(d.picks) when 'array' then d.picks when 'string' then (d.picks#>>'{}')::jsonb else '[]'::jsonb end) e
   where d.date::text=p_game_date::text
   union all
   select e||jsonb_build_object('league','NFL') from public.weekly_nfl_picks d cross join lateral jsonb_array_elements(
     case jsonb_typeof(d.picks) when 'array' then d.picks when 'string' then (d.picks#>>'{}')::jsonb else '[]'::jsonb end) e
   where (user_experience_private.timestamp_or_null(e->>'commence_time') at time zone 'America/New_York')::date=p_game_date
 ), matched as (
   select distinct pub.p from published pub where
     case when nullif(p_pick_id,'') is not null then pub.p->>'pick_id'=p_pick_id else pub.p->>'pick'=p_pick_text end
 ) select array_agg(p) into candidates from matched;
 if coalesce(cardinality(candidates),0)=0 then raise exception 'pick not found'; end if;
 if cardinality(candidates)>1 then raise exception 'pick is ambiguous; refresh and try again'; end if;
 v_pick:=candidates[1]; league:=upper(v_pick->>'league'); game_id:=coalesce(v_pick->>'game_id',v_pick->>'bdl_game_id');
 if league not in ('MLB','NFL','NBA','NCAAF') then raise exception 'league is unavailable'; end if;
 if lower(coalesce(v_pick->>'season_type','')) in ('1','pre','preseason')
   or lower(coalesce(v_pick->>'tournamentContext','')) like '%preseason%' then raise exception 'preseason does not count in verified tracking'; end if;
 lock_time:=user_experience_private.timestamp_or_null(v_pick->>'commence_time');
 if lock_time is null then raise exception 'lock time unavailable'; end if;
 if now()>=lock_time then raise exception 'game is locked'; end if;
 perform user_experience_private.assert_pregame(lock_time,p_game_date,league,game_id);
 -- Existing lock and settled state survive changed or republished source JSON.
 select * into old_b from public.user_bets where user_id=u and game_date=p_game_date and pick_type='game' and pick_text=v_pick->>'pick' and kind in ('tail','fade')
   and (source_game_id=game_id or source_game_id is null) order by source_game_id nulls last limit 1 for update;
 if old_b.id is not null and (old_b.status<>'pending' or old_b.lock_at is null or now()>=old_b.lock_at) then raise exception 'game is locked'; end if;
 home:=v_pick->>'homeTeam'; away:=v_pick->>'awayTeam';
 if p_kind='tail' then odds:=user_experience_private.american_odds(v_pick->>'odds');
 elsif coalesce(v_pick->>'type','')='moneyline' or coalesce(v_pick->>'pick','') ilike '% ML %' then
   picked_home:=home is not null and position(lower(home) in lower(coalesce(v_pick->>'pick','')))>0;
   odds:=user_experience_private.american_odds(case when picked_home then v_pick->>'moneylineAway' else v_pick->>'moneylineHome' end);
 end if;
 perform set_config('app.user_bets_rpc','1',true);
 if old_b.id is not null and old_b.source_game_id is null then
   update public.user_bets set source_game_id=game_id where id=old_b.id;
 end if;
 insert into public.user_bets(user_id,kind,pick_type,game_date,league,pick_text,matchup,odds_american,odds_estimated,
   stake_units,lock_at,gary_confidence,source_game_id,source_pick_id)
 values(u,p_kind,'game',p_game_date,league,v_pick->>'pick',coalesce(away,'')||' @ '||coalesce(home,''),odds,odds is null,
   p_stake,lock_time,nullif(v_pick->>'confidence','')::numeric,game_id,v_pick->>'pick_id')
 on conflict(user_id,game_date,pick_type,pick_text,(coalesce(source_game_id,''))) where kind in ('tail','fade')
 do update set kind=excluded.kind,stake_units=excluded.stake_units,odds_american=excluded.odds_american,
   odds_estimated=excluded.odds_estimated,source_game_id=excluded.source_game_id,source_pick_id=excluded.source_pick_id
 returning * into b;
 -- A normal repeat or side switch preserves an already designated pick.
 if coalesce(p_streak,false) then b:=public.set_streak_pick(b.id,true); end if;
 return b;
end;
$$;

create or replace function user_experience_private.place_prop(
 p_game_date date,p_player text,p_prop_type text,p_kind text,p_stake numeric default 1.0,p_streak boolean default false,
 p_game_id text default null,p_line numeric default null,p_side text default null
) returns public.user_bets language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); v_pick jsonb; candidates jsonb[]; b public.user_bets; old_b public.user_bets;
 lock_time timestamptz; odds integer; v_text text; v_league text; game_id text;
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_kind is null or p_kind not in ('tail','fade') then raise exception 'kind must be tail or fade'; end if;
 if p_stake is null or p_stake::text='NaN' or p_stake<0.01 or p_stake>10 then raise exception 'stake must be between 0.01 and 10 units'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,914007));
 select array_agg(distinct e) into candidates from public.prop_picks d cross join lateral jsonb_array_elements(d.picks) e
 where d.date::text=p_game_date::text and lower(coalesce(e->>'player',e->>'player_name',''))=lower(p_player)
 and lower(split_part(coalesce(e->>'prop',e->>'prop_type',''),' ',1))=lower(p_prop_type)
 and (p_game_id is null or coalesce(e->>'game_id',e->>'bdl_game_id')=p_game_id)
 and (p_line is null or nullif(e->>'line','')::numeric=p_line)
 and (p_side is null or lower(e->>'bet')=lower(p_side));
 if coalesce(cardinality(candidates),0)=0 then raise exception 'pick not found'; end if;
 if cardinality(candidates)>1 then raise exception 'multiple games match this prop; use the exact ticket'; end if;
 v_pick:=candidates[1]; v_league:=upper(coalesce(v_pick->>'sport','MLB')); game_id:=coalesce(v_pick->>'game_id',v_pick->>'bdl_game_id');
 if v_league not in ('MLB','NFL','NBA','NCAAF') then raise exception 'league is unavailable'; end if;
 if upper(coalesce(v_pick->>'lane','CORE')) in ('HR','TD') then raise exception 'fun-lane props are not part of the verified record'; end if;
 select min(ds.commence_time) into lock_time from public.daily_slate ds
 where ds.date::text=p_game_date::text and ds.bdl_game_id::text=game_id and upper(ds.league)=v_league;
 lock_time:=coalesce(lock_time,user_experience_private.timestamp_or_null(v_pick->>'commence_time'));
 if lock_time is null then raise exception 'lock time unavailable'; end if;
 if now()>=lock_time then raise exception 'game is locked'; end if;
 perform user_experience_private.assert_pregame(lock_time,p_game_date,v_league,game_id);
 odds:=case when p_kind='tail' then user_experience_private.american_odds(v_pick->>'odds') else null end;
 v_text:=coalesce(v_pick->>'player',v_pick->>'player_name')||' '||coalesce(v_pick->>'bet','over')||' '||coalesce(v_pick->>'line','')||' '||p_prop_type;
 select * into old_b from public.user_bets where user_id=u and game_date=p_game_date and pick_type='prop' and user_bets.pick_text=v_text and kind in ('tail','fade')
   and (source_game_id=game_id or source_game_id is null) order by source_game_id nulls last limit 1 for update;
 if old_b.id is not null and (old_b.status<>'pending' or old_b.lock_at is null or now()>=old_b.lock_at) then raise exception 'game is locked'; end if;
 perform set_config('app.user_bets_rpc','1',true);
 if old_b.id is not null and old_b.source_game_id is null then
   update public.user_bets set source_game_id=game_id where id=old_b.id;
 end if;
 insert into public.user_bets(user_id,kind,pick_type,game_date,league,pick_text,matchup,player_name,prop_type,
   odds_american,odds_estimated,stake_units,lock_at,source_game_id,source_line,source_side)
 values(u,p_kind,'prop',p_game_date,v_league,v_text,v_pick->>'matchup',coalesce(v_pick->>'player',v_pick->>'player_name'),p_prop_type,
   odds,odds is null,p_stake,lock_time,game_id,nullif(v_pick->>'line','')::numeric,lower(v_pick->>'bet'))
 on conflict(user_id,game_date,pick_type,pick_text,(coalesce(source_game_id,''))) where kind in ('tail','fade')
 do update set kind=excluded.kind,stake_units=excluded.stake_units,odds_american=excluded.odds_american,
   odds_estimated=excluded.odds_estimated,source_game_id=excluded.source_game_id,source_line=excluded.source_line,source_side=excluded.source_side
 returning * into b;
 if coalesce(p_streak,false) then b:=public.set_streak_pick(b.id,true); end if;
 return b;
end;
$$;
create or replace function public.place_user_prop_bet(
 p_game_date date,p_player text,p_prop_type text,p_kind text,p_stake numeric default 1.0,p_streak boolean default false
) returns public.user_bets language sql security definer set search_path='' as $$
 select user_experience_private.place_prop(p_game_date,p_player,p_prop_type,p_kind,p_stake,p_streak);
$$;
create or replace function public.place_user_prop_bet_v2(
 p_game_date date,p_player text,p_prop_type text,p_kind text,p_game_id text,p_line numeric,p_side text,
 p_stake numeric default 1.0,p_streak boolean default false
) returns public.user_bets language plpgsql security definer set search_path='' as $$
begin
 if nullif(p_game_id,'') is null or p_line is null or p_line::text='NaN' or p_side is null or lower(p_side) not in ('over','under') then
   raise exception 'exact prop ticket is required'; end if;
 return user_experience_private.place_prop(p_game_date,p_player,p_prop_type,p_kind,p_stake,p_streak,p_game_id,p_line,p_side);
end;
$$;
revoke all on function public.place_user_prop_bet_v2(date,text,text,text,text,numeric,text,numeric,boolean) from public,anon;
grant execute on function public.place_user_prop_bet_v2(date,text,text,text,text,numeric,text,numeric,boolean) to authenticated;
revoke all on function public.place_user_bet(date,text,text,text,numeric,boolean),public.place_user_prop_bet(date,text,text,text,numeric,boolean) from public,anon;
grant execute on function public.place_user_bet(date,text,text,text,numeric,boolean),public.place_user_prop_bet(date,text,text,text,numeric,boolean) to authenticated;

-- Correct any historical stale/best-only counters from the actual ledger.
do $$ declare u uuid; begin for u in select distinct user_id from public.user_bets where streak_pick loop
 perform user_experience_private.refresh_streak(u); end loop; end $$;
notify pgrst,'reload schema';
commit;
