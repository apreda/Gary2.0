-- PLAYER RED ZONE (founder GO, Sep 24 2026): nobody carried a player's
-- red-zone targets or goal-line carries. Ball Don't Lie's NFL play-by-play
-- (which we pay for) marks every play's yards to the end zone and names the
-- rusher, the passer and the targeted receiver (incompletions included), so
-- the counts come from BDL, per game per player, filled after each final by
-- src/services/nflRedZone.js and read back as season totals.
create table if not exists public.nfl_red_zone_games (
  game_id bigint not null,
  season integer not null,
  week integer,
  player_id bigint not null,
  player_name text,
  team text,
  carries_in20 integer not null default 0,
  carries_in10 integer not null default 0,
  carries_in5 integer not null default 0,
  rush_tds_in20 integer not null default 0,
  targets_in20 integer not null default 0,
  targets_in10 integer not null default 0,
  receptions_in20 integer not null default 0,
  rec_tds_in20 integer not null default 0,
  pass_att_in20 integer not null default 0,
  pass_tds_in20 integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (game_id, player_id)
);
create index if not exists nfl_red_zone_games_season on public.nfl_red_zone_games (season, player_id);
alter table public.nfl_red_zone_games enable row level security;
revoke all on public.nfl_red_zone_games from anon, authenticated;

-- The games whose plays are already counted (a game with no red-zone play still counts as read).
create table if not exists public.nfl_red_zone_read (
  game_id bigint primary key,
  season integer not null,
  read_at timestamptz not null default now()
);
alter table public.nfl_red_zone_read enable row level security;
revoke all on public.nfl_red_zone_read from anon, authenticated;
