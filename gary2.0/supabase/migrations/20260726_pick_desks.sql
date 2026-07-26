-- THE DESK snapshot per pick (spec 2026-07-26 "One Desk, One Read").
-- The pick is a pure function of the desk; storing the desk makes every
-- future "why did Gary pick this" audit read exactly what Gary read,
-- not a re-render. Keyed by day + matchup (the audit access pattern).
create table if not exists pick_desks (
  game_date date not null,
  matchup text not null,
  pick text,
  desk text not null,
  created_at timestamptz not null default now(),
  primary key (game_date, matchup)
);

alter table pick_desks enable row level security;
-- service-role writes only; no public policies (internal audit table).
