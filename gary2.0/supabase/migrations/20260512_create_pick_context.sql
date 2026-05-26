-- pick_context: per-pick investigation artifacts that back the "Talk to Gary" feature.
-- Stores the rich context Gary had when generating each pick so the chat layer can
-- speak from real depth (scout report, research briefing, bilateral case, rationale).
-- One row per pick. pick_id matches daily_picks pick_id.

CREATE TABLE IF NOT EXISTS public.pick_context (
  pick_id          TEXT PRIMARY KEY,
  date             DATE NOT NULL,
  league           TEXT NOT NULL,
  sport_key        TEXT,
  home_team        TEXT,
  away_team        TEXT,
  pick_text        TEXT,
  rationale        TEXT,
  -- Investigation artifacts
  scout_report     TEXT,       -- Gary's data-only scout report
  flash_scout      TEXT,       -- Flash's investigation-ready scout report
  research_briefing TEXT,      -- Flash research assistant's per-factor findings
  bilateral_case   TEXT,       -- "Case for HOME / Case for AWAY" from Pass 1
  raw_analysis     TEXT,       -- Gary's final pre-JSON analysis (Pass 2.5 + Pass 3)
  -- Structured tool history
  tool_call_history JSONB,
  -- Verified Tale of the Tape (already shown on pick card; included here for chat)
  tale_of_tape     JSONB,
  -- Game metadata
  game_time        TIMESTAMPTZ,
  venue            TEXT,
  tournament_context TEXT,
  spread           NUMERIC,
  moneyline_home   INTEGER,
  moneyline_away   INTEGER,
  total            NUMERIC,
  -- Bookkeeping
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pick_context_date_idx ON public.pick_context (date DESC);
CREATE INDEX IF NOT EXISTS pick_context_league_date_idx ON public.pick_context (league, date DESC);

-- RLS: only service role writes; authenticated users read their own day's context
ALTER TABLE public.pick_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pick_context read" ON public.pick_context;
CREATE POLICY "pick_context read"
  ON public.pick_context FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "pick_context service write" ON public.pick_context;
CREATE POLICY "pick_context service write"
  ON public.pick_context FOR ALL
  USING (auth.role() = 'service_role');
