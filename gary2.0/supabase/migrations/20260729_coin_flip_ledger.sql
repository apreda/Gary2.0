-- Coin-Flip Ledger + prompt-era registry (founder GO, Jul 29 2026).
-- Analytics only — no model surface. Bands every stored MLB game pick by how
-- strongly the market held the game AT PICK TIME (the pick's own stored
-- moneylines), grades flat 1u from game_results, and keys everything by
-- prompt-era hash so contract changes get pre-registered before/after reads.

create table if not exists prompt_eras (
  sha text primary key,
  lane text not null default 'game',
  first_seen timestamptz not null default now(),
  description text,
  preregistered text
);

create or replace view coin_flip_ledger as
with p as (
  select d.date,
         e.p->>'pick'                          as pick_text,
         e.p->>'homeTeam'                      as home_team,
         e.p->>'awayTeam'                      as away_team,
         e.p->>'type'                          as bet_type,
         nullif(e.p->>'odds','')::numeric      as pick_odds,
         nullif(e.p->>'moneylineHome','')::numeric as ml_home,
         nullif(e.p->>'moneylineAway','')::numeric as ml_away,
         nullif(e.p->>'confidence','')::numeric    as confidence,
         e.p->>'model'                         as model,
         e.p->>'prompt_sha'                    as prompt_sha
  from daily_picks d
  cross join lateral jsonb_array_elements(d.picks) as e(p)
  where coalesce(e.p->>'league','MLB') ilike '%mlb%'
),
raw as (
  select *,
    case when ml_home is null then null
         when ml_home < 0 then abs(ml_home)/(abs(ml_home)+100.0)
         else 100.0/(ml_home+100.0) end as p_home_raw,
    case when ml_away is null then null
         when ml_away < 0 then abs(ml_away)/(abs(ml_away)+100.0)
         else 100.0/(ml_away+100.0) end as p_away_raw,
    case when pick_odds is null then null
         when pick_odds < 0 then abs(pick_odds)/(abs(pick_odds)+100.0)
         else 100.0/(pick_odds+100.0) end as pick_implied_raw
  from p
),
devig as (
  select *,
    case when p_home_raw is null or p_away_raw is null then null
         else greatest(p_home_raw, p_away_raw) / (p_home_raw + p_away_raw) end as fav_prob
  from raw
)
select
  d.date, d.pick_text, d.home_team, d.away_team, d.bet_type,
  d.pick_odds, d.ml_home, d.ml_away, d.confidence, d.model, d.prompt_sha,
  round(d.fav_prob, 4) as fav_prob,
  round(d.pick_implied_raw, 4) as pick_implied_raw,
  case
    when d.fav_prob is null   then 'UNKNOWN'
    when d.fav_prob <= 0.550  then 'COIN_FLIP'
    when d.fav_prob <= 0.625  then 'LEAN'
    when d.fav_prob <= 0.725  then 'HELD'
    else 'STRONG'
  end as band,
  (d.pick_odds > 0) as took_plus_money,
  gr.result,
  case gr.result
    when 'won'  then round(case when d.pick_odds > 0 then d.pick_odds/100.0
                                else 100.0/abs(d.pick_odds) end, 3)
    when 'lost' then -1.0
    else 0.0
  end as units
from devig d
left join game_results gr
  on gr.game_date = d.date::date and gr.pick_text = d.pick_text;

create or replace view coin_flip_ledger_rollup as
select
  coalesce(prompt_sha, '(pre-era)') as era,
  band,
  count(*) as picks,
  count(*) filter (where took_plus_money) as plus_money_picks,
  count(*) filter (where result = 'won')  as won,
  count(*) filter (where result = 'lost') as lost,
  round(coalesce(sum(units) filter (where result is not null), 0), 2) as units,
  round(avg(confidence), 3) as avg_conf,
  round(corr(confidence, pick_implied_raw)::numeric, 3) as conf_price_corr
from coin_flip_ledger
group by 1, 2
order by 1, 2;
