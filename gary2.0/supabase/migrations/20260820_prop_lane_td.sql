-- Football fun lane in the prop ledger (founder GO, Aug 20 2026 — NFL+NCAAF
-- props on the same system as MLB). Anytime-TD picks are football's
-- sanctioned one-sided lane, the exact analog of MLB HR: drama, tracked, and
-- never allowed to mask the CORE record. The desk lane now stamps `lane`
-- ('HR' | 'TD' | 'CORE') on every pick at generation; the stamp wins when
-- present and the token heuristics remain for legacy rows.
-- Column list/order/types unchanged, so the dependent rollup/daily views are
-- untouched.

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
         nullif(e.p->>'board_two_sided_pct','')::numeric as board_two_sided_pct
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
  end as units
from p
left join prop_results pr
  on pr.game_date = p.date::date
 and lower(pr.player_name) = lower(p.player)
 and lower(pr.prop_type) = lower(p.prop_token);
