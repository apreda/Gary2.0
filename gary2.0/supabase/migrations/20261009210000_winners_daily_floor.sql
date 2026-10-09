-- THE DAILY FLOOR (founder, Oct 9 2026: "we should have at least one game always make it to winners no matter
-- what per day so bettors don't miss a day ever as long as games exist ... you decide how all that works and
-- make it work").
--
-- When the day's pass arrives (gary_private.day_pass_at: 45 minutes before the day's main window, the moment the
-- free pick already falls back to the biggest stake) and nothing is on Winners yet (darts and scratched plays do
-- not count), one of Gary's published game picks goes on the board anyway:
--   the judge's best grade (clear, lean, toss-up, unsupported, unread), then a pick Gary played over one he
--   passed, then his bigger amount, then the earliest start;
--   only a game that starts at least 20 minutes later, with an original price.
-- It is booked like every game play: size_winners_bet stakes Gary's amount when he played it, the $100 minimum
-- when he passed. The board row says it came in on the floor and what the judge said. select_streak_pick, run
-- right after in the same cron job, then makes it the day's free pick ("biggest stake" after the pass).
-- With no slate rows for the day, the floor uses 45 minutes before the earliest game pick instead.

create or replace function gary_private.winners_daily_floor(p_date text)
returns text
language plpgsql
set search_path to ''
as $$
declare v_when timestamptz; c public.winners_candidates; v_own text[]; grade text; play boolean; stake numeric;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  if exists (select 1 from public.winners_board w
             where w.game_date = p_date and w.policy_version <> 'darts-top-v1' and w.scratched_at is null) then
    return 'has_play';
  end if;
  v_when := coalesce(gary_private.day_pass_at(p_date::date),
                     (select min(x.commence_time) - interval '45 minutes' from public.winners_candidates x
                      where x.game_date = p_date and x.kind = 'game'));
  if v_when is null then return 'no_games'; end if;
  if clock_timestamp() < v_when then return 'waiting'; end if;
  -- Sunday's NFL games post as their own free picks and never become the day's free pick.
  v_own := array(select f.game_id from gary_private.sunday_nfl_free_games(p_date::date) f);

  select * into c from public.winners_candidates x
  where x.game_date = p_date and x.kind = 'game' and x.admitted_at is null
    and x.commence_time > clock_timestamp() + interval '20 minutes'
    and x.odds is not null and abs(x.odds) >= 100
    and not (x.league = 'NFL' and x.game_id = any(v_own))
  order by case x.review->>'assessment' when 'clear' then 1 when 'lean' then 2 when 'toss_up' then 3 when 'unsupported' then 4 else 5 end,
           coalesce((x.pick_snapshot->'gary_bet'->>'play')::boolean, false) desc,
           coalesce(case when jsonb_typeof(x.pick_snapshot->'gary_bet'->'stake_dollars') = 'number'
                         then (x.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric end, 0) desc,
           x.commence_time asc
  limit 1
  for update;
  if not found then return 'no_pick'; end if;

  grade := coalesce(c.review->>'assessment', 'unread');
  play := coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean, false)
          and jsonb_typeof(c.pick_snapshot->'gary_bet'->'stake_dollars') = 'number'
          and (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric >= 100;
  stake := case when play then (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric else 100 end;

  begin   -- a floor failure is logged and never stops the free pick that runs after it
  insert into public.winners_board(candidate_id, game_date, league, kind, game_id, ticket_key, market_key, pick_snapshot,
                                   admitted_at, policy_version, reason)
  values (c.id, c.game_date, c.league, c.kind, c.game_id, c.ticket_key, c.market_key, c.pick_snapshot, clock_timestamp(),
          'winners-floor-v1',
          case when play then format('Daily floor: nothing else on Winners today. Gary plays it, $%s; judge: %s', trunc(stake), grade)
               else format('Daily floor: nothing else on Winners today. Gary passed, $100 minimum; judge: %s', grade) end);
  update public.winners_candidates set admitted_at = clock_timestamp() where id = c.id;
  insert into public.winners_decision_events(candidate_id, event, detail)
  values (c.id, 'admitted', jsonb_build_object('gate', 'daily_floor', 'assessment', grade, 'stake_dollars', stake,
          'play', play, 'policy_version', 'winners-floor-v1', 'floor_at', v_when));
  exception when others then
    insert into public.winners_decision_events(candidate_id, event, detail)
    values (c.id, 'floor_failed', jsonb_build_object('error', sqlerrm, 'floor_at', v_when));
    return 'failed: ' || sqlerrm;
  end;
  return 'admitted ' || c.id;
end $$;

revoke all on function gary_private.winners_daily_floor(text) from public;

-- One job, in order: the floor, then the free pick (it reads the board the floor may have just filled).
select cron.schedule('streak-pick-select', '*/2 * * * *',
  $cron$select gary_private.winners_daily_floor(to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD'));
select public.select_streak_pick(to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD'))$cron$);
