-- Cash Rail celebrations (Oct 29 2026): Gary dancing in the scorer's number and
-- team colors when a big bet cashes. scripts/cash-rail-celebrate.js draws the
-- frames, stores them in the public `celebrations` bucket and marks the row ready;
-- the app reads ready rows (anon select).

alter table public.live_board_prices add column if not exists roster jsonb not null default '{}'::jsonb;

create table if not exists public.celebrations (
  league text not null,
  game_id text not null,
  play_key text not null,
  hit_key text not null,
  who text not null,
  market text not null,
  price integer not null,
  when_label text,
  play text,
  kind text not null,
  dance text not null,
  team text,
  number text,
  status text not null default 'generating',
  assets jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  primary key (league, game_id, play_key)
);

alter table public.celebrations enable row level security;
drop policy if exists celebrations_read on public.celebrations;
create policy celebrations_read on public.celebrations for select to anon, authenticated using (status = 'ready');

insert into storage.buckets (id, name, public) values ('celebrations', 'celebrations', true)
on conflict (id) do update set public = true;
