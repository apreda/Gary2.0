-- One-time cleanup for the byte-identical daily-pick duplicate exposed while
-- append_daily_picks_atomic still used nullable boolean prop detection.
--
-- Scope is deliberately limited to the affected ET date. Full JSONB equality
-- is required, first-seen ordering is retained, and rerunning is a no-op.

with deduped as (
  select date, pg_catalog.jsonb_agg(elem order by first_ordinality) as picks
  from (
    select d.date, item.elem, min(item.ordinality) as first_ordinality
    from public.daily_picks as d
    cross join lateral pg_catalog.jsonb_array_elements(d.picks)
      with ordinality as item(elem, ordinality)
    where d.date = '2026-08-15'
    group by d.date, item.elem
  ) as unique_items
  group by date
)
update public.daily_picks as d
set picks = deduped.picks,
    updated_at = pg_catalog.now()
from deduped
where d.date = deduped.date
  and d.picks is distinct from deduped.picks;
