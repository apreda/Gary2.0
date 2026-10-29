-- Cash Rail (Oct 29 2026): the betting scoreboard on Home.
-- live_board_prices: pregame prop + game-odds snapshots; the last one before
--   kickoff is the frozen price board.
-- live_boards: one row per live game, rewritten every 15 seconds by
--   scripts/cash-rail-worker.js; the app reads it (anon select only).

create table if not exists public.live_board_prices (
  id bigint generated always as identity primary key,
  league text not null,
  game_id text not null,
  kickoff timestamptz,
  captured_at timestamptz not null default now(),
  props jsonb not null default '[]'::jsonb,
  game_odds jsonb not null default '[]'::jsonb
);
create index if not exists live_board_prices_game_idx on public.live_board_prices (league, game_id, captured_at desc);

create table if not exists public.live_boards (
  league text not null,
  game_id text not null,
  date date not null,
  status text not null default 'live',
  possession text,
  situation text,
  elapsed_s integer not null default 0,
  clock text,
  hits jsonb not null default '[]'::jsonb,
  prices_frozen_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (league, game_id)
);

alter table public.live_board_prices enable row level security;
alter table public.live_boards enable row level security;

drop policy if exists live_boards_read on public.live_boards;
create policy live_boards_read on public.live_boards for select to anon, authenticated using (true);
-- Prices stay server-side: no read policy on live_board_prices.

-- Player names for every prop in the snapshot (BDL prop rows carry ids only).
alter table public.live_board_prices add column if not exists players jsonb not null default '{}'::jsonb;
