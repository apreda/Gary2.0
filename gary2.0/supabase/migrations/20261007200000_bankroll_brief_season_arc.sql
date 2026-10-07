-- Gary's bankroll brief carries his season arc (founder, Oct 7 2026: "just so he fully understands his own arc, his
-- own graph"): his bankroll at the end of each day with a settled bet, and the season's high and low with their
-- dates. Facts only; nothing in the brief says what they mean for a bet.
CREATE OR REPLACE FUNCTION public.winners_bankroll_brief()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with cfg as (select initial_units, started_at from public.gary_bankroll where id),
  t as (select (now() at time zone 'America/New_York')::date as d),
  l as (select b.*, b.game_date::date as gd, b.stake_units*100 as stake, b.stake_units*b.flat_net_units*100 as net,
               (b.kind='game' and b.league='MLB' and coalesce(w.pick_snapshot->'gary_bet'->>'play','false')<>'true') as automatic_pass
        from gary_private.bankroll_ledger b join public.winners_board w on w.candidate_id=b.candidate_id),
  s as (select * from l where result in ('won','lost','push')),
  tally as (select gd, result, stake, net from s),
  daily as (select gd, sum(net) as day_net from s group by gd),
  curve as (select gd, round((select initial_units from cfg)*100 + sum(day_net) over (order by gd)) as dollars from daily)
  select jsonb_build_object(
    'start_dollars', round(cfg.initial_units*100),
    'started_on', (cfg.started_at at time zone 'America/New_York')::date,
    'equity_dollars', round((cfg.initial_units+coalesce((select sum(stake_units*flat_net_units) from l),0))*100),
    'riding_dollars', coalesce((select round(sum(stake)) from l where result='pending'),0),
    'cash_dollars', round((cfg.initial_units+coalesce((select sum(stake_units*flat_net_units) from l),0))*100)
                    - coalesce((select round(sum(stake)) from l where result='pending'),0),
    'season', (select jsonb_build_object('won',count(*) filter (where result='won'),'lost',count(*) filter (where result='lost'),
                 'push',count(*) filter (where result='push'),'net',coalesce(round(sum(net)),0),'risked',coalesce(round(sum(stake)),0)) from tally),
    'arc', (select jsonb_build_object(
              'days', coalesce(jsonb_agg(jsonb_build_object('date', gd, 'dollars', dollars) order by gd), '[]'::jsonb),
              'high', (select jsonb_build_object('date', gd, 'dollars', dollars) from curve order by dollars desc, gd limit 1),
              'low', (select jsonb_build_object('date', gd, 'dollars', dollars) from curve order by dollars asc, gd limit 1))
            from curve),
    'last7', (select jsonb_build_object('from',t.d-7,'to',t.d-1,'won',count(*) filter (where result='won'),'lost',count(*) filter (where result='lost'),
                 'push',count(*) filter (where result='push'),'net',coalesce(round(sum(net)),0),'risked',coalesce(round(sum(stake)),0))
              from tally where gd between t.d-7 and t.d-1),
    'yesterday', (select jsonb_build_object('date',t.d-1,'won',count(*) filter (where result='won'),'lost',count(*) filter (where result='lost'),
                 'push',count(*) filter (where result='push'),'net',coalesce(round(sum(net)),0),'risked',coalesce(round(sum(stake)),0),
                 'bets',coalesce(jsonb_agg(jsonb_build_object('pick_text',pick_text,'league',league,'kind',kind,'odds',odds,
                   'stake',round(stake),'result',result,'net',round(net),'automatic_pass',automatic_pass) order by commence_time) filter (where gd=t.d-1),'[]'::jsonb))
              from s where gd=t.d-1),
    'riding', (select coalesce(jsonb_agg(jsonb_build_object('pick_text',pick_text,'league',league,'kind',kind,'odds',odds,
                 'stake',round(stake),'game_date',game_date,'automatic_pass',automatic_pass) order by commence_time),'[]'::jsonb) from l where result='pending'))
  from cfg, t;
$function$;
