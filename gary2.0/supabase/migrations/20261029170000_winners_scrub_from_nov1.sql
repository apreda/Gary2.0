-- THE SCRUB WAITS FOR NOV 1 (founder, Oct 29 2026: "we cant scrub until people understand and it should go into
-- effect nov 1 so people can see and understand its happening"). Oct 17 stays on the record until its effective date;
-- until then the bankroll carries the notice (what will happen), from that day the note (what happened).
begin;

alter table public.winners_scrubbed_days add column effective_date date not null default '2026-11-01';
alter table public.winners_scrubbed_days add column notice text;
update public.winners_scrubbed_days set notice = 'Starting Nov 1, Oct 17 comes off Gary''s record. A bug put all 20 of his college picks on Winners that day, and he would never bet 22 games in one day. In place of the $3,195 that day lost, his bankroll will take a $1,000 charge.' where game_date = '2026-10-17';
alter table public.winners_scrubbed_days alter column notice set not null;
alter table public.winners_scrubbed_days alter column effective_date drop default;

create or replace view gary_private.bankroll_ledger as
SELECT b.candidate_id,
    b.game_date,
    b.league,
    b.kind,
    b.game_id,
    b.admitted_at,
    b.stake_units,
    c.pick_text,
    c.odds,
    c.commence_time,
        CASE
            WHEN s.game_date IS NOT NULL THEN 'scrubbed'::text
            WHEN b.scratched_at IS NOT NULL THEN 'void'::text
            WHEN g.grades = 1 THEN g.result
            ELSE 'pending'::text
        END AS result,
        CASE
            WHEN s.game_date IS NOT NULL THEN s.created_at
            WHEN b.scratched_at IS NOT NULL THEN b.scratched_at
            WHEN g.grades = 1 THEN g.settled_at
            ELSE NULL::timestamp with time zone
        END AS settled_at,
        CASE
            WHEN s.game_date IS NOT NULL THEN 0::numeric
            WHEN b.scratched_at IS NOT NULL THEN 0::numeric
            WHEN g.grades = 1 THEN
            CASE g.result
                WHEN 'won'::text THEN
                CASE
                    WHEN c.odds > 0 THEN c.odds::numeric / 100.0
                    ELSE 100.0 / abs(c.odds)::numeric
                END
                WHEN 'lost'::text THEN - 1::numeric
                ELSE 0::numeric
            END
            ELSE 0::numeric
        END AS flat_net_units
   FROM public.winners_board b
     JOIN public.winners_candidates c ON c.id = b.candidate_id
     LEFT JOIN public.winners_scrubbed_days s ON s.game_date = b.game_date
       AND s.effective_date <= (now() AT TIME ZONE 'America/New_York')::date
     CROSS JOIN LATERAL ( SELECT count(DISTINCT results.outcome) AS grades,
            min(results.outcome) AS result,
            max(results.at) AS settled_at
           FROM ( SELECT
                        CASE d.result
                            WHEN 'hit'::text THEN 'won'::text
                            WHEN 'miss'::text THEN 'lost'::text
                            WHEN 'void'::text THEN 'void'::text
                            ELSE NULL::text
                        END AS outcome,
                    d.graded_at AS at
                   FROM public.darts d
                  WHERE b.policy_version = 'darts-top-v1'::text AND d.id = ((b.pick_snapshot ->> 'dart_id'::text)::bigint)
                UNION ALL
                 SELECT
                        CASE lower(btrim(r.result))
                            WHEN 'win'::text THEN 'won'::text
                            WHEN 'loss'::text THEN 'lost'::text
                            WHEN 'pushed'::text THEN 'push'::text
                            WHEN 'voided'::text THEN 'void'::text
                            ELSE lower(btrim(r.result))
                        END AS lower,
                    GREATEST(r.created_at, r.updated_at) AS "greatest"
                   FROM public.game_results r
                  WHERE b.kind = 'game'::text AND b.league <> 'NFL'::text AND r.game_date = b.game_date::date AND r.league = b.league AND r.game_id = b.game_id AND lower(regexp_replace(btrim(r.pick_text), '\s+'::text, ' '::text, 'g'::text)) = lower(regexp_replace(btrim(c.pick_text), '\s+'::text, ' '::text, 'g'::text))
                UNION ALL
                 SELECT
                        CASE
                            WHEN r.season_type = 1 THEN 'void'::text
                            ELSE
                            CASE lower(btrim(r.result::text))
                                WHEN 'win'::text THEN 'won'::text
                                WHEN 'loss'::text THEN 'lost'::text
                                WHEN 'pushed'::text THEN 'push'::text
                                WHEN 'voided'::text THEN 'void'::text
                                ELSE lower(btrim(r.result::text))
                            END
                        END AS lower,
                    GREATEST(r.created_at, r.updated_at) AS "greatest"
                   FROM public.nfl_results r
                  WHERE b.kind = 'game'::text AND b.league = 'NFL'::text AND r.game_date = b.game_date::date AND r.game_id = b.game_id AND lower(regexp_replace(btrim(r.pick_text), '\s+'::text, ' '::text, 'g'::text)) = lower(regexp_replace(btrim(c.pick_text), '\s+'::text, ' '::text, 'g'::text))
                UNION ALL
                 SELECT
                        CASE lower(btrim(r.result))
                            WHEN 'win'::text THEN 'won'::text
                            WHEN 'loss'::text THEN 'lost'::text
                            WHEN 'pushed'::text THEN 'push'::text
                            WHEN 'voided'::text THEN 'void'::text
                            ELSE lower(btrim(r.result))
                        END AS lower,
                    GREATEST(r.created_at, r.updated_at) AS "greatest"
                   FROM public.prop_results r
                  WHERE b.kind = 'prop'::text AND b.policy_version <> 'darts-top-v1'::text AND r.game_date = b.game_date::date AND upper(r.sport) = b.league AND r.game_id = b.game_id AND lower(btrim(r.player_name)) = lower(btrim(b.pick_snapshot ->> 'player'::text)) AND regexp_replace(regexp_replace(lower(btrim(r.prop_type)), '^player_'::text, ''::text), '[\s_]+'::text, '_'::text, 'g'::text) = regexp_replace(regexp_replace(regexp_replace(lower(btrim(COALESCE(b.pick_snapshot ->> 'prop'::text, b.pick_snapshot ->> 'prop_type'::text))), '\s+[+-]?[0-9]+(\.[0-9]+)?$'::text, ''::text), '^player_'::text, ''::text), '[\s_]+'::text, '_'::text, 'g'::text) AND r.line_value =
                        CASE
                            WHEN COALESCE(b.pick_snapshot ->> 'line'::text, ''::text) ~ '^[+-]?[0-9]+(\.[0-9]+)?$'::text THEN (b.pick_snapshot ->> 'line'::text)::numeric
                            ELSE NULL::numeric
                        END AND lower(btrim(r.bet)) = lower(btrim(b.pick_snapshot ->> 'bet'::text))) results
          WHERE results.outcome = ANY (ARRAY['won'::text, 'lost'::text, 'push'::text, 'void'::text])) g
  WHERE b.bankroll_policy = 'daily-bankroll-v1'::text AND b.stake_units > 0::numeric
UNION ALL
 -- The day's charge in place of what it lost: one row, on that day.
 SELECT NULL::bigint, s.game_date, 'ALL'::text, 'charge'::text, NULL::text, s.created_at,
    (s.charge_dollars / 100.0)::numeric(12,4), 'Scrubbed day charge'::text, NULL::integer, NULL::timestamptz,
    'charge'::text, ((s.game_date::date + 1)::timestamp AT TIME ZONE 'America/New_York'), (-1)::numeric
   FROM public.winners_scrubbed_days s
  WHERE s.effective_date <= (now() AT TIME ZONE 'America/New_York')::date;

CREATE OR REPLACE FUNCTION public.get_gary_bankroll()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 with ledger as materialized (select *,stake_units*flat_net_units net,kind='charge' charge from gary_private.bankroll_ledger),
 totals as (select coalesce(sum(net),0) profit,
  coalesce(sum(stake_units) filter(where result='pending'),0) risk,
  coalesce(sum(stake_units) filter(where result in ('won','lost','push')),0) wagered,
  count(*) filter(where result not in ('charge','scrubbed')) bets,count(*) filter(where result='won') wins,count(*) filter(where result='lost') losses,
  count(*) filter(where result='push') pushes,count(*) filter(where result='void') voids,
  count(*) filter(where result='pending') pending,
  coalesce(sum(flat_net_units) filter(where not charge),0) flat_profit from ledger),
 steps as (select candidate_id,settled_at,net,sum(net) over(order by settled_at,candidate_id) cumulative
  from ledger where result<>'pending'),
 drawdowns as (select cumulative,greatest(0,max(cumulative) over(order by settled_at,candidate_id))-cumulative drawdown from steps),
 days as (select game_date date,sum(net) net,coalesce(sum(flat_net_units) filter(where not charge),0) flat_net,
  count(*) filter(where result in ('won','lost','push') or charge) settled,
  count(*) filter(where result='won') wins,count(*) filter(where result='lost') losses,count(*) filter(where result='push') pushes
  from ledger where result<>'pending' group by 1),
 curve as (select date,sum(net) over(order by date) net_units,sum(flat_net) over(order by date) flat_units from days)
 select jsonb_build_object('policy_version',cfg.policy_version,'started_at',cfg.started_at,'started_date',(cfg.started_at at time zone 'America/New_York')::date::text,'initial_units',cfg.initial_units,
  'bankroll_units',cfg.initial_units+t.profit,'profit_units',t.profit,'growth_pct',100*t.profit/cfg.initial_units,
  'available_units',cfg.initial_units+t.profit-t.risk,'at_risk_units',t.risk,'wagered_units',t.wagered,
  'roi_pct',case when t.wagered>0 then 100*t.profit/t.wagered else null end,
  'win_pct',case when t.wins+t.losses>0 then 100.0*t.wins/(t.wins+t.losses) else null end,
  'bets',t.bets,'wins',t.wins,'losses',t.losses,'pushes',t.pushes,'voids',t.voids,'pending',t.pending,
  'flat_profit_units',t.flat_profit,'max_drawdown_units',coalesce((select max(drawdown) from drawdowns),0),
  'curve',coalesce((select jsonb_agg(to_jsonb(curve) order by date) from curve),'[]'::jsonb),
  'scrubbed',coalesce((select jsonb_agg(jsonb_build_object('date',s.game_date,'charge_units',s.charge_dollars/100.0,
    'effective_date',s.effective_date,'in_effect',s.effective_date<=(now() at time zone 'America/New_York')::date,
    'note',case when s.effective_date<=(now() at time zone 'America/New_York')::date then s.note else s.notice end) order by s.game_date)
   from public.winners_scrubbed_days s),'[]'::jsonb),
  'days',coalesce((select jsonb_agg(jsonb_build_object('date',date,'net_units',net,'flat_units',flat_net,'settled',settled,'wins',wins,'losses',losses,'pushes',pushes) order by date) from days),'[]'::jsonb))
 from public.gary_bankroll cfg cross join totals t where cfg.id;
$function$;

commit;
