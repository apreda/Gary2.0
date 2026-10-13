-- The Winners daily floor waits for late news (audit, Oct 13 2026). The floor wrote straight to the board at the
-- day pass, so a pick could go on real-money Winners before its late-news check, and a pick Gary had scratched on
-- late news could still be floored. Now a scratched pick is never chosen, and the chosen pick waits for its check
-- ('clear', 'stand', 'no_feed' or 'failed'), the same test seat_the_card uses.
CREATE OR REPLACE FUNCTION gary_private.winners_daily_floor(p_date text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_when timestamptz; c public.winners_candidates; v_own text[]; slot text; play boolean; stake numeric;
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
    and not exists (select 1 from public.winners_late_news l where l.candidate_id = x.id and l.decision = 'scratch')
  order by coalesce((select o.rank from gary_private.card_order(p_date) o where o.candidate_id = x.id), 999),
           coalesce((x.pick_snapshot->'gary_bet'->>'play')::boolean, false) desc,
           coalesce(case when jsonb_typeof(x.pick_snapshot->'gary_bet'->'stake_dollars') = 'number'
                         then (x.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric end, 0) desc,
           x.commence_time asc
  limit 1
  for update;
  if not found then return 'no_pick'; end if;
  -- The floor seats a pick only after its late-news check, as Gary's card does: until then it waits.
  if not exists (select 1 from public.winners_late_news l where l.candidate_id = c.id
                 and l.decision in ('clear', 'stand', 'no_feed', 'failed')) then
    return 'waiting_late_news';
  end if;

  slot := coalesce((select '#'||o.rank||' of '||o.of from gary_private.card_order(p_date) o where o.candidate_id = c.id), 'not on the card');
  play := coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean, false)
          and jsonb_typeof(c.pick_snapshot->'gary_bet'->'stake_dollars') = 'number'
          and (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric >= 100;
  stake := case when play then (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric else 100 end;

  begin   -- a floor failure is logged and never stops the free pick that runs after it
  insert into public.winners_board(candidate_id, game_date, league, kind, game_id, ticket_key, market_key, pick_snapshot,
                                   admitted_at, policy_version, reason)
  values (c.id, c.game_date, c.league, c.kind, c.game_id, c.ticket_key, c.market_key, c.pick_snapshot, clock_timestamp(),
          'winners-floor-v1',
          case when play then format('Daily floor: nothing else on Winners today. Gary plays it, $%s; card: %s', trunc(stake), slot)
               else format('Daily floor: nothing else on Winners today. Gary passed, $100 minimum; card: %s', slot) end);
  update public.winners_candidates set admitted_at = clock_timestamp() where id = c.id;
  insert into public.winners_decision_events(candidate_id, event, detail)
  values (c.id, 'admitted', jsonb_build_object('gate', 'daily_floor', 'card', slot, 'stake_dollars', stake,
          'play', play, 'policy_version', 'winners-floor-v1', 'floor_at', v_when));
  exception when others then
    insert into public.winners_decision_events(candidate_id, event, detail)
    values (c.id, 'floor_failed', jsonb_build_object('error', sqlerrm, 'floor_at', v_when));
    return 'failed: ' || sqlerrm;
  end;
  return 'admitted ' || c.id;
end $function$;
