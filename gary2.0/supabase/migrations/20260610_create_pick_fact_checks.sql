-- pick_fact_checks: claim-by-claim grading of Gary's pre-game rationale against
-- what actually happened. One row per graded GAME pick (props excluded). Written
-- nightly by scripts/run-all-results.js (service role) after results grading;
-- backfillable via scripts/run-fact-checks.js. The iOS app reads it directly
-- under the anon role (same pattern as insight_connections) to show
-- "what Gary got right" on last night's picks.

CREATE TABLE IF NOT EXISTS public.pick_fact_checks (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_date    DATE NOT NULL,
  league       TEXT NOT NULL,
  matchup      TEXT NOT NULL,           -- 'Away @ Home', matches game_results.matchup
  pick_text    TEXT,                    -- e.g. 'Mariners ML -122'
  result       TEXT,                    -- won | lost | push (from results grading)
  claims       JSONB NOT NULL,          -- [{claim, verdict: 'right'|'wrong'|'unclear', note}]
  right_count  INT,
  wrong_count  INT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (game_date, league, matchup)
);

CREATE INDEX IF NOT EXISTS pick_fact_checks_date_league_idx
  ON public.pick_fact_checks (game_date, league);

COMMENT ON TABLE public.pick_fact_checks IS
  'Claim-by-claim fact check of Gary''s pre-game rationale vs the actual game outcome. One row per graded game pick.';
COMMENT ON COLUMN public.pick_fact_checks.claims IS
  'Array of {claim, verdict, note}. verdict: right | wrong | unclear (unclear = evidence didn''t cover it).';
COMMENT ON COLUMN public.pick_fact_checks.result IS 'won | lost | push — the graded result of the pick itself.';

-- RLS: anon (and everyone) can SELECT; only the service role may write.
-- Mirrors insight_connections (20260602_create_insight_connections.sql).
ALTER TABLE public.pick_fact_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pick_fact_checks read" ON public.pick_fact_checks;
CREATE POLICY "pick_fact_checks read"
  ON public.pick_fact_checks FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "pick_fact_checks service write" ON public.pick_fact_checks;
CREATE POLICY "pick_fact_checks service write"
  ON public.pick_fact_checks FOR ALL
  USING (auth.role() = 'service_role');
