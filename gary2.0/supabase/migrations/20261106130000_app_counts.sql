-- How many new installs reach each first step and whether they come back
-- (founder, Nov 6 2026). A row is a step, the day the app was first opened and
-- the app version: no account, device, session or network identifier, so one
-- person's steps can't be told from another's. Written only through the
-- function below; nobody but the service role can read it.

create table if not exists public.app_step_counts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  step text not null,
  install_day date not null,
  app_version text not null default '',
  constraint app_step_counts_step check (step in (
    'first_open', 'entered', 'read_pick', 'opened_winners',
    'returned_next_day', 'returned_week', 'returned_month'
  )),
  constraint app_step_counts_version check (char_length(app_version) <= 16)
);

create index if not exists app_step_counts_day_idx on public.app_step_counts (install_day, step);

alter table public.app_step_counts enable row level security;
alter table public.app_step_counts force row level security;
revoke all on table public.app_step_counts from public, anon, authenticated;
grant select, insert, delete on table public.app_step_counts to service_role;
revoke all on sequence public.app_step_counts_id_seq from public, anon, authenticated;
grant usage, select on sequence public.app_step_counts_id_seq to service_role;

create or replace function public.count_app_step(p_step text, p_install_day date, p_version text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_install_day is null or p_install_day < date '2026-11-01' or p_install_day > current_date + 1 then
    return;
  end if;
  if p_step not in ('first_open', 'entered', 'read_pick', 'opened_winners',
                    'returned_next_day', 'returned_week', 'returned_month') then
    return;
  end if;
  insert into public.app_step_counts (step, install_day, app_version)
  values (p_step, p_install_day, left(coalesce(p_version, ''), 16));
end;
$$;

revoke all on function public.count_app_step(text, date, text) from public;
grant execute on function public.count_app_step(text, date, text) to anon, authenticated;
