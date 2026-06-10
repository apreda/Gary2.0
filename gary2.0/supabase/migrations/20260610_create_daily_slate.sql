-- daily_slate: the full public slate for each day — EVERY game on the schedule
-- (not just games Gary picked), captured in the morning with opening lines.
-- Written by scripts/run-daily-slate.js + the 5 AM scheduler plan step
-- (service role); the iOS app reads it under the anon role so the slate shows
-- all of today's games immediately, with Gary's picks overlaying later.

CREATE TABLE IF NOT EXISTS public.daily_slate (
  id            BIGSERIAL PRIMARY KEY,
  date          DATE NOT NULL,                -- ET game day
  league        TEXT NOT NULL,                -- MLB | NBA | NHL | WC
  away_team     TEXT NOT NULL,
  home_team     TEXT NOT NULL,
  commence_time TIMESTAMPTZ NOT NULL,
  venue         TEXT,                         -- stadium name (WC only for now)
  spread        NUMERIC,                      -- HOME team spread (away = -spread)
  ml_home       NUMERIC,                      -- American moneyline, home side
  ml_away       NUMERIC,                      -- American moneyline, away side
  total         NUMERIC,                      -- over/under line
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (date, league, away_team, home_team)
);

-- The unique constraint's index already serves (date) and (date, league) lookups.

COMMENT ON TABLE public.daily_slate IS
  'Morning snapshot of the full public slate (all games + opening lines) per ET day. Picks overlay client-side.';
COMMENT ON COLUMN public.daily_slate.league IS 'MLB | NBA | NHL | WC';
COMMENT ON COLUMN public.daily_slate.spread IS 'Home team spread; away spread is the negation.';

-- RLS: anon (and everyone) can SELECT; only the service role may write.
-- Mirrors the insight_connections policies.
ALTER TABLE public.daily_slate ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_slate read" ON public.daily_slate;
CREATE POLICY "daily_slate read"
  ON public.daily_slate FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "daily_slate service write" ON public.daily_slate;
CREATE POLICY "daily_slate service write"
  ON public.daily_slate FOR ALL
  USING (auth.role() = 'service_role');
