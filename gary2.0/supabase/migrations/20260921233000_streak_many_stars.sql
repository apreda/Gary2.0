-- THE STREAK STAR (founder, Sep 21 2026): "They can select as many bets as
-- they want, but obviously, if a single one loses, their streak would restart."
-- The Aug 20 designation allowed one starred play per game day and released
-- any other claim for the date. Every starred verified tail/fade now counts;
-- user_experience_private.streak_summary already orders starred settled plays
-- by game_date, placed_at, id and starts a new run at every loss, so the
-- leaderboard needs no change.
create or replace function public.set_streak_pick(p_bet_id uuid,p_star boolean default true)
returns public.user_bets language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); b public.user_bets;
begin
  if u is null then raise exception 'not signed in'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,914007));
  select * into b from public.user_bets where id=p_bet_id and user_id=u for update;
  if b.id is null then raise exception 'bet not found'; end if;
  if b.kind not in ('tail','fade') then raise exception 'only verified picks can count toward a streak'; end if;
  if b.streak_pick=coalesce(p_star,true) then return b; end if;
  if b.status<>'pending' or b.lock_at is null or now()>=b.lock_at then raise exception 'game is locked'; end if;
  perform user_experience_private.assert_pregame(b.lock_at,b.game_date,b.league,b.source_game_id);
  update public.user_bets set streak_pick=coalesce(p_star,true) where id=b.id returning * into b;
  return b;
end;
$$;
revoke all on function public.set_streak_pick(uuid,boolean) from public,anon;
grant execute on function public.set_streak_pick(uuid,boolean) to authenticated;

-- The rule was also a partial unique index; every starred verified play counts now.
drop index if exists public.user_bets_one_streak_per_day;
