-- THE SCREEN, in the ledger (props owner, Sep 3 2026). Every pick since the
-- Sep 2 menu policy stamps what the model said (screen_p), what the price
-- said (price_p), the gap between them, and where the bet sat on the menu
-- (screen_rank, 1 = the biggest gap). The August replay's one durable finding
-- was that rank 1 carried the policy — 68% and +12% ROI, with ranks 4-6
-- negative — and the ledger could not test that live because the view never
-- carried the stamps.
--
-- Columns are APPENDED, so prop_lane_rollup and prop_lane_daily (which select
-- named columns) are untouched.
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
         e.p->>'lane'                               as stamped_lane,
         nullif(e.p->>'board_version','')::numeric  as board_version,
         nullif(e.p->>'board_two_sided_pct','')::numeric as board_two_sided_pct,
         nullif(e.p->>'screen_p','')::numeric       as screen_p,
         nullif(e.p->>'price_p','')::numeric        as price_p,
         nullif(e.p->>'screen_gap','')::numeric     as screen_gap,
         nullif(e.p->>'screen_rank','')::numeric    as screen_rank
  from prop_picks d
  cross join lateral jsonb_array_elements(d.picks) as e(p)
  where e.p->>'player' is not null
)
select
  p.date::date as game_date,
  p.player, p.prop_token, p.prop_display, p.bet, p.line, p.odds_num,
  p.confidence, p.league, p.prompt_sha, p.board_version, p.board_two_sided_pct,
  case
    when p.stamped_lane in ('HR','TD','CORE') then p.stamped_lane
    when p.prop_token ilike '%home_run%' or p.league = 'MLB HR' then 'HR'
    when p.prop_token ilike 'anytime%' then 'TD'
    else 'CORE'
  end as lane,
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
  end as units,
  p.screen_p,
  p.price_p,
  p.screen_gap,
  p.screen_rank
from p
left join prop_results pr
  on pr.game_date = p.date::date
 and lower(pr.player_name) = lower(p.player)
 and lower(pr.prop_type) = lower(p.prop_token);
