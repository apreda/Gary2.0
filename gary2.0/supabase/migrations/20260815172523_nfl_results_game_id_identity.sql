-- Exact provider identity for NFL grading. The historical
-- (pick_text, game_date) unique index collides when two different games carry
-- the same total/side wording on one Sunday. New rows use game_id; old rows
-- retain a matchup-aware partial identity until they are naturally replaced.

alter table public.nfl_results
  add column if not exists game_id text;

comment on column public.nfl_results.game_id is
  'Exact Ball Dont Lie provider game id used to attribute and deduplicate NFL grades.';

drop index if exists public.idx_nfl_results_unique_pick;

create unique index if not exists nfl_results_exact_game_pick_idx
  on public.nfl_results (
    game_date,
    game_id,
    lower(coalesce(matchup, '')),
    lower(coalesce(pick_text, ''))
  )
  where game_id is not null;

create unique index if not exists nfl_results_legacy_game_pick_idx
  on public.nfl_results (
    game_date,
    lower(coalesce(matchup, '')),
    lower(coalesce(pick_text, ''))
  )
  where game_id is null;
