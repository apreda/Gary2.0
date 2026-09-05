-- Repair only the anonymous computed fallback, using the same row's verified
-- QB identity and exact-game school. Preserve generated reads and all numbers.
with named as (
  select i.id, i.meta->>'qb' as qb,
    coalesce(nullif(i.meta->>'school', ''),
      case i.meta->>'side' when 'away' then s.away_team when 'home' then s.home_team end,
      i.meta->>'abbr') as school
  from public.insight_connections i
  left join public.daily_slate s on s.date = i.date and s.league = 'NCAAF'
    and s.bdl_game_id::text = i.game_id
  where i.league = 'NCAAF' and i.category = 'quarterback'
    and i.date >= (now() at time zone 'America/New_York')::date
    and i.meta->>'source' = 'balldontlie_ncaaf_players_active+player_stats'
    and nullif(i.meta->>'qb', '') is not null
    and (i.detail ~ '^His [0-9]{4} (season line|line so far)'
      or i.meta->>'computed_detail' ~ '^His [0-9]{4} (season line|line so far)')
), repaired as (
  update public.insight_connections i
  set detail = case when i.detail ~ '^His [0-9]{4} (season line|line so far)'
      then replace(n.qb || ' (' || n.school || '): ' || substring(i.detail from 5),
        'He is on ' || (i.meta->>'abbr') || '''s active roster',
        'He is on ' || n.school || '''s active roster')
      else i.detail end,
    meta = (i.meta || jsonb_build_object('school', n.school)) ||
      case when i.meta->>'computed_detail' ~ '^His [0-9]{4} (season line|line so far)'
        then jsonb_build_object('computed_detail', replace(
          n.qb || ' (' || n.school || '): ' || substring(i.meta->>'computed_detail' from 5),
          'He is on ' || (i.meta->>'abbr') || '''s active roster',
          'He is on ' || n.school || '''s active roster'))
        else '{}'::jsonb end,
    updated_at = now()
  from named n where i.id = n.id and nullif(n.school, '') is not null
  returning i.id, i.game_id, i.detail, i.meta->>'qb' as qb
)
select count(*) as repaired_rows,
  jsonb_agg(jsonb_build_object('game_id',game_id,'qb',qb,'detail',detail)) as repaired
from repaired;
