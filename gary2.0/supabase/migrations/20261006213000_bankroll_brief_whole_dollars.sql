-- Gary's bankroll summary adds up (Oct 6 2026): the season, last-7-days and yesterday totals round the sum of
-- each bet's result, not the sum of rounded results, so "you have $10,277" and "up $277" agree to the dollar.
do $mig$
declare def text; nd text;
begin
  def := pg_get_functiondef('public.winners_bankroll_brief()'::regprocedure);
  nd := replace(def, 'round(b.stake_units*b.flat_net_units*100) as net', 'b.stake_units*b.flat_net_units*100 as net');
  nd := replace(nd, '''net'',coalesce(sum(net),0)', '''net'',coalesce(round(sum(net)),0)');
  nd := replace(nd, '''stake'',round(stake),''result'',result,''net'',net)', '''stake'',round(stake),''result'',result,''net'',round(net))');
  if nd = def or position('round(sum(net))' in nd) = 0 or position('round(net))' in nd) = 0 then raise exception 'bankroll brief markers not found'; end if;
  execute nd;
end $mig$;
