-- Persist the source-game and sport dimensions used by the prop generator.
-- Nullable keeps every historical result readable; new grader writes fill
-- both fields whenever the source pick carries an exact game id.
alter table public.prop_results
  add column if not exists game_id text,
  add column if not exists sport text;

comment on column public.prop_results.game_id is
  'Exact provider game id from the source prop pick; disambiguates same-day rematches/doubleheaders.';
comment on column public.prop_results.sport is
  'Normalized source sport/lane label (for example NFL, MLB, or MLB HR).';

-- Historical rows remain outside this index until the grader safely adopts
-- them. New rows have a complete, non-destructive idempotency key that cannot
-- collapse different games, sports, sides, or lines into one result.
create unique index if not exists prop_results_exact_identity_idx
  on public.prop_results (
    game_date,
    upper(sport),
    game_id,
    lower(coalesce(player_name, '')),
    lower(coalesce(prop_type, '')),
    lower(coalesce(bet, '')),
    coalesce(line_value, -999999::numeric)
  )
  where game_date is not null and game_id is not null and sport is not null;
