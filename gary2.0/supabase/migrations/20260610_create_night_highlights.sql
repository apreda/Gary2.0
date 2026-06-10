-- night_highlights: league-wide "what cashed last night" — ALL players with a
-- standout statistical night (not limited to Gary's picks). Built nightly from
-- BDL box scores by scripts/run-all-results.js (service role), backfillable via
-- scripts/run-night-highlights.js. $0 — data fetches only, no LLM.
-- gary_result is set ONLY when Gary had a graded prop on that player that night
-- (joined from prop_results by player + date).

CREATE TABLE IF NOT EXISTS public.night_highlights (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_date    DATE NOT NULL,
  league       TEXT NOT NULL,                  -- 'MLB' for now
  category     TEXT NOT NULL CHECK (category IN ('hr', 'multi_hit', 'k_show')),
  player_name  TEXT NOT NULL,
  team         TEXT,                           -- BDL team name, e.g. 'Tigers'
  detail       TEXT NOT NULL,                  -- '2 HR · 5 RBI' / '3-for-4' / '9 K over 6 IP'
  gary_result  TEXT CHECK (gary_result IN ('won', 'lost')),  -- null unless Gary had a prop on this player that night
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (game_date, league, category, player_name)
);

CREATE INDEX IF NOT EXISTS night_highlights_date_league_idx
  ON public.night_highlights (game_date, league);

COMMENT ON TABLE public.night_highlights IS
  'League-wide standout stat lines from last night (HRs, multi-hit games, big strikeout shows) — not limited to Gary''s picks.';
COMMENT ON COLUMN public.night_highlights.category IS 'hr | multi_hit | k_show';
COMMENT ON COLUMN public.night_highlights.detail IS
  'Short human line: "2 HR · 5 RBI" (hr), "3-for-4" (multi_hit), "9 K over 6 IP" (k_show).';
COMMENT ON COLUMN public.night_highlights.gary_result IS
  'won | lost — set only when Gary had a graded prop on this player that night (prop_results join); null otherwise.';

-- RLS: anon (and everyone) can SELECT; only the service role may write.
-- Mirrors game_recaps / pick_fact_checks.
ALTER TABLE public.night_highlights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "night_highlights read" ON public.night_highlights;
CREATE POLICY "night_highlights read"
  ON public.night_highlights FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "night_highlights service write" ON public.night_highlights;
CREATE POLICY "night_highlights service write"
  ON public.night_highlights FOR ALL
  USING (auth.role() = 'service_role');
