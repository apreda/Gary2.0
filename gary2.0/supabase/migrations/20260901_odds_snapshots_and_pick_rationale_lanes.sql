-- Sep 1 2026 — applied to production via the Supabase MCP the same day
-- (migrations odds_snapshots_and_pick_rationale_lanes + odds_snapshots_line_vendor);
-- this file is the repo's copy so a fresh clone or a branch DB reproduces it.

-- ODDS SNAPSHOTS: every MLB/NFL/NCAAF board the odds service fetches, once
-- per change, so the desk can print where a line opened and where it is now.
-- Service-role writes only; RLS on with no policies (internal ledger).
create table if not exists public.odds_snapshots (
  id bigint generated always as identity primary key,
  sport text not null,
  game_date text not null,
  game_id text not null,
  home_team text not null,
  away_team text not null,
  moneyline_home integer,
  moneyline_away integer,
  spread_home numeric(4,1),
  spread_home_odds integer,
  spread_away numeric(4,1),
  spread_away_odds integer,
  line_vendor text,
  seen_at timestamptz not null default now()
);
create index if not exists odds_snapshots_game_seen_idx on public.odds_snapshots (sport, game_date, game_id, seen_at);
alter table public.odds_snapshots enable row level security;

-- PICK RATIONALE LANES: what Gary leaned on, read from each graded rationale
-- after the fact — never asked of him. One row per pick.
create table if not exists public.pick_rationale_lanes (
  id bigint generated always as identity primary key,
  game_date text not null,
  league text not null,
  game_id text not null,
  pick_text text not null,
  bet_type text,
  odds integer,
  side text,            -- fav | dog | pick-em | unknown
  result text,          -- won | lost | push | null (ungraded)
  prompt_sha text,
  lanes text[] not null default '{}',
  rationale_chars integer,
  tagged_at timestamptz not null default now(),
  unique (game_date, league, game_id, pick_text)
);
create index if not exists pick_rationale_lanes_date_idx on public.pick_rationale_lanes (game_date, league);
alter table public.pick_rationale_lanes enable row level security;
