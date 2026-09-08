-- Public profile safety. Private reports never enter public standings or Book.
begin;
create schema if not exists profile_safety_private;
revoke all on schema profile_safety_private from public,anon,authenticated;
grant usage on schema profile_safety_private to service_role;

create table profile_safety_private.blocks (
 viewer_id uuid not null references auth.users(id) on delete cascade,
 subject_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 primary key(viewer_id,subject_id), check(viewer_id<>subject_id)
);
create index profile_blocks_subject on profile_safety_private.blocks(subject_id);
create table profile_safety_private.reports (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references auth.users(id) on delete cascade,
 subject_id uuid not null references auth.users(id) on delete cascade,
 reason text not null check(reason in ('spam','harassment','hate','sexual_content','threats','impersonation','other')),
 details text not null default '' check(length(details)<=1000),
 profile_snapshot jsonb not null,
 status text not null default 'open' check(status in ('open','dismissed','actioned')),
 created_at timestamptz not null default clock_timestamp(),
 reviewed_at timestamptz,reviewer text,review_note text,
 check(reporter_id<>subject_id)
);
create unique index profile_reports_open_pair on profile_safety_private.reports(reporter_id,subject_id) where status='open';
create index profile_reports_reporter_time on profile_safety_private.reports(reporter_id,created_at desc);
create index profile_reports_queue on profile_safety_private.reports(created_at,id) where status='open';
create index profile_reports_subject on profile_safety_private.reports(subject_id);
create table profile_safety_private.moderation (
 user_id uuid primary key references auth.users(id) on delete cascade,
 hidden boolean not null,reason text not null check(length(reason) between 1 and 1000),
 reviewer text not null check(length(reviewer) between 1 and 80),
 updated_at timestamptz not null default clock_timestamp()
);
create table profile_safety_private.review_log (
 id uuid primary key default gen_random_uuid(),
 subject_id uuid not null references auth.users(id) on delete cascade,
 report_id uuid references profile_safety_private.reports(id) on delete set null,
 action text not null check(action in ('hide','restore','dismiss')),
 note text not null check(length(note) between 1 and 1000),
 reviewer text not null check(length(reviewer) between 1 and 80),
 created_at timestamptz not null default clock_timestamp()
);
create index profile_review_subject on profile_safety_private.review_log(subject_id,created_at desc);
alter table profile_safety_private.blocks enable row level security;
alter table profile_safety_private.reports enable row level security;
alter table profile_safety_private.moderation enable row level security;
alter table profile_safety_private.review_log enable row level security;
revoke all on all tables in schema profile_safety_private from public,anon,authenticated;
grant select on all tables in schema profile_safety_private to service_role;

-- A small deterministic first layer, backed by reports and human review.
-- Reject links/contact spam, explicit sexual/slur/threat phrases and control
-- characters in PUBLIC identity text. Never inspect private Book notes.
create function profile_safety_private.text_allowed(p_text text)
returns boolean language plpgsql immutable set search_path='' as $$
declare v text:=lower(coalesce(p_text,'')); compact text;
begin
 v:=regexp_replace(v,E'[\t\r\n]',' ','g');
 if v ~ '[[:cntrl:]]' or v ~ '(https?://|www[.]|[[:alnum:]_.+-]+@[[:alnum:].-]+[.][a-z]{2,})' then return false; end if;
 compact:=regexp_replace(translate(v,'013457@$','oieastas'),'[^a-z]','','g');
 return compact !~ '(nigger|nigga|faggot|heilhitler|whitepower|killallwomen|killallmen|killyourself|rapeyou|childporn|freeporn|onlyfans|pornhub|fuckyou|fuckoff|fucking)'
   and compact !~ '^(fuck|cunt|porn|nude|nudes)$'
   and v !~ '(^|[^a-z])(fuck|fucking|cunt|porn|nude|nudes)([^a-z]|$)';
end;
$$;
create function profile_safety_private.validate_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not profile_safety_private.text_allowed(new.display_name)
    or not profile_safety_private.text_allowed(new.handle)
    or not profile_safety_private.text_allowed(new.bio) then
   -- An existing flagged profile can still be made private while awaiting an edit.
   if tg_op='UPDATE' and new.display_name is not distinct from old.display_name
      and new.handle is not distinct from old.handle and new.bio is not distinct from old.bio then return new; end if;
   -- save_my_profile uses INSERT ON CONFLICT, whose INSERT trigger runs first.
   -- Allow an unchanged existing identity so preferences/opt-out still work.
   -- is_public continues to suppress that identity until its text is corrected.
   if tg_op='INSERT' and exists(select 1 from public.public_profiles p where p.user_id=new.user_id
      and new.display_name is not distinct from p.display_name and new.handle is not distinct from p.handle
      and new.bio is not distinct from p.bio) then return new; end if;
   raise exception 'profile text is not allowed; remove abusive wording, links or contact details';
 end if;
 return new;
end;
$$;
create trigger profile_identity_safety before insert or update of display_name,handle,bio
 on public.public_profiles for each row execute function profile_safety_private.validate_identity();

create function profile_safety_private.is_public(p_user uuid)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.public_profiles p where p.user_id=p_user and p.leaderboard_visible
  and profile_safety_private.text_allowed(p.display_name) and profile_safety_private.text_allowed(p.handle)
  and profile_safety_private.text_allowed(p.bio)
  and not exists(select 1 from profile_safety_private.moderation m where m.user_id=p_user and m.hidden)
  and not exists(select 1 from user_experience_private.excluded_profiles e where e.user_id=p_user));
$$;
create function profile_safety_private.is_blocked(p_user uuid)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from profile_safety_private.blocks b where b.viewer_id=auth.uid() and b.subject_id=p_user);
$$;
create function profile_safety_private.content_hidden(p_user uuid)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from profile_safety_private.moderation m where m.user_id=p_user and m.hidden)
  or exists(select 1 from public.public_profiles p where p.user_id=p_user and
    (not profile_safety_private.text_allowed(p.display_name) or not profile_safety_private.text_allowed(p.handle)
      or not profile_safety_private.text_allowed(p.bio)));
$$;
create function profile_safety_private.require_account()
returns uuid language plpgsql stable set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or not exists(select 1 from auth.users where id=u) then raise exception 'not signed in'; end if;
 return u;
end;
$$;

-- Narrow, explicitly granted API gateways. SECURITY DEFINER is necessary to
-- keep the private schema/tables inaccessible to clients; identity is always
-- derived from auth.uid(), never a caller-provided owner or user metadata.
create function public.report_profile(p_user uuid,p_reason text,p_details text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=profile_safety_private.require_account(); report_id uuid; at_time timestamptz;
begin
 if p_user is null or p_user=u then raise exception 'profile is not available for reporting'; end if;
 if p_reason is null or p_reason not in ('spam','harassment','hate','sexual_content','threats','impersonation','other')
    or length(coalesce(p_details,''))>1000 then raise exception 'invalid report'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,920008));
 at_time:=clock_timestamp();
 select id into report_id from profile_safety_private.reports where reporter_id=u and subject_id=p_user and status='open';
 if report_id is not null then return jsonb_build_object('ok',true,'report_id',report_id); end if;
 if not profile_safety_private.is_public(p_user) then raise exception 'profile is not available for reporting'; end if;
 if (select count(*) from profile_safety_private.reports where reporter_id=u and created_at>at_time-interval '1 hour')>=5
    or (select count(*) from profile_safety_private.reports where reporter_id=u and created_at>at_time-interval '1 day')>=20 then
   raise exception 'report limit reached; try later or contact support'; end if;
 insert into profile_safety_private.reports(reporter_id,subject_id,reason,details,profile_snapshot)
 select u,p_user,p_reason,btrim(coalesce(p_details,'')),jsonb_build_object('display_name',p.display_name,'handle',p.handle,'bio',p.bio,'avatar',p.avatar)
 from public.public_profiles p where p.user_id=p_user and profile_safety_private.is_public(p.user_id)
 returning id into report_id;
 if report_id is null then raise exception 'profile is not available for reporting'; end if;
 return jsonb_build_object('ok',true,'report_id',report_id);
end;
$$;
create function public.set_profile_block(p_user uuid,p_blocked boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=profile_safety_private.require_account();
begin
 if p_user is null or p_user=u or p_blocked is null then raise exception 'invalid block request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,920009));
 if not p_blocked then
  delete from profile_safety_private.blocks where viewer_id=u and subject_id=p_user;
 elsif not exists(select 1 from profile_safety_private.blocks where viewer_id=u and subject_id=p_user) then
  if not profile_safety_private.is_public(p_user) then raise exception 'profile is not available'; end if;
  if (select count(*) from profile_safety_private.blocks where viewer_id=u)>=500 then raise exception 'block limit reached; manage blocked players'; end if;
  insert into profile_safety_private.blocks(viewer_id,subject_id) values(u,p_user);
 end if;
 return jsonb_build_object('ok',true,'blocked',p_blocked);
end;
$$;
create function public.get_profile_safety(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=profile_safety_private.require_account();
begin
 return jsonb_build_object('blocked',profile_safety_private.is_blocked(p_user),'is_owner',u=p_user,
   'my_profile_hidden',case when u=p_user then profile_safety_private.content_hidden(u) else false end);
end;
$$;
create function public.my_blocked_profiles()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=profile_safety_private.require_account(); result jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('user_id',b.subject_id,'display_name',
  case when profile_safety_private.is_public(p.user_id) then p.display_name else 'Player' end)
  order by b.created_at desc,b.subject_id),'[]') into result
 from profile_safety_private.blocks b join public.public_profiles p on p.user_id=b.subject_id where b.viewer_id=u;
 return result;
end;
$$;

-- Human moderation never edits bets, stakes, scores, or an opt-in preference.
-- Restore is explicit and refuses content that still fails the basic filter.
create function public.review_profile_safety(p_user uuid,p_action text,p_note text,p_reviewer text,p_report uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_action is null or p_action not in ('hide','restore','dismiss') or length(btrim(coalesce(p_note,''))) not between 1 and 1000
   or length(btrim(coalesce(p_reviewer,''))) not between 1 and 80 then raise exception 'invalid moderation decision'; end if;
 if not exists(select 1 from public.public_profiles where user_id=p_user) then raise exception 'profile not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,920010));
 if p_report is not null and not exists(select 1 from profile_safety_private.reports where id=p_report and subject_id=p_user and status='open') then
  raise exception 'report is not open for this profile'; end if;
 if p_action='dismiss' and p_report is null then raise exception 'a report is required to dismiss'; end if;
 if p_action='restore' and exists(select 1 from public.public_profiles p where p.user_id=p_user and
  (not profile_safety_private.text_allowed(p.display_name) or not profile_safety_private.text_allowed(p.handle) or not profile_safety_private.text_allowed(p.bio))) then
   raise exception 'profile text must be corrected before restoring'; end if;
 if p_action in ('hide','restore') then
  insert into profile_safety_private.moderation(user_id,hidden,reason,reviewer)
  values(p_user,p_action='hide',btrim(p_note),btrim(p_reviewer))
  on conflict(user_id) do update set hidden=excluded.hidden,reason=excluded.reason,reviewer=excluded.reviewer,updated_at=clock_timestamp();
 end if;
 if p_report is not null then
  update profile_safety_private.reports set status=case p_action when 'hide' then 'actioned' else 'dismissed' end,
   reviewed_at=clock_timestamp(),reviewer=btrim(p_reviewer),review_note=btrim(p_note) where id=p_report;
 end if;
 insert into profile_safety_private.review_log(subject_id,report_id,action,note,reviewer) values(p_user,p_report,p_action,btrim(p_note),btrim(p_reviewer));
 return jsonb_build_object('ok',true);
end;
$$;

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
      coalesce(sum(user_experience_private.one_unit_result(status,odds_american)),0) units
    from public.user_bets where kind in ('tail','fade') and graded_by='system' and status in ('won','lost','push')
      and game_date between start_day and today and (l='all' or upper(league)=l)
    group by user_id
  ), eligible as (
    select t.*,p.display_name,coalesce(p.handle,p.display_name) handle,p.avatar,
      round(100.0*t.wins/nullif(t.decided,0),1) win_pct,
      user_experience_private.streak_summary(t.user_id,l) streak
    from totals t join public.public_profiles p using(user_id)
    where t.decided>=5 and p.leaderboard_visible
      and profile_safety_private.is_public(t.user_id)
  ), metrics as (
    select user_id,display_name,handle,avatar,wins,losses,pushes,round(units,2) units,win_pct,decided,
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
    'window',w,'sort',s,'league',l,'window_start',start_day,'window_end',today,
    'hidden_count',(select count(*) from ranked)-(select count(*) from visible),
    'profile_hidden',profile_safety_private.content_hidden(auth.uid()),
    'has_more',(select count(*) from visible)>p_offset+p_limit) into answer;
  return answer;
end;
$$;

create or replace function public.leaderboard(p_lane text default 'tail',p_days integer default 30,p_min_graded integer default 5)
returns table(rank bigint,user_id uuid,display_name text,handle text,avatar text,graded bigint,wins bigint,losses bigint,units numeric)
language sql stable security definer set search_path='' as $$
 with totals as (
 select b.user_id,count(*) filter(where status in ('won','lost')) graded,
 count(*) filter(where status='won') wins,count(*) filter(where status='lost') losses,sum(user_experience_private.one_unit_result(status,odds_american)) units
 from public.user_bets b where b.kind=case p_lane when 'fade' then 'fade' else 'tail' end
 and p_lane in ('tail','fade') and graded_by='system' and status in ('won','lost','push')
 and game_date between (now() at time zone 'America/New_York')::date-least(greatest(coalesce(p_days,30),1),366)+1
 and (now() at time zone 'America/New_York')::date group by b.user_id
 ), ranked as (select rank() over(order by t.wins-t.losses desc,t.wins desc,t.graded desc) rank,t.user_id,p.display_name,
 coalesce(p.handle,p.display_name) handle,p.avatar,t.graded,t.wins,t.losses,t.units
 from totals t join public.public_profiles p using(user_id)
 where p.leaderboard_visible and t.graded>=greatest(coalesce(p_min_graded,5),5)
 and profile_safety_private.is_public(t.user_id)
) select * from ranked where not profile_safety_private.is_blocked(user_id) order by rank,user_id limit 100;
$$;

create or replace function public.profile_card(p_user uuid,p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare owner boolean:=coalesce(auth.uid()=p_user,false); result jsonb;
 start_day date:=(now() at time zone 'America/New_York')::date-least(greatest(coalesce(p_days,30),1),366)+1;
 today date:=(now() at time zone 'America/New_York')::date;
begin
  if not owner and (not profile_safety_private.is_public(p_user) or profile_safety_private.is_blocked(p_user)) then
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


revoke all on all functions in schema profile_safety_private from public,anon,authenticated;
revoke all on function public.report_profile(uuid,text,text),public.set_profile_block(uuid,boolean),public.get_profile_safety(uuid),public.my_blocked_profiles() from public,anon;
grant execute on function public.report_profile(uuid,text,text),public.set_profile_block(uuid,boolean),public.get_profile_safety(uuid),public.my_blocked_profiles() to authenticated;
revoke all on function public.review_profile_safety(uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.review_profile_safety(uuid,text,text,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
