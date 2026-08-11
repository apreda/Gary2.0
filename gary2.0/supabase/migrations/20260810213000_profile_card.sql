-- USER FLOW PHASE 2 backend (Aug 10 2026): the profile card reader — one
-- call powering the vs-Gary strip, the patterns card, and the identity
-- header. SECURITY DEFINER over user_picks/user_bets/user_streaks +
-- public_profiles; returns AGGREGATES as one jsonb (never bet rows beyond
-- the caller-requested recent decisions list). Public by product intent —
-- profiles and the leaderboard are social surfaces.

create or replace function public.profile_card(p_user uuid, p_days int default 30)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with tf as (
    select up.decision, up.outcome, up.created_at,
           (up.outcome in ('win','won'))  as is_win,
           (up.outcome in ('loss','lost')) as is_loss,
           lag(case when up.outcome in ('loss','lost') then true
                    when up.outcome in ('win','won') then false end)
             over (order by up.created_at) as prev_was_loss
    from user_picks up
    where up.user_id = p_user
      and up.created_at >= now() - make_interval(days => p_days)
  ),
  graded as (select * from tf where is_win or is_loss),
  lg as (
    select count(*) filter (where ub.graded_at is not null) as graded,
           count(*) filter (where ub.status = 'won') as wins,
           count(*) filter (where ub.status = 'lost') as losses,
           coalesce(sum(ub.units_net), 0) as units
    from user_bets ub
    where ub.user_id = p_user
      and ub.placed_at >= now() - make_interval(days => p_days)
  )
  select jsonb_build_object(
    'profile', (select jsonb_build_object(
        'display_name', pp.display_name, 'handle', pp.handle,
        'avatar', pp.avatar, 'bio', pp.bio)
      from public_profiles pp where pp.user_id = p_user),
    'graded',  (select count(*) from graded),
    'wins',    (select count(*) filter (where is_win) from graded),
    'losses',  (select count(*) filter (where is_loss) from graded),
    'tail', (select jsonb_build_object(
        'graded', count(*),
        'wins',   count(*) filter (where is_win),
        'losses', count(*) filter (where is_loss))
      from graded where decision = 'bet'),
    'fade', (select jsonb_build_object(
        'graded', count(*),
        'wins',   count(*) filter (where is_win),
        'losses', count(*) filter (where is_loss))
      from graded where decision = 'fade'),
    -- Gary's record on the SAME picks this user acted on: a tailed win
    -- means Gary won; a faded win means Gary lost. "I beat Gary this
    -- month" is computable only because the record is relational.
    'gary_on_same_picks', (select jsonb_build_object(
        'wins',   count(*) filter (where (decision = 'bet'  and is_win)
                                      or (decision = 'fade' and is_loss)),
        'losses', count(*) filter (where (decision = 'bet'  and is_loss)
                                      or (decision = 'fade' and is_win)))
      from graded),
    -- The self-knowledge stat every bettor needs: what do you do right
    -- after a loss?
    'after_loss', (select jsonb_build_object(
        'graded', count(*),
        'wins',   count(*) filter (where is_win),
        'losses', count(*) filter (where is_loss))
      from graded where prev_was_loss),
    'streak', (select jsonb_build_object('current', us.current, 'best', us.best)
      from user_streaks us where us.user_id = p_user),
    'logged', (select jsonb_build_object(
        'graded', lg.graded, 'wins', lg.wins, 'losses', lg.losses,
        'units', lg.units) from lg),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object(
        'decision', decision, 'outcome', outcome,
        'date', to_char(created_at at time zone 'America/New_York', 'YYYY-MM-DD'))
        order by created_at desc), '[]'::jsonb)
      from (select * from graded order by created_at desc limit 20) r)
  );
$$;

revoke all on function public.profile_card(uuid, int) from public;
grant execute on function public.profile_card(uuid, int) to anon, authenticated;

-- Identity self-service: a signed-in user sets their own handle/avatar/bio.
create or replace function public.update_my_profile(
  p_handle text default null, p_avatar text default null, p_bio text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not signed in');
  end if;
  insert into public_profiles (user_id, display_name, handle, avatar, bio)
  values (v_user, coalesce(p_handle, 'Bettor'), p_handle, p_avatar, p_bio)
  on conflict (user_id) do update set
    handle = coalesce(excluded.handle, public_profiles.handle),
    avatar = coalesce(excluded.avatar, public_profiles.avatar),
    bio    = coalesce(excluded.bio, public_profiles.bio);
  return jsonb_build_object('ok', true);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'handle taken');
end;
$$;

revoke all on function public.update_my_profile(text, text, text) from public;
grant execute on function public.update_my_profile(text, text, text) to authenticated;
