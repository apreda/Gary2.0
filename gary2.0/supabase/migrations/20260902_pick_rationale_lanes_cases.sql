-- Sep 2 2026: the rationale-lanes ledger also reads the two Pass 1 cases
-- (path_home / path_away) and records which side the ticket took, so the
-- nightly table can say what the picked case and the other case leaned on.
-- Nothing here reaches Gary.
alter table public.pick_rationale_lanes
  add column if not exists pick_is_home boolean,
  add column if not exists case_home_lanes text[] not null default '{}',
  add column if not exists case_away_lanes text[] not null default '{}',
  add column if not exists case_home_chars integer,
  add column if not exists case_away_chars integer;
