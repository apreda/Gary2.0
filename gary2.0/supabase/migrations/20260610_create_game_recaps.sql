-- game_recaps: ESPN-style 2-4 sentence recap of each settled game Gary picked,
-- told from the betting perspective (the price, the drama, the bet's fate).
-- One row per graded GAME pick (props excluded). Written nightly by
-- scripts/run-all-results.js (service role) right after results grading;
-- backfillable via scripts/run-game-recaps.js. The iOS app reads it directly
-- under the anon role (same pattern as pick_fact_checks) to show last night's
-- story on the Home morning view.

CREATE TABLE IF NOT EXISTS public.game_recaps (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_date    DATE NOT NULL,
  league       TEXT NOT NULL,
  matchup      TEXT NOT NULL,           -- 'Away @ Home', matches game_results.matchup
  pick_text    TEXT,                    -- e.g. 'Angels ML +102'
  result       TEXT,                    -- won | lost | push (from results grading)
  headline     TEXT NOT NULL,           -- punchy 6-12 word betting headline
  recap        TEXT NOT NULL,           -- 2-4 sentence body, betting perspective
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (game_date, league, matchup)
);

CREATE INDEX IF NOT EXISTS game_recaps_date_league_idx
  ON public.game_recaps (game_date, league);

COMMENT ON TABLE public.game_recaps IS
  'ESPN-style betting recap of each settled game Gary picked. One row per graded game pick.';
COMMENT ON COLUMN public.game_recaps.headline IS
  'Punchy 6-12 word betting headline, e.g. "Angels roll as +102 dogs, Gary cashes".';
COMMENT ON COLUMN public.game_recaps.recap IS
  '2-4 sentence game story from the betting perspective. Facts come only from the grading evidence pack.';
COMMENT ON COLUMN public.game_recaps.result IS 'won | lost | push — the graded result of the pick itself.';

-- RLS: anon (and everyone) can SELECT; only the service role may write.
-- Mirrors pick_fact_checks (20260610_create_pick_fact_checks.sql).
ALTER TABLE public.game_recaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_recaps read" ON public.game_recaps;
CREATE POLICY "game_recaps read"
  ON public.game_recaps FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "game_recaps service write" ON public.game_recaps;
CREATE POLICY "game_recaps service write"
  ON public.game_recaps FOR ALL
  USING (auth.role() = 'service_role');
