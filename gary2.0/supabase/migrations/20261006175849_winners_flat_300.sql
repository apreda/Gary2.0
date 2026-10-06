-- Every Winners play is $300 (founder, Oct 6 2026: "make each bet 300 for right now"). From Sep 25 to Oct 5
-- Gary's own amounts turned a 54-41-1 board into -$403; the same plays at $300 each come to +$605. Game picks
-- by his amount: under $300 13-6, $300 6-5-1, over $300 7-10. MLB games he passes on (admitted automatically,
-- $100 until now) are $300 too (founder, same day).
--
-- Gary still answers play or pass and names an amount. The amount stays on the pick (gary_bet) and in the
-- bankroll_committed event as gary_dollars, and it still decides admission where a rule reads it (props: clear
-- or $300+; college: clear, or lean over $300). Nothing Gary reads changes.
--
-- The free pick, the per-league top free pick and the parlay's Winners legs ranked by the board stake. With
-- every stake at $300 they would all tie, so they rank by the amount Gary named (gary_named_dollars: his amount
-- when he played it, $100 when he did not, the old booking rule) and choose exactly as before.

create or replace function gary_private.gary_named_dollars(snap jsonb)
 returns numeric
 language sql
 immutable
 set search_path to ''
as $function$
  select case
    when jsonb_typeof(snap->'gary_bet'->'stake_dollars') is distinct from 'number' then 100
    when not coalesce((snap->'gary_bet'->>'play')::boolean, false) then 100
    when (snap->'gary_bet'->>'stake_dollars')::numeric >= 100
     and (snap->'gary_bet'->>'stake_dollars')::numeric = trunc((snap->'gary_bet'->>'stake_dollars')::numeric)
      then (snap->'gary_bet'->>'stake_dollars')::numeric
    else 100 end
$function$;
grant execute on function gary_private.gary_named_dollars(jsonb) to service_role;

create or replace function gary_private.size_winners_bet()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare cfg public.gary_bankroll; c public.winners_candidates;
 requested numeric:=3; equity numeric; open_risk numeric; amount numeric; named numeric; why text;
begin
 select * into cfg from public.gary_bankroll where id;
 if new.admitted_at<cfg.started_at or new.game_date<(cfg.started_at at time zone 'America/New_York')::date::text then return new;end if;
 perform pg_advisory_xact_lock(1616092026);
 select * into c from public.winners_candidates where id=new.candidate_id;
 if c.commence_time<=clock_timestamp() or c.commence_time is null or c.odds is null or abs(c.odds)<100 then
  raise exception 'Bankroll requires an original, priced, pregame ticket';
 end if;
 -- Every Winners play is $300 (founder, Oct 6 2026). The amount Gary named is recorded, not booked.
 named:=case when coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false) then gary_private.gary_named_dollars(c.pick_snapshot) end;
 why:=case when named is null then 'Every Winners play is $300; Gary passed on this one.'
           else format('Every Winners play is $300; Gary named $%s.',trunc(named)) end;
 select cfg.initial_units+coalesce(sum(stake_units*flat_net_units),0),
  coalesce(sum(stake_units) filter(where result='pending'),0)
 into equity,open_risk from gary_private.bankroll_ledger;
 amount:=greatest(0,trunc(least(requested,equity-open_risk)*10000)/10000);
 new.stake_units:=amount;
 new.bankroll_policy:=cfg.policy_version;
 insert into public.winners_decision_events(candidate_id,event,detail) values(new.candidate_id,'bankroll_committed',jsonb_build_object(
  'policy_version',cfg.policy_version,'requested_units',requested,'requested_dollars',requested*100,'stake_units',amount,'stake_dollars',amount*100,
  'gary_dollars',named,
  'equity_before',equity,'open_risk_before',open_risk,
  'assessment',coalesce(c.review->>'assessment','unreviewed'),
  'stake_reason',why,
  'adjustment',case when amount=0 then 'Bankroll cash exhausted; ticket remains a prediction, no funds invented.'
   when amount<requested then 'Reduced to the bankroll''s cash on hand.' else 'Requested stake accepted.' end));
 return new;
end $function$;

do $mig$
declare def text; nd text;
begin
  -- The streak pick: rank by the amount Gary named.
  def := pg_get_functiondef('public.select_streak_pick(text)'::regprocedure);
  nd := replace(def, '-- The streak pick: the first Winners play at $300 or more; else the biggest stake at the day pass.',
    '-- The streak pick: the first Winners play Gary named $300 or more for; else the biggest amount he named, at the day pass.'
    || chr(10) || '  -- Every play is booked at $300 since Oct 6 2026; this reads the amount Gary named.');
  if nd = def then raise exception 'select_streak_pick: comment marker not found'; end if;
  def := nd;
  nd := replace(def, 'and c.commence_time > now() and w.stake_units >= 3',
    'and c.commence_time > now() and w.stake_units > 0 and gary_private.gary_named_dollars(c.pick_snapshot) >= 300');
  if nd = def then raise exception 'select_streak_pick: stake bar not found'; end if;
  def := nd;
  nd := replace(def, 'order by w.admitted_at asc, w.stake_units desc',
    'order by w.admitted_at asc, gary_private.gary_named_dollars(c.pick_snapshot) desc');
  if nd = def then raise exception 'select_streak_pick: first order not found'; end if;
  def := nd;
  nd := replace(def, 'order by coalesce(w.stake_units, 0) desc, (w.kind = ''game'') desc, w.admitted_at asc',
    'order by (coalesce(w.stake_units, 0) > 0) desc, gary_private.gary_named_dollars(c.pick_snapshot) desc, (w.kind = ''game'') desc, w.admitted_at asc');
  if nd = def then raise exception 'select_streak_pick: biggest-stake order not found'; end if;
  execute nd;

  -- The per-league top free pick: rank by the amount Gary named.
  def := pg_get_functiondef('public.top_free_pick_choose(text,text)'::regprocedure);
  nd := replace(def, 'order by b.stake_units desc nulls last,',
    'order by (coalesce(b.stake_units, 0) > 0) desc, gary_private.gary_named_dollars(b.pick_snapshot) desc,');
  if nd = def then raise exception 'top_free_pick_choose: order not found'; end if;
  execute nd;

  -- The parlay's Winners legs: one per game and the top four, by the amount Gary named.
  def := pg_get_functiondef('gary_private.parlay_pick_legs(date)'::regprocedure);
  nd := replace(def, 'l.commence_time, b.stake_units,',
    'l.commence_time, gary_private.gary_named_dollars(b.pick_snapshot) as stake_units,');
  if nd = def then raise exception 'parlay_pick_legs: board stake not found'; end if;
  execute nd;
end $mig$;
