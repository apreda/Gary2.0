-- THE WINNERS REVIEW (founder GO, Sep 2 2026): one row per stored game pick —
-- on the Winners board or not, why (first_dog | big_game | review), the
-- reviewer's verdict (STRONG | WEAK | null when the review failed) and its
-- answers. The page, the Winners record and the ledger all read this one row.
create table if not exists public.winners_reviews (
  id bigint generated always as identity primary key,
  game_date text not null,
  league text not null,
  game_id text not null,
  pick_text text not null,
  matchup text,
  odds integer,
  bet_type text,
  on_board boolean not null default false,
  reason text,            -- first_dog | big_game | review | null
  verdict text,           -- STRONG | WEAK | null
  decided_by text,
  review jsonb,
  review_error text,
  model text,
  ms integer,
  reviewed_at timestamptz not null default now(),
  unique (game_date, league, game_id)
);
create index if not exists winners_reviews_date_idx on public.winners_reviews (game_date, league);
alter table public.winners_reviews enable row level security;
-- The app reads the verdicts (anon); writes are service-only.
drop policy if exists winners_reviews_read on public.winners_reviews;
create policy winners_reviews_read on public.winners_reviews for select using (true);

-- The ledger carries the same three facts beside every graded pick.
alter table public.pick_rationale_lanes
  add column if not exists winners_on_board boolean,
  add column if not exists winners_reason text,
  add column if not exists winners_verdict text;
