-- Three free picks on a Sunday (founder, Oct 4 2026).
--
-- "Always pick the morning NFL game, the SNF game and then a normal free pick
-- of the day. That is 3 free picks on Sunday." On a Sunday the NFL game that
-- kicks off before noon ET and Sunday Night Football each post as their own
-- free pick on X (social-auto-post reads free_pick_extras). The day's free
-- pick (streak_picks) is then chosen from everything else, so those two game
-- picks are left out of select_streak_pick. A Sunday with no morning game
-- posts two.

create or replace function gary_private.sunday_nfl_free_games(p_day date)
returns table (game_id text)
language sql stable
set search_path to ''
as $$
  select distinct s.bdl_game_id::text
  from public.daily_slate s
  where extract(dow from p_day) = 0 and s.date = p_day and s.league = 'NFL' and s.bdl_game_id is not null
    and ((s.commence_time at time zone 'America/New_York')::time < time '12:00'
      or exists (select 1 from public.winners_big_games g
                 where g.game_date = p_day::text and g.league = 'NFL' and g.game_id = s.bdl_game_id::text))
$$;
revoke all on function gary_private.sunday_nfl_free_games(date) from public;

-- Gary's published game pick on each of those games, for the poster.
create or replace function public.free_pick_extras(p_date text)
returns jsonb
language sql stable security definer
set search_path to ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.commence_time), '[]'::jsonb) from (
    select distinct on (c.game_id) c.id as candidate_id, c.league, c.kind, c.pick_text, c.odds, c.commence_time,
           coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')) as matchup
    from public.winners_candidates c
    where c.game_date = p_date and c.league = 'NFL' and c.kind = 'game'
      and c.game_id in (select f.game_id from gary_private.sunday_nfl_free_games(p_date::date) f)
    order by c.game_id, (c.admitted_at is not null) desc, c.created_at desc) x
$$;
revoke all on function public.free_pick_extras(text) from public, anon, authenticated;
grant execute on function public.free_pick_extras(text) to service_role;

create or replace function public.select_streak_pick(p_date text)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_pass timestamptz; r record; v_by text := 'stake bar'; v_waiting boolean; v_first_admitted timestamptz; v_own text[];
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  if exists (select 1 from public.streak_picks where game_date = p_date::date) then return false; end if;
  v_pass := gary_private.day_pass_at(p_date::date);
  -- Sunday's NFL games that post as their own free picks; never the day's free pick.
  v_own := array(select f.game_id from gary_private.sunday_nfl_free_games(p_date::date) f);

  -- Big games first.
  if exists (select 1 from public.winners_big_games g where g.game_date = p_date
               and not (g.league = 'NFL' and g.game_id = any(v_own))) then
    select exists (
             select 1 from public.winners_big_games g
             join public.daily_slate s on s.bdl_game_id::text = g.game_id and s.date = p_date::date
             where g.game_date = p_date and s.commence_time > now()
               and not (g.league = 'NFL' and g.game_id = any(v_own))
               and not exists (select 1 from public.winners_board w
                               where w.game_date = p_date and w.kind = 'game' and w.league = g.league and w.game_id = g.game_id)),
           (select min(c.commence_time) from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
             join public.winners_big_games g on g.game_date = w.game_date and g.league = w.league and g.game_id = w.game_id
             where w.game_date = p_date and w.kind = 'game' and c.commence_time > now()
               and not (g.league = 'NFL' and g.game_id = any(v_own)))
      into v_waiting, v_first_admitted;
    if v_waiting and (v_pass is null or now() < v_pass)
       and (v_first_admitted is null or now() < v_first_admitted - interval '75 minutes') then
      return false;
    end if;
    select w.candidate_id, w.league, w.kind, c.pick_text, c.odds, c.game_id, c.commence_time, w.stake_units,
           coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')) as matchup,
           c.pick_snapshot->>'player' as player, c.pick_snapshot->>'prop' as prop, c.pick_snapshot->>'bet' as bet
      into r
    from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
    join public.winners_big_games g on g.game_date = w.game_date and g.league = w.league and g.game_id = w.game_id
    where w.game_date = p_date and w.kind = 'game' and c.commence_time > now()
      and not (g.league = 'NFL' and g.game_id = any(v_own))
    order by coalesce(w.stake_units, 0) desc, c.commence_time desc, w.admitted_at asc
    limit 1;
    if found then
      insert into public.streak_picks (game_date, candidate_id, league, kind, pick_text, odds, matchup, game_id, commence_time, stake_units, player, prop, bet, chosen_by)
      values (p_date::date, r.candidate_id, r.league, r.kind, r.pick_text, r.odds, r.matchup, r.game_id, r.commence_time, r.stake_units, r.player, r.prop, r.bet, 'big game')
      on conflict do nothing;
      return found;
    end if;
  end if;

  -- No big game (or no big-game play): the Sep 29 rule.
  select w.candidate_id, w.league, w.kind, c.pick_text, c.odds, c.game_id, c.commence_time, w.stake_units,
         coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')) as matchup,
         c.pick_snapshot->>'player' as player, c.pick_snapshot->>'prop' as prop, c.pick_snapshot->>'bet' as bet
    into r
  from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
  where w.game_date = p_date and c.commence_time > now() and w.stake_units >= 3
    and not (w.kind = 'game' and w.league = 'NFL' and w.game_id = any(v_own))
  order by w.admitted_at asc, w.stake_units desc
  limit 1;
  if not found then
    if v_pass is not null and now() < v_pass then return false; end if;
    v_by := 'biggest stake';
    select w.candidate_id, w.league, w.kind, c.pick_text, c.odds, c.game_id, c.commence_time, w.stake_units,
           coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')) as matchup,
           c.pick_snapshot->>'player' as player, c.pick_snapshot->>'prop' as prop, c.pick_snapshot->>'bet' as bet
      into r
    from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
    where w.game_date = p_date and c.commence_time > now()
      and not (w.kind = 'game' and w.league = 'NFL' and w.game_id = any(v_own))
    order by coalesce(w.stake_units, 0) desc, (w.kind = 'game') desc, w.admitted_at asc
    limit 1;
    if not found then return false; end if;
  end if;
  insert into public.streak_picks (game_date, candidate_id, league, kind, pick_text, odds, matchup, game_id, commence_time, stake_units, player, prop, bet, chosen_by)
  values (p_date::date, r.candidate_id, r.league, r.kind, r.pick_text, r.odds, r.matchup, r.game_id, r.commence_time, r.stake_units, r.player, r.prop, r.bet, v_by)
  on conflict do nothing;
  return found;
end $function$;
