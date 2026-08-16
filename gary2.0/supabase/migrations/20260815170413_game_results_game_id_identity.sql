-- Bind every newly graded non-NFL game pick to the exact provider game.
-- Existing rows remain valid with NULL game_id and are adopted/backfilled by
-- the idempotent grader when that exact final game is seen again.
alter table public.game_results
  add column if not exists game_id text;

comment on column public.game_results.game_id is
  'Exact upstream provider game id used to grade this pick; null on legacy rows.';

create unique index if not exists game_results_exact_game_pick_idx
  on public.game_results (
    game_date,
    lower(coalesce(league, '')),
    game_id,
    lower(coalesce(matchup, '')),
    lower(coalesce(pick_text, ''))
  )
  where game_id is not null;
