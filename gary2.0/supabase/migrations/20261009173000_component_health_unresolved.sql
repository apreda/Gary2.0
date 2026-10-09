-- A college starter or availability report that current reporting has not
-- published is an answer, not a collection failure (Oct 9 2026). The writer
-- records it as 'unresolved'; the health check counts it as covered and the
-- app keeps showing it as not verified.
alter table public.required_component_health drop constraint if exists required_component_health_status_check;
alter table public.required_component_health add constraint required_component_health_status_check check (status in ('ok','fail','unresolved'));
