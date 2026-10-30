-- Cash Rail: Gary's own game pick, props and darts on the live game, with their
-- progress from the plays (founder, Oct 30 2026: the strip under the scoreboard).
alter table public.live_boards add column if not exists gary_bets jsonb not null default '[]'::jsonb;
