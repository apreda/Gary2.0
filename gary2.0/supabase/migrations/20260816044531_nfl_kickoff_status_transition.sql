-- Forward-compatible NFL kickoff precision rollout.
--
-- The installed NCAAF-era constraint requires every non-NCAAF row to keep
-- kickoff_status null. Replace that rule before any new NFL writer can emit
-- confirmed/date_only precision. During the cutover, legacy NFL writers remain
-- valid only when they still provide a real commence_time.

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
      league = 'NFL'
      AND (
        (
          scheduled_date IS NOT NULL
          AND (
            (kickoff_status = 'confirmed' AND commence_time IS NOT NULL)
            OR (kickoff_status = 'date_only' AND commence_time IS NULL)
          )
        )
        OR (kickoff_status IS NULL AND commence_time IS NOT NULL)
      )
    )
    OR (
      league NOT IN ('NFL', 'NCAAF')
      AND kickoff_status IS NULL
      AND commence_time IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE public.daily_slate
  VALIDATE CONSTRAINT daily_slate_kickoff_status_check;

UPDATE public.daily_slate
SET scheduled_date = COALESCE(scheduled_date, date),
    kickoff_status = 'confirmed'
WHERE league = 'NFL'
  AND commence_time IS NOT NULL
  AND kickoff_status IS NULL;

COMMENT ON COLUMN public.daily_slate.kickoff_status IS
  'NFL/NCAAF kickoff precision: confirmed or date_only. Null for other sports.';
