-- Big games and the free pick (founder, Oct 1 2026).
--
-- 1. "All playoff game picks no matter the amount Gary puts, and SNF, MNF and
--    TNF. Simple." Every one of those games is a big game, and the Winners
--    gate already admits Gary's pick on a big game whatever he stakes ($100
--    when he passes). A playoff day or a Monday doubleheader has several, so
--    winners_big_games keeps one row per game instead of one per league.
--
-- 2. The free pick of the day (streak_picks) is the post the whole day's
--    marketing hangs on, so it follows the big games: Gary's Winners play on
--    today's big games, his biggest stake among them (a tie goes to the later
--    start, the bigger audience). It waits until every big game still to
--    start has its play on the board. It stops waiting at the day pass, or
--    75 minutes before the first admitted big game starts, so the post always
--    goes out before first pitch. A day with no big game, or no big-game play
--    by then, keeps the Sep 29 rule: the first play at $300 or more, else the
--    biggest stake at the day pass.

alter table public.winners_big_games drop constraint if exists winners_big_games_game_date_league_key;
alter table public.winners_big_games drop constraint if exists winners_big_games_game_date_league_game_id_key;
alter table public.winners_big_games add constraint winners_big_games_game_date_league_game_id_key unique (game_date, league, game_id);

create or replace function public.select_streak_pick(p_date text)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_pass timestamptz; r record; v_by text := 'stake bar'; v_waiting boolean; v_first_admitted timestamptz;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  if exists (select 1 from public.streak_picks where game_date = p_date::date) then return false; end if;
  v_pass := gary_private.day_pass_at(p_date::date);

  -- Big games first.
  if exists (select 1 from public.winners_big_games g where g.game_date = p_date) then
    select exists (
             select 1 from public.winners_big_games g
             join public.daily_slate s on s.bdl_game_id::text = g.game_id and s.date = p_date::date
             where g.game_date = p_date and s.commence_time > now()
               and not exists (select 1 from public.winners_board w
                               where w.game_date = p_date and w.kind = 'game' and w.league = g.league and w.game_id = g.game_id)),
           (select min(c.commence_time) from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
             join public.winners_big_games g on g.game_date = w.game_date and g.league = w.league and g.game_id = w.game_id
             where w.game_date = p_date and w.kind = 'game' and c.commence_time > now())
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
    order by coalesce(w.stake_units, 0) desc, (w.kind = 'game') desc, w.admitted_at asc
    limit 1;
    if not found then return false; end if;
  end if;
  insert into public.streak_picks (game_date, candidate_id, league, kind, pick_text, odds, matchup, game_id, commence_time, stake_units, player, prop, bet, chosen_by)
  values (p_date::date, r.candidate_id, r.league, r.kind, r.pick_text, r.odds, r.matchup, r.game_id, r.commence_time, r.stake_units, r.player, r.prop, r.bet, v_by)
  on conflict do nothing;
  return found;
end $function$;
