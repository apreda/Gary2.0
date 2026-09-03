-- THE BIG GAME from the whole slate (founder ruling, Sep 3 2026): one row per
-- league per day, written when the daily slate publishes, read by every
-- exact-game pick child (which sees only its own game). College = both
-- ranked, lowest combined ranking; NFL = the national window; MLB = Sunday
-- Night Baseball. Gary's pick from this game goes on Winners regardless.
create table if not exists public.winners_big_games (
  id bigint generated always as identity primary key,
  game_date text not null,
  league text not null,
  game_id text not null,
  matchup text,
  reason text,
  decided_at timestamptz not null default now(),
  unique (game_date, league)
);
alter table public.winners_big_games enable row level security;
