-- MLB game picks are always on Winners at Gary's own amount, never a default (founder, Oct 6 2026: "he can not pass
-- on MLB game picks so he need to put his own amount on them it cant default to an amount. it has to be Garys own
-- decision making"). The bet step asks MLB games for an amount with no pass (pickdesk/garyBet.js). An MLB game pick
-- without his amount is not admitted ('no_amount', no event, so the sweep stays quiet), and the bankroll trigger
-- refuses any play without his own whole-dollar amount instead of booking $100.
do $mig$
declare def text; nd text;
begin
  def := pg_get_functiondef('gary_private.admit_winners_candidate(bigint)'::regprocedure);
  nd := replace(def, ' elsif automatic_mlb then ok:=true;', ' elsif automatic_mlb and not play then return ''no_amount'';
 elsif automatic_mlb then ok:=true;');
  nd := replace(nd, '   case when automatic_mlb and play then format(''MLB game pick; automatic qualification; Gary bets it, $%s'',trunc(stake))
        when automatic_mlb then ''MLB game pick; automatic qualification; Gary passed''
        else format(''Gary bets it, $%s'',trunc(stake)) end);',
    '   case when automatic_mlb then format(''MLB game pick; automatic qualification; Gary bets it, $%s'',trunc(stake))
        else format(''Gary bets it, $%s'',trunc(stake)) end);');
  if nd = def or position('''no_amount''' in nd) = 0 or position('Gary passed' in nd) > 0 then raise exception 'admit markers not found'; end if;
  execute nd;

  def := pg_get_functiondef('gary_private.size_winners_bet()'::regprocedure);
  nd := replace(def, ' why:=''Automatic MLB game pick Gary passed on: $100.'';', ' why:=null;');
  nd := replace(nd, ' select cfg.initial_units+coalesce(sum(stake_units*flat_net_units),0),',
    ' if why is null then raise exception ''Winners books only the amount Gary names'';end if;
 select cfg.initial_units+coalesce(sum(stake_units*flat_net_units),0),');
  if nd = def or position('Winners books only the amount Gary names' in nd) = 0 or position('passed on: $100' in nd) > 0 then raise exception 'sizer markers not found'; end if;
  execute nd;
end $mig$;
