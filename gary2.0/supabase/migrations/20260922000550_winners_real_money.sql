-- Winners is real money (founder, Sep 22 2026): Gary's bankroll is $10,000 and
-- one ledger unit is $100 of it. Every ticket, game or prop, is sized by its
-- own decision at a $100 minimum and a $1,000 top; the only reduction is cash
-- on hand. The per-game, per-sport-day and open-risk caps are gone.

alter table public.winners_board drop constraint if exists winners_board_stake_units_check;
alter table public.winners_board add constraint winners_board_stake_units_check check (stake_units between 0 and 10);

create or replace function gary_private.size_winners_bet() returns trigger
language plpgsql security invoker set search_path='' as $$
declare cfg public.gary_bankroll; c public.winners_candidates; decision jsonb;
 requested numeric:=1; equity numeric; open_risk numeric; amount numeric; dollars numeric;
begin
 select * into cfg from public.gary_bankroll where id;
 if new.admitted_at<cfg.started_at or new.game_date<(cfg.started_at at time zone 'America/New_York')::date::text then return new;end if;
 perform pg_advisory_xact_lock(1616092026);
 select * into c from public.winners_candidates where id=new.candidate_id;
 if c.commence_time<=clock_timestamp() or c.commence_time is null or c.odds is null or abs(c.odds)<100 then
  raise exception 'Bankroll requires an original, priced, pregame ticket';
 end if;
 select detail into decision from public.winners_decision_events
  where candidate_id=new.candidate_id and event='curated' order by id desc limit 1;
 -- Whole dollars, $100 to $1,000, with written reasons; anything else is the $100 minimum.
 if jsonb_typeof(decision->'stake_dollars')='number' then
  dollars:=(decision->>'stake_dollars')::numeric;
  if dollars=trunc(dollars) and dollars between 100 and 1000
    and length(trim(coalesce(decision->>'stake_reason','')))>=10 and length(trim(coalesce(decision->>'price_reason','')))>=10 then
   requested:=dollars/100;
  end if;
 end if;
 select cfg.initial_units+coalesce(sum(stake_units*flat_net_units),0),
  coalesce(sum(stake_units) filter(where result='pending'),0)
 into equity,open_risk from gary_private.bankroll_ledger;
 -- Only cash on hand can trim a request.
 amount:=greatest(0,trunc(least(requested,equity-open_risk)*10000)/10000);
 new.stake_units:=amount;
 new.bankroll_policy:=cfg.policy_version;
 insert into public.winners_decision_events(candidate_id,event,detail) values(new.candidate_id,'bankroll_committed',jsonb_build_object(
  'policy_version',cfg.policy_version,'requested_units',requested,'requested_dollars',requested*100,'stake_units',amount,'stake_dollars',amount*100,
  'equity_before',equity,'open_risk_before',open_risk,
  'assessment',coalesce(decision->>'assessment','unreviewed'),
  'stake_reason',coalesce(decision->>'stake_reason','Minimum $100 stake; no complete supported sizing review.'),
  'price_reason',coalesce(decision->>'price_reason','Original published odds; measurable positive expected value is not established.'),
  'adjustment',case when amount=0 then 'Bankroll cash exhausted; ticket remains a prediction, no funds invented.'
   when amount<requested then 'Reduced to the bankroll''s cash on hand.' else 'Requested stake accepted.' end));
 return new;
end $$;
