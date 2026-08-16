-- Preserve provider date-only NCAAF fixtures without inventing a kickoff.
-- `commence_time` is nullable only for rows whose kickoff_status is date_only;
-- `scheduled_date` keeps the fixture on the correct ET slate.

ALTER TABLE public.daily_slate
  ALTER COLUMN commence_time DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS scheduled_date DATE,
  ADD COLUMN IF NOT EXISTS kickoff_status TEXT;

-- Existing confirmed NCAAF rows predate the precision columns. Backfill them
-- before installing the fail-closed constraint; the stored ET slate date is
-- authoritative for these already-published fixtures.
UPDATE public.daily_slate
SET scheduled_date = COALESCE(scheduled_date, date),
    kickoff_status = 'confirmed'
WHERE league = 'NCAAF'
  AND commence_time IS NOT NULL
  AND kickoff_status IS NULL;

ALTER TABLE public.daily_slate
  DROP CONSTRAINT IF EXISTS daily_slate_kickoff_status_check;

ALTER TABLE public.daily_slate
  ADD CONSTRAINT daily_slate_kickoff_status_check
  CHECK (
    (
      league = 'NCAAF'
      AND scheduled_date IS NOT NULL
      AND (
        (kickoff_status = 'confirmed' AND commence_time IS NOT NULL)
        OR (kickoff_status = 'date_only' AND commence_time IS NULL)
      )
    )
    OR (
      league <> 'NCAAF'
      AND kickoff_status IS NULL
      AND commence_time IS NOT NULL
    )
  );

-- NCAAF writes use exact provider game identity. This lets a date-only row be
-- updated in place when the provider later posts a confirmed kickoff.
-- Older writers keyed on commence_time, so a provider time correction could
-- have left two snapshots for one provider game. Keep the newest snapshot
-- before enforcing the identity contract; this touches slate cache rows only.
WITH duplicate_game_rows AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY league, bdl_game_id
           ORDER BY id DESC
         ) AS duplicate_rank
  FROM public.daily_slate
  WHERE bdl_game_id IS NOT NULL
)
DELETE FROM public.daily_slate AS slate
USING duplicate_game_rows AS duplicate
WHERE slate.id = duplicate.id
  AND duplicate.duplicate_rank > 1;

ALTER TABLE public.daily_slate
  DROP CONSTRAINT IF EXISTS daily_slate_league_bdl_game_id_key;

ALTER TABLE public.daily_slate
  ADD CONSTRAINT daily_slate_league_bdl_game_id_key
  UNIQUE (league, bdl_game_id);

COMMENT ON COLUMN public.daily_slate.scheduled_date IS
  'Provider calendar date for a fixture; authoritative when kickoff_status=date_only.';
COMMENT ON COLUMN public.daily_slate.kickoff_status IS
  'NCAAF kickoff precision: confirmed or date_only. Null for legacy/non-NCAAF rows.';
