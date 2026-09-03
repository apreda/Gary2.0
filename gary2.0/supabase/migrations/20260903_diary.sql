-- THE NOTEBOOK SHADOW (founder GO, Sep 3 2026 — "I'm good with doing the
-- three systems"): Gary with a memory, run as a second read of the same
-- desk with his own notebook appended, never touching the real pick.
--
-- pick_autopsies: after every final, the reader reads the play-by-play and
-- grades its own stated reason — for the real Gary's picks and the
-- notebook shadow's picks alike (same reader, same desk). The notebook is
-- built from these rows: reason type → bets, record, how often the stated
-- reason actually decided the game, plus the newest notes. A note is a
-- mechanism and an outcome, never a side.
create table if not exists public.pick_autopsies (
  id bigint generated always as identity primary key,
  game_date text not null,
  league text not null default 'MLB',
  game_id text not null,
  source text not null,          -- gary | diary
  pick_text text not null,
  result text,                   -- won | lost | push
  home_team text,
  away_team text,
  final_score text,
  mechanism_stated text,         -- the reader's own pre-game claim, as extracted from the card
  reason_type text,              -- vocabulary in src/services/diary/notebook.js
  decided_by text,               -- one sentence, what actually decided it
  mechanism_label text,          -- vocabulary in src/services/diary/notebook.js
  reason_status text,            -- right | wrong | irrelevant
  note text,                     -- one line, mechanism + outcome, never a side
  game_story text,
  model text,
  ms integer,
  computed_at timestamptz not null default now(),
  unique (game_date, league, game_id, source)
);
create index if not exists pick_autopsies_date_idx on public.pick_autopsies (game_date, league, source);
alter table public.pick_autopsies enable row level security;

-- diary_picks: the notebook shadow's bets, beside Gary's and the formula's.
create table if not exists public.diary_picks (
  id bigint generated always as identity primary key,
  game_date text not null,
  league text not null default 'MLB',
  game_id text not null,
  matchup text,
  home_team text,
  away_team text,
  pick_text text not null,
  side text,
  bet_type text,
  point numeric(4,1),
  price integer,
  rationale text,
  path_home text,
  path_away text,
  notebook text,                 -- the exact notebook text the reader saw
  notebook_notes integer,        -- how many autopsies it was built from
  gary_pick text,
  agree_with_gary boolean,
  model text,
  result text,
  units numeric(6,2),
  clv_pts numeric(6,2),
  open_to_close_pts numeric(6,2),
  computed_at timestamptz not null default now(),
  graded_at timestamptz,
  unique (game_date, league, game_id)
);
create index if not exists diary_picks_date_idx on public.diary_picks (game_date, league);
alter table public.diary_picks enable row level security;
