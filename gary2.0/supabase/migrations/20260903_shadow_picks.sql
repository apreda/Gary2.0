-- THE SHADOW MODEL (founder GO, Sep 3 2026): a second system's pick for
-- every MLB game, made beside Gary's and never shown to him or to fans —
-- the market's number moved only for tonight's facts (pen availability,
-- missing regulars, a starter's leash), every ticket priced, the best one
-- taken. Graded nightly and read on the same closing-line ruler as Gary,
-- so the last three weeks of MLB say which system is better.
create table if not exists public.shadow_picks (
  id bigint generated always as identity primary key,
  game_date text not null,
  league text not null default 'MLB',
  game_id text not null,
  game_pk text,
  matchup text,
  home_team text,
  away_team text,
  pick_text text not null,
  side text,                 -- home | away
  bet_type text,             -- moneyline | spread
  point numeric(4,1),
  price integer,
  p_market numeric(6,4),
  p_adj numeric(6,4),
  ev numeric(7,4),
  adjustment_pts numeric(5,1),
  drivers jsonb,
  tickets jsonb,
  features jsonb,
  weights jsonb,
  board jsonb,
  gary_pick text,
  agree_with_gary boolean,
  result text,               -- won | lost | push | null
  units numeric(6,2),
  clv_pts numeric(6,2),
  open_to_close_pts numeric(6,2),
  model_version text,
  computed_at timestamptz not null default now(),
  graded_at timestamptz,
  unique (game_date, league, game_id)
);
create index if not exists shadow_picks_date_idx on public.shadow_picks (game_date, league);
alter table public.shadow_picks enable row level security;
