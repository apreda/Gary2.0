-- THE GAME-BY-GAME TEST (Oct 27 2026, founder GO): the second system's pick for each game the live system picked,
-- beside the live pick, both graded. Never published; the app and Winners never read it. Service role only.
create table if not exists public.gamebygame_picks (
  league text not null,
  game_id text not null,
  game_date date not null,
  matchup text not null,
  system text not null default 'game-by-game',
  pick text,
  live_pick text,
  confidence numeric,
  rationale text,
  read_file text,
  model text,
  result text,
  live_result text,
  final_score text,
  created_at timestamptz not null default now(),
  graded_at timestamptz,
  primary key (league, game_id, system)
);

create index if not exists gamebygame_picks_date on public.gamebygame_picks (league, game_date);

alter table public.gamebygame_picks enable row level security;
