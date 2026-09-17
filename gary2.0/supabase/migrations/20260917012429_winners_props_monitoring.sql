-- The minute-level email collector reads incident metadata, never full dossiers.
create view public.winners_props_health with (security_invoker=true) as
 select id,game_date,status,error,lease_until,
 jsonb_build_object('candidates',(select coalesce(jsonb_agg(jsonb_build_object('league',v->>'league','game_id',v->>'game_id')),'[]')
  from jsonb_array_elements(input_snapshot->'candidates') v)) as input_snapshot
 from public.winners_prop_selection_runs;
revoke all on public.winners_props_health from public,anon,authenticated;
grant select on public.winners_props_health to service_role;
