-- A SCRUBBED DAY (founder, Oct 29 2026): "remember that one day NCAAF went 6-16 because there was a bug and way
-- too many picks went to winners page. i kinda want to scrub that day and leave a note to users saying why ... but we
-- could still deduct 1k from garys balance instead of the like 3k or so he lost since it really was a bug wed never
-- really bet on 22 games in one day." Oct 17: the card's cut said "all of them" and seated every college pick (20),
-- beside 2 MLB bets: 6-16, -$3,195. A scrubbed day's bets stay on file and read 'scrubbed' (no record, no money);
-- one 'charge' row on that day takes its place in the balance, and the bankroll carries the note for the app.
begin;

create table public.winners_scrubbed_days (
  game_date text primary key check (game_date ~ '^\d{4}-\d{2}-\d{2}$'),
  charge_dollars numeric not null check (charge_dollars >= 0),
  note text not null check (length(trim(note)) > 0),
  created_at timestamptz not null default now()
);
alter table public.winners_scrubbed_days enable row level security;
revoke all on public.winners_scrubbed_days from public, anon, authenticated;
grant select on public.winners_scrubbed_days to anon, authenticated, service_role;
create policy scrubbed_days_read on public.winners_scrubbed_days for select to anon, authenticated using (true);

insert into public.winners_scrubbed_days (game_date, charge_dollars, note)
values ('2026-10-17', 1000, 'A bug put all 20 of Gary''s college picks on Winners this day. He would never bet 22 games in one day, so the day is off his record. In place of the $3,195 it lost, his bankroll takes a $1,000 charge.');

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
   FROM public.winners_scrubbed_days s;

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
  'scrubbed',coalesce((select jsonb_agg(jsonb_build_object('date',s.game_date,'charge_units',s.charge_dollars/100.0,'note',s.note) order by s.game_date) from public.winners_scrubbed_days s),'[]'::jsonb),
  'days',coalesce((select jsonb_agg(jsonb_build_object('date',date,'net_units',net,'flat_units',flat_net,'settled',settled,'wins',wins,'losses',losses,'pushes',pushes) order by date) from days),'[]'::jsonb))
 from public.gary_bankroll cfg cross join totals t where cfg.id;
$function$;

CREATE OR REPLACE FUNCTION public.winners_recap(p_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with ledger as (
    select l.*, b.pick_snapshot
    from gary_private.bankroll_ledger l
    join public.winners_board b on b.candidate_id = l.candidate_id
  )
  select jsonb_build_object(
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
          'league', l.league, 'kind', l.kind, 'pick_text', l.pick_text, 'odds', l.odds,
          'player', l.pick_snapshot->>'player',
          'prop', coalesce(l.pick_snapshot->>'prop', l.pick_snapshot->>'prop_type'),
          'line', l.pick_snapshot->>'line', 'bet', l.pick_snapshot->>'bet',
          'stake_dollars', round(l.stake_units * 100, 2),
          'result', l.result,
          'net_dollars', round(l.stake_units * l.flat_net_units * 100, 2))
        order by l.stake_units desc, l.commence_time, l.candidate_id)
      from ledger l where l.game_date = p_date::text), '[]'::jsonb),
    'bankroll_dollars', round((cfg.initial_units + coalesce((
      select sum(l.stake_units * l.flat_net_units) from gary_private.bankroll_ledger l
      where l.game_date ~ '^\d{4}-\d{2}-\d{2}$' and l.game_date::date <= p_date), 0)) * 100, 2),
    'initial_dollars', round(cfg.initial_units * 100, 2),
    'started_date', (cfg.started_at at time zone 'America/New_York')::date)
  from public.gary_bankroll cfg where cfg.id
$function$;

commit;
