-- THE GAME RECORDS (Oct 27 2026, founder GO: the game-by-game system). Each finished game written up once, both
-- teams, checked, and kept: every read, prop sheet, opponent line and data check of the game-by-game system is
-- assembled from these rows. `record` is the whole game; `summary` is the one-line version other games show for
-- their opponent; `checks` lists each consistency check and whether it held. Service role only.
create table if not exists public.game_records (
  league text not null,
  game_id text not null,
  season integer not null,
  game_date date not null,
  home_team text not null,
  away_team text not null,
  home_team_id text,
  away_team_id text,
  record jsonb not null,
  summary jsonb not null,
  checks jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  built_at timestamptz not null default now(),
  primary key (league, game_id)
);

create index if not exists game_records_league_season_date on public.game_records (league, season, game_date);
create index if not exists game_records_home on public.game_records (league, season, home_team_id);
create index if not exists game_records_away on public.game_records (league, season, away_team_id);

alter table public.game_records enable row level security;
