-- streaks: active MLB streaks as of the last completed night — hot/cold teams
-- (W/L runs, over/under runs) and players (hitting streaks, hitless skids,
-- consecutive-HR-game runs). Built nightly from BDL game logs + odds by
-- scripts/run-all-results.js (service role), backfillable via
-- scripts/run-streaks.js. $0 — data fetches only, no LLM.

CREATE TABLE IF NOT EXISTS public.streaks (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_date    DATE NOT NULL,                  -- the "as of" date (last completed night, ET)
  league       TEXT NOT NULL,                  -- 'MLB' for now
  subject_type TEXT NOT NULL CHECK (subject_type IN ('team', 'player')),
  subject      TEXT NOT NULL,                  -- "Chicago Cubs" or "Aaron Judge"
  team         TEXT,                           -- player's team full name; for teams, same as subject
  kind         TEXT NOT NULL CHECK (kind IN ('win', 'loss', 'hit', 'hitless', 'hr', 'over', 'under')),
  length       INT NOT NULL,                   -- games for team/hit/hr/over/under; AT-BATS for hitless
  detail       TEXT,                           -- <=60 chars body of work, leads with numbers
  next_game    TEXT,                           -- "vs Brewers · 7:10 PM ET" if subject plays TODAY (ET), else null
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (game_date, league, kind, subject)
);

CREATE INDEX IF NOT EXISTS streaks_date_league_idx
  ON public.streaks (game_date, league);

COMMENT ON TABLE public.streaks IS
  'Active streaks (team W/L + O/U runs, player hit/hitless/HR-game runs) as of the last completed night.';
COMMENT ON COLUMN public.streaks.kind IS 'win | loss | hit | hitless | hr | over | under';
COMMENT ON COLUMN public.streaks.length IS
  'Games for team/hit/hr/over/under streaks; AT-BATS for hitless skids.';
COMMENT ON COLUMN public.streaks.next_game IS
  '"vs Brewers · 7:10 PM ET" (home) / "at Brewers · 7:10 PM ET" (away) when the subject''s team plays today (ET); null otherwise.';

-- RLS: anon (and everyone) can SELECT; only the service role may write.
-- Mirrors night_highlights / game_recaps / pick_fact_checks.
ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "streaks read" ON public.streaks;
CREATE POLICY "streaks read"
  ON public.streaks FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "streaks service write" ON public.streaks;
CREATE POLICY "streaks service write"
  ON public.streaks FOR ALL
  USING (auth.role() = 'service_role');
