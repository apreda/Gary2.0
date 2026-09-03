-- THE CLOSING-LINE READ (founder GO, Sep 3 2026): one row per stored game
-- pick — the price Gary took, the same ticket's price at first pitch (the
-- close) and the day's first price (the open), as vig-free probabilities of
-- the picked side. clv_pts = close minus pick (positive = the world moved
-- toward Gary after he picked); open_to_close_pts = close minus open
-- (was he on the side the whole day's information moved toward). The
-- founder's ruler; Gary never sees it.
create table if not exists public.pick_line_reads (
  id bigint generated always as identity primary key,
  game_date text not null,
  league text not null,
  game_id text not null,
  pick_text text not null,
  side text,               -- home | away
  bet_type text,           -- moneyline | spread
  point numeric(4,1),
  book text,
  price_pick integer,
  prob_pick numeric(6,4),
  open_seen_at timestamptz,
  price_open integer,
  prob_open numeric(6,4),
  close_seen_at timestamptz,
  price_close integer,
  prob_close numeric(6,4),
  clv_pts numeric(6,2),
  open_to_close_pts numeric(6,2),
  right_side_pick boolean,
  right_side_open boolean,
  result text,
  notes text,
  computed_at timestamptz not null default now(),
  unique (game_date, league, game_id, pick_text)
);
create index if not exists pick_line_reads_date_idx on public.pick_line_reads (game_date, league);
alter table public.pick_line_reads enable row level security;
