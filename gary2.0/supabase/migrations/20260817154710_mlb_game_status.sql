-- Preserve the provider's MLB interruption state on the authoritative slate.
-- Nullable keeps every existing/non-MLB writer backward compatible while the
-- MLB adapter begins supplying one of these normalized values.
ALTER TABLE public.daily_slate
  ADD COLUMN IF NOT EXISTS game_status TEXT,
  ADD COLUMN IF NOT EXISTS status_detail TEXT;

ALTER TABLE public.daily_slate
  DROP CONSTRAINT IF EXISTS daily_slate_game_status_check;

ALTER TABLE public.daily_slate
  ADD CONSTRAINT daily_slate_game_status_check
  CHECK (
    game_status IS NULL
    OR game_status IN (
      'scheduled',
      'live',
      'final',
      'delayed',
      'postponed',
      'suspended',
      'cancelled'
    )
  ) NOT VALID;

ALTER TABLE public.daily_slate
  VALIDATE CONSTRAINT daily_slate_game_status_check;

COMMENT ON COLUMN public.daily_slate.game_status IS
  'Normalized provider game state; MLB interruption values are preserved instead of collapsed to scheduled.';

COMMENT ON COLUMN public.daily_slate.status_detail IS
  'Short render-ready provider state such as DELAYED, POSTPONED, or SUSPENDED.';
