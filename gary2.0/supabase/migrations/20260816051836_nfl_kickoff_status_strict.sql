-- Finalize NFL kickoff precision after every daily-slate writer and scheduler
-- has loaded the new contract. Backfill any legacy row written during the
-- compatibility window before removing that temporary allowance.

UPDATE public.daily_slate
SET scheduled_date = COALESCE(scheduled_date, date),
    kickoff_status = 'confirmed'
WHERE league = 'NFL'
  AND commence_time IS NOT NULL
  AND kickoff_status IS NULL;

ALTER TABLE public.daily_slate
  DROP CONSTRAINT IF EXISTS daily_slate_kickoff_status_check;

ALTER TABLE public.daily_slate
  ADD CONSTRAINT daily_slate_kickoff_status_check
  CHECK (
    (
      league IN ('NFL', 'NCAAF')
      AND scheduled_date IS NOT NULL
      AND (
        (kickoff_status = 'confirmed' AND commence_time IS NOT NULL)
        OR (kickoff_status = 'date_only' AND commence_time IS NULL)
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
