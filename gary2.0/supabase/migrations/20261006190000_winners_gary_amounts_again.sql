-- Back to Gary's own amounts (founder, Oct 6 2026, the same afternoon: "i dont really want them all to have the
-- same amount because that isnt betting with a bankroll that is just like counting wins and losses"; for today:
-- "Back to his own amounts"). Undoes 20261006175849_winners_flat_300.sql: the bankroll books the amount Gary
-- names ($100 when he passed), and the free pick, the per-league top free pick and the parlay's Winners legs
-- rank by the board stake again. gary_named_dollars is dropped.

create or replace function gary_private.size_winners_bet()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare cfg public.gary_bankroll; c public.winners_candidates; bet jsonb;
 requested numeric:=1; equity numeric; open_risk numeric; amount numeric; dollars numeric; why text;
begin
 select * into cfg from public.gary_bankroll where id;
 if new.admitted_at<cfg.started_at or new.game_date<(cfg.started_at at time zone 'America/New_York')::date::text then return new;end if;
 perform pg_advisory_xact_lock(1616092026);
 select * into c from public.winners_candidates where id=new.candidate_id;
 if c.commence_time<=clock_timestamp() or c.commence_time is null or c.odds is null or abs(c.odds)<100 then
  raise exception 'Bankroll requires an original, priced, pregame ticket';
 end if;
 bet:=c.pick_snapshot->'gary_bet';
 why:='Minimum $100 stake; Gary gave no sizing.';
 if coalesce((bet->>'play')::boolean,false) and jsonb_typeof(bet->'stake_dollars')='number' then
  dollars:=(bet->>'stake_dollars')::numeric;
  if dollars=trunc(dollars) and dollars>=100 then
   requested:=dollars/100;
   why:=coalesce(nullif(trim(bet->>'why'),''),'Gary sized it.');
  end if;
 end if;
 select cfg.initial_units+coalesce(sum(stake_units*flat_net_units),0),
  coalesce(sum(stake_units) filter(where result='pending'),0)
 into equity,open_risk from gary_private.bankroll_ledger;
 amount:=greatest(0,trunc(least(requested,equity-open_risk)*10000)/10000);
 new.stake_units:=amount;
 new.bankroll_policy:=cfg.policy_version;
 insert into public.winners_decision_events(candidate_id,event,detail) values(new.candidate_id,'bankroll_committed',jsonb_build_object(
  'policy_version',cfg.policy_version,'requested_units',requested,'requested_dollars',requested*100,'stake_units',amount,'stake_dollars',amount*100,
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
  def := pg_get_functiondef('public.select_streak_pick(text)'::regprocedure);
  nd := replace(def, '-- The streak pick: the first Winners play Gary named $300 or more for; else the biggest amount he named, at the day pass.'
    || chr(10) || '  -- Every play is booked at $300 since Oct 6 2026; this reads the amount Gary named.',
    '-- The streak pick: the first Winners play at $300 or more; else the biggest stake at the day pass.');
  if nd = def then raise exception 'select_streak_pick: comment marker not found'; end if;
  def := nd;
  nd := replace(def, 'and c.commence_time > now() and w.stake_units > 0 and gary_private.gary_named_dollars(c.pick_snapshot) >= 300',
    'and c.commence_time > now() and w.stake_units >= 3');
  if nd = def then raise exception 'select_streak_pick: stake bar not found'; end if;
  def := nd;
  nd := replace(def, 'order by w.admitted_at asc, gary_private.gary_named_dollars(c.pick_snapshot) desc',
    'order by w.admitted_at asc, w.stake_units desc');
  if nd = def then raise exception 'select_streak_pick: first order not found'; end if;
  def := nd;
  nd := replace(def, 'order by (coalesce(w.stake_units, 0) > 0) desc, gary_private.gary_named_dollars(c.pick_snapshot) desc, (w.kind = ''game'') desc, w.admitted_at asc',
    'order by coalesce(w.stake_units, 0) desc, (w.kind = ''game'') desc, w.admitted_at asc');
  if nd = def then raise exception 'select_streak_pick: biggest-stake order not found'; end if;
  execute nd;

  def := pg_get_functiondef('public.top_free_pick_choose(text,text)'::regprocedure);
  nd := replace(def, 'order by (coalesce(b.stake_units, 0) > 0) desc, gary_private.gary_named_dollars(b.pick_snapshot) desc,',
    'order by b.stake_units desc nulls last,');
  if nd = def then raise exception 'top_free_pick_choose: order not found'; end if;
  execute nd;

  def := pg_get_functiondef('gary_private.parlay_pick_legs(date)'::regprocedure);
  nd := replace(def, 'l.commence_time, gary_private.gary_named_dollars(b.pick_snapshot) as stake_units,',
    'l.commence_time, b.stake_units,');
  if nd = def then raise exception 'parlay_pick_legs: board stake not found'; end if;
  execute nd;
end $mig$;

drop function gary_private.gary_named_dollars(jsonb);
