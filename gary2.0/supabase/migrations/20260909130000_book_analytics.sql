-- Your Book analytics (Sep 9 2026): bet market + tags, follows for a friends
-- board lens, a per-user counter for the slip scanner. Additive and backwards
-- compatible: every existing client call shape keeps working.
begin;

-- ── 1. market + tags ────────────────────────────────────────────────────────
alter table public.user_bets
  add column if not exists market text,
  add column if not exists tags text[] not null default '{}';
alter table public.user_bets drop constraint if exists user_bets_market_check;
alter table public.user_bets add constraint user_bets_market_check
  check (market is null or market in ('moneyline','spread','total','prop','parlay','other'));
alter table public.user_bets drop constraint if exists user_bets_tags_check;
alter table public.user_bets add constraint user_bets_tags_check check (cardinality(tags) <= 8);

-- The market of a published pick, from its JSON type first and the pick text
-- second. A price such as -150 is three digits and never reads as a spread.
create or replace function user_experience_private.market_for(p_type text, p_pick text, p_pick_type text)
returns text language sql immutable set search_path='' as $$
  select case
    when p_pick_type='prop' then 'prop'
    when lower(coalesce(p_type,'')) in ('moneyline','ml','h2h','money line') then 'moneyline'
    when lower(coalesce(p_type,'')) in ('spread','spreads','run line','runline','run_line','puck line','puckline') then 'spread'
    when lower(coalesce(p_type,'')) in ('total','totals','over','under','over/under') then 'total'
    when coalesce(p_pick,'') ~* '(^|\s)ML(\s|$)' then 'moneyline'
    when coalesce(p_pick,'') ~* '(^|\s)(over|under)(\s|$)' or coalesce(p_pick,'') ~* '(^|\s)[ou]\s?\d' then 'total'
    when coalesce(p_pick,'') ~ '[+-]\d{1,2}(\.\d)?(\s|$)' then 'spread'
    else null end;
$$;

-- Tags: lowercase, trimmed, distinct, at most 8, 1–24 safe characters each.
create or replace function user_experience_private.clean_tags(p_tags text[])
returns text[] language plpgsql immutable set search_path='' as $$
declare cleaned text[];
begin
  select coalesce(array_agg(distinct t order by t),'{}') into cleaned
  from (select lower(btrim(x)) t from unnest(coalesce(p_tags,'{}')) x where btrim(coalesce(x,''))<>'') s;
  if cardinality(cleaned)>8 then raise exception 'up to 8 tags per bet'; end if;
  if exists(select 1 from unnest(cleaned) t where t !~ '^[a-z0-9][a-z0-9 _.\-]{0,23}$') then
    raise exception 'tags are 1 to 24 letters, numbers, spaces, dashes or underscores'; end if;
  return cleaned;
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
  new.tags := user_experience_private.clean_tags(new.tags);
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
  -- Only personal annotation (favorite, notes, sportsbook, tags) is editable on
  -- locked verified tickets. Before lock, stake and the legacy streak flag
  -- remain editable; identity, market and grading are server-owned.
  if (to_jsonb(new)-array['is_favorite','notes','bookmaker','tags','stake_units','streak_pick']) is distinct from
     (to_jsonb(old)-array['is_favorite','notes','bookmaker','tags','stake_units','streak_pick']) then
    raise exception 'verified ticket and result are server-owned'; end if;
  if (new.stake_units is distinct from old.stake_units or new.streak_pick is distinct from old.streak_pick)
     and (old.status<>'pending' or old.lock_at is null or now()>=old.lock_at) then
    raise exception 'game is locked'; end if;
  return new;
end;
$$;

-- place_user_bet: unchanged body plus the derived market on insert and side switch.
create or replace function public.place_user_bet(
 p_game_date date,p_pick_id text,p_pick_text text,p_kind text,p_stake numeric default 1.0,p_streak boolean default false
) returns public.user_bets language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); v_pick jsonb; candidates jsonb[]; b public.user_bets; old_b public.user_bets;
 lock_time timestamptz; odds integer; home text; away text; picked_home boolean; league text; game_id text; v_market text;
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
 v_market:=user_experience_private.market_for(v_pick->>'type',v_pick->>'pick','game');
 perform set_config('app.user_bets_rpc','1',true);
 if old_b.id is not null and old_b.source_game_id is null then
   update public.user_bets set source_game_id=game_id where id=old_b.id;
 end if;
 insert into public.user_bets(user_id,kind,pick_type,game_date,league,pick_text,matchup,odds_american,odds_estimated,
   stake_units,lock_at,gary_confidence,source_game_id,source_pick_id,market)
 values(u,p_kind,'game',p_game_date,league,v_pick->>'pick',coalesce(away,'')||' @ '||coalesce(home,''),odds,odds is null,
   p_stake,lock_time,nullif(v_pick->>'confidence','')::numeric,game_id,v_pick->>'pick_id',v_market)
 on conflict(user_id,game_date,pick_type,pick_text,(coalesce(source_game_id,''))) where kind in ('tail','fade')
 do update set kind=excluded.kind,stake_units=excluded.stake_units,odds_american=excluded.odds_american,
   odds_estimated=excluded.odds_estimated,source_game_id=excluded.source_game_id,source_pick_id=excluded.source_pick_id,
   market=coalesce(excluded.market,public.user_bets.market)
 returning * into b;
 -- A normal repeat or side switch preserves an already designated pick.
 if coalesce(p_streak,false) then b:=public.set_streak_pick(b.id,true); end if;
 return b;
end;
$$;

-- place_prop: unchanged body plus market='prop'.
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
   odds_american,odds_estimated,stake_units,lock_at,source_game_id,source_line,source_side,market)
 values(u,p_kind,'prop',p_game_date,v_league,v_text,v_pick->>'matchup',coalesce(v_pick->>'player',v_pick->>'player_name'),p_prop_type,
   odds,odds is null,p_stake,lock_time,game_id,nullif(v_pick->>'line','')::numeric,lower(v_pick->>'bet'),'prop')
 on conflict(user_id,game_date,pick_type,pick_text,(coalesce(source_game_id,''))) where kind in ('tail','fade')
 do update set kind=excluded.kind,stake_units=excluded.stake_units,odds_american=excluded.odds_american,
   odds_estimated=excluded.odds_estimated,source_game_id=excluded.source_game_id,source_line=excluded.source_line,source_side=excluded.source_side,
   market='prop'
 returning * into b;
 if coalesce(p_streak,false) then b:=public.set_streak_pick(b.id,true); end if;
 return b;
end;
$$;

-- Backfill: every verified ticket gets its market from the text it was placed with.
update public.user_bets set market=user_experience_private.market_for(null,pick_text,pick_type)
where market is null and kind in ('tail','fade');

-- ── 2. Follows (the friends lens) ───────────────────────────────────────────
create table if not exists public.user_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint user_follows_not_self check (follower_id <> followed_id)
);
alter table public.user_follows enable row level security;
drop policy if exists user_follows_owner_select on public.user_follows;
create policy user_follows_owner_select on public.user_follows for select to authenticated
  using ((select auth.uid())=follower_id);
grant select on public.user_follows to authenticated;
revoke all on public.user_follows from anon;
create index if not exists user_follows_followed on public.user_follows(followed_id);

create or replace function public.set_follow(p_user uuid,p_follow boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); n integer;
begin
  if u is null then raise exception 'not signed in'; end if;
  if p_user is null or p_user=u then raise exception 'you cannot follow yourself'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,914009));
  if coalesce(p_follow,true) then
    if not profile_safety_private.is_public(p_user) or profile_safety_private.is_blocked(p_user) then
      raise exception 'this player is not available'; end if;
    select count(*) into n from public.user_follows where follower_id=u;
    if n>=500 then raise exception 'follow limit reached'; end if;
    insert into public.user_follows(follower_id,followed_id) values(u,p_user) on conflict do nothing;
  else
    delete from public.user_follows where follower_id=u and followed_id=p_user;
  end if;
  select count(*) into n from public.user_follows where follower_id=u;
  return jsonb_build_object('ok',true,'following',coalesce(p_follow,true),'count',n);
end;
$$;
revoke all on function public.set_follow(uuid,boolean) from public,anon;
grant execute on function public.set_follow(uuid,boolean) to authenticated;

create or replace function public.my_follows()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('ok',true,'rows',coalesce((
    select jsonb_agg(jsonb_build_object('user_id',f.followed_id,'display_name',p.display_name,
      'handle',coalesce(p.handle,p.display_name),'avatar',p.avatar,
      'available',profile_safety_private.is_public(f.followed_id) and not profile_safety_private.is_blocked(f.followed_id))
      order by f.created_at desc)
    from public.user_follows f left join public.public_profiles p on p.user_id=f.followed_id
    where f.follower_id=auth.uid()),'[]'));
$$;
revoke all on function public.my_follows() from public,anon;
grant execute on function public.my_follows() to authenticated;

-- The board gains a scope. One function only: PostgREST refuses overloads,
-- so the five-argument version is dropped and the sixth argument defaults.
drop function if exists public.your_book_leaderboard_v3(text,text,text,integer,integer);
create or replace function public.your_book_leaderboard_v3(
 p_window text default '30d',p_sort text default 'streak',p_league text default 'all',p_limit integer default 50,p_offset integer default 0,
 p_scope text default 'all'
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w text:=lower(coalesce(p_window,'30d')); s text:=lower(coalesce(p_sort,'streak'));
 l text:=case when lower(coalesce(p_league,'all'))='all' then 'all' else upper(p_league) end;
 sc text:=lower(coalesce(p_scope,'all'));
 today date:=(now() at time zone 'America/New_York')::date; start_day date; answer jsonb;
begin
  if w not in ('7d','30d','season') or s not in ('streak','wins','record','units') or l not in ('all','MLB','NFL','NBA','NCAAF') then
    raise exception 'invalid leaderboard filter'; end if;
  if sc not in ('all','friends') then raise exception 'invalid leaderboard scope'; end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then raise exception 'invalid leaderboard page'; end if;
  -- 7d and 30d include today and the preceding 6/29 ET calendar days.
  -- Season begins at the later of the verified-record launch and January 1.
  start_day:=case w when '7d' then today-6 when '30d' then today-29 else greatest(date '2026-03-01',date_trunc('year',today)::date) end;
  with totals as (
    select user_id,count(*) filter(where status='won') wins,count(*) filter(where status='lost') losses,
      count(*) filter(where status='push') pushes,count(*) filter(where status in ('won','lost')) decided,
      coalesce(sum(user_experience_private.one_unit_result(status,odds_american)),0) units
    from public.user_bets where kind in ('tail','fade') and graded_by='system' and status in ('won','lost','push')
      and game_date between start_day and today and (l='all' or upper(league)=l)
    group by user_id
  ), eligible as (
    select t.*,p.display_name,coalesce(p.handle,p.display_name) handle,p.avatar,
      round(100.0*t.wins/nullif(t.decided,0),1) win_pct,
      user_experience_private.streak_summary(t.user_id,l) streak,
      exists(select 1 from public.user_follows f where f.follower_id=auth.uid() and f.followed_id=t.user_id) following
    from totals t join public.public_profiles p using(user_id)
    where t.decided>=5 and p.leaderboard_visible
      and profile_safety_private.is_public(t.user_id)
      and (sc='all' or t.user_id=auth.uid()
           or exists(select 1 from public.user_follows f where f.follower_id=auth.uid() and f.followed_id=t.user_id))
  ), metrics as (
    select user_id,display_name,handle,avatar,wins,losses,pushes,round(units,2) units,win_pct,decided,following,
      (streak->>'streak_len')::int streak_len,streak->>'streak_kind' streak_kind,(streak->>'best')::int best_streak,
      case s when 'streak' then (streak->>'current')::numeric when 'wins' then wins::numeric
        when 'record' then wins::numeric/nullif(decided,0) when 'units' then units end score
    from eligible
  ), ranked as (
    select rank() over(order by score desc,wins desc,decided desc) rank,metrics.* from metrics
  ), visible as (select * from ranked where not profile_safety_private.is_blocked(user_id)),
  paged as (select * from visible order by rank,user_id limit p_limit offset p_offset)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)-'score' order by rank,user_id) from paged p),'[]'),
    'me',(select to_jsonb(r)-'score' from ranked r where user_id=auth.uid()),
    'qualified_count',(select count(*) from ranked),'min_decided',5,
    'my_decided',coalesce((select decided from totals where user_id=auth.uid()),0),
    'window',w,'sort',s,'league',l,'scope',sc,'window_start',start_day,'window_end',today,
    'following_count',coalesce((select count(*) from public.user_follows where follower_id=auth.uid()),0),
    'hidden_count',(select count(*) from ranked)-(select count(*) from visible),
    'profile_hidden',profile_safety_private.content_hidden(auth.uid()),
    'has_more',(select count(*) from visible)>p_offset+p_limit) into answer;
  return answer;
end;
$$;
revoke all on function public.your_book_leaderboard_v3(text,text,text,integer,integer,text) from public;
grant execute on function public.your_book_leaderboard_v3(text,text,text,integer,integer,text) to anon,authenticated;

-- ── 3. Slip scanner usage counter ───────────────────────────────────────────
create table if not exists user_experience_private.slip_scans (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);
create or replace function public.record_slip_scan()
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); d date:=(now() at time zone 'America/New_York')::date; n integer;
begin
  if u is null then raise exception 'not signed in'; end if;
  insert into user_experience_private.slip_scans(user_id,day,count) values(u,d,1)
  on conflict(user_id,day) do update set count=user_experience_private.slip_scans.count+1 returning count into n;
  if n>40 then raise exception 'daily scan limit reached'; end if;
  return jsonb_build_object('ok',true,'used',n,'limit',40);
end;
$$;
revoke all on function public.record_slip_scan() from public,anon;
grant execute on function public.record_slip_scan() to authenticated;

notify pgrst,'reload schema';
commit;
