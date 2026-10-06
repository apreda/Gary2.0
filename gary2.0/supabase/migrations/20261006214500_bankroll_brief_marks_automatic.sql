-- Gary's bankroll summary marks an automatic MLB game he passed on (Oct 6 2026). His first notebook called
-- yesterday's $100 White Sox play "the only bet I sized small"; it was an automatic MLB game he had passed on,
-- booked at $100. Each listed bet now says whether it was his bet or an automatic play he passed.
do $mig$
declare def text; nd text;
begin
  def := pg_get_functiondef('public.winners_bankroll_brief()'::regprocedure);
  nd := replace(def,
    'l as (select b.*, b.game_date::date as gd, b.stake_units*100 as stake, b.stake_units*b.flat_net_units*100 as net
        from gary_private.bankroll_ledger b),',
    'l as (select b.*, b.game_date::date as gd, b.stake_units*100 as stake, b.stake_units*b.flat_net_units*100 as net,
               (b.kind=''game'' and b.league=''MLB'' and coalesce(w.pick_snapshot->''gary_bet''->>''play'',''false'')<>''true'') as automatic_pass
        from gary_private.bankroll_ledger b join public.winners_board w on w.candidate_id=b.candidate_id),');
  nd := replace(nd, '''stake'',round(stake),''result'',result,''net'',round(net))', '''stake'',round(stake),''result'',result,''net'',round(net),''automatic_pass'',automatic_pass)');
  nd := replace(nd, '''stake'',round(stake),''game_date'',game_date)', '''stake'',round(stake),''game_date'',game_date,''automatic_pass'',automatic_pass)');
  if position('automatic_pass'',automatic_pass)' in nd) = 0 or position('join public.winners_board w' in nd) = 0
     or (length(nd) - length(replace(nd, '''automatic_pass'',automatic_pass', ''))) / length('''automatic_pass'',automatic_pass') <> 2 then
    raise exception 'bankroll brief markers not found';
  end if;
  execute nd;
end $mig$;
