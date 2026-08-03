-- Prop Lane Ledger (founder GO, Aug 3 2026 — props overhaul).
-- Analytics only — no model surface. Splits every stored prop pick into its
-- product lane (HR = the sanctioned one-sided fun lane; CORE = everything
-- else) so a lottery-lane heater can never again mask the core product the
-- way July's +45u HR run hid a losing core. Grades flat 1u from prop_results
-- (join key = the grader's own dedup key: player | prop token | date) and
-- carries prompt_sha + the V2 board-composition stamps so board eras get
-- clean before/after reads without a prompt change.

create or replace view prop_lane_ledger as
with p as (
  select d.date,
         e.p->>'player'                             as player,
         split_part(trim(e.p->>'prop'), ' ', 1)     as prop_token,
         e.p->>'prop'                               as prop_display,
         lower(coalesce(e.p->>'bet', 'over'))       as bet,
         nullif(e.p->>'line','')::numeric           as line,
         nullif(replace(e.p->>'odds', '+', ''), '')::numeric as odds_num,
         nullif(e.p->>'confidence','')::numeric     as confidence,
         e.p->>'sport'                              as league,
         e.p->>'prompt_sha'                         as prompt_sha,
         nullif(e.p->>'board_version','')::numeric  as board_version,
         nullif(e.p->>'board_two_sided_pct','')::numeric as board_two_sided_pct
  from prop_picks d
  cross join lateral jsonb_array_elements(d.picks) as e(p)
  where e.p->>'player' is not null
)
select
  p.date::date as game_date,
  p.player, p.prop_token, p.prop_display, p.bet, p.line, p.odds_num,
  p.confidence, p.league, p.prompt_sha, p.board_version, p.board_two_sided_pct,
  case when p.prop_token ilike '%home_run%' or p.league = 'MLB HR'
       then 'HR' else 'CORE' end as lane,
  (p.odds_num > 0) as took_plus_money,
  case when p.odds_num is null then null
       when p.odds_num < 0 then abs(p.odds_num)/(abs(p.odds_num)+100.0)
       else 100.0/(p.odds_num+100.0) end as implied_prob,
  pr.result,
  pr.actual_value,
  case pr.result
    when 'won'  then round(case when p.odds_num > 0 then p.odds_num/100.0
                                else 100.0/abs(p.odds_num) end, 3)
    when 'lost' then -1.0
    else 0.0
  end as units
from p
left join prop_results pr
  on pr.game_date = p.date::date
 and lower(pr.player_name) = lower(p.player)
 and lower(pr.prop_type) = lower(p.prop_token);

create or replace view prop_lane_rollup as
select
  coalesce(prompt_sha, '(pre-era)') as era,
  lane,
  count(*) as picks,
  count(*) filter (where result is not null) as graded,
  count(*) filter (where result = 'won')  as won,
  count(*) filter (where result = 'lost') as lost,
  count(*) filter (where result = 'push') as pushed,
  count(*) filter (where bet = 'under') as unders,
  count(*) filter (where took_plus_money) as plus_money_picks,
  round(coalesce(sum(units) filter (where result is not null), 0), 2) as units,
  round(avg(implied_prob) filter (where result in ('won','lost'))::numeric, 3) as breakeven_win_pct,
  round((count(*) filter (where result = 'won'))::numeric
        / nullif(count(*) filter (where result in ('won','lost')), 0), 3) as actual_win_pct
from prop_lane_ledger
group by 1, 2
order by 1, 2;

create or replace view prop_lane_daily as
select
  game_date,
  lane,
  count(*) as picks,
  count(*) filter (where result is not null) as graded,
  count(*) filter (where bet = 'under') as unders,
  round(coalesce(sum(units) filter (where result is not null), 0), 2) as units,
  max(board_version) as board_version
from prop_lane_ledger
group by 1, 2
order by 1 desc, 2;
