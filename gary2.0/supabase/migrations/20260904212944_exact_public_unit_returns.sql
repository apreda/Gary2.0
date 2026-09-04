-- Public one-unit returns must not inherit tiny-stake payout rounding.
begin;
create or replace function user_experience_private.one_unit_result(p_status text,p_odds integer)
returns numeric language sql immutable set search_path='' as $$
 select case p_status when 'lost' then -1 when 'won' then
   case when p_odds>=100 then p_odds/100.0 when p_odds<=-100 then 100.0/abs(p_odds::numeric) else 100.0/110 end
   else 0 end;
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
 ) select rank() over(order by t.wins-t.losses desc,t.wins desc,t.graded desc),t.user_id,p.display_name,
 coalesce(p.handle,p.display_name),p.avatar,t.graded,t.wins,t.losses,t.units
 from totals t join public.public_profiles p using(user_id)
 where p.leaderboard_visible and t.graded>=greatest(coalesce(p_min_graded,5),5)
 and not exists(select 1 from user_experience_private.excluded_profiles e where e.user_id=t.user_id)
 order by 1,t.user_id limit 100;
$$;
notify pgrst,'reload schema';
commit;
