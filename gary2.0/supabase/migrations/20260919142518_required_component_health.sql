create table public.required_component_health (
 date text not null, league text not null, game_id text not null, team_id text not null,
 component text not null, status text not null check(status in ('ok','fail')),
 reason text not null, observed_at timestamptz not null, sources jsonb not null default '[]'::jsonb,
 primary key(date,league,game_id,team_id,component)
);
alter table public.required_component_health enable row level security;
revoke all on public.required_component_health from public,anon,authenticated;
grant select on public.required_component_health to anon,authenticated;
grant select,insert,update,delete on public.required_component_health to service_role;
create policy read_component_health on public.required_component_health for select to anon,authenticated using(true);
