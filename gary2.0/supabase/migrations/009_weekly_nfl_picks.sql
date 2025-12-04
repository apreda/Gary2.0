-- Weekly NFL Picks Table
-- NFL picks persist for the entire week since games are weekly, not daily

CREATE TABLE IF NOT EXISTS weekly_nfl_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL, -- Monday of the NFL week
  week_number INTEGER, -- NFL week number (1-18)
  season INTEGER NOT NULL DEFAULT 2025,
  picks JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(week_start, season)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_weekly_nfl_picks_week ON weekly_nfl_picks(week_start, season);

-- Enable RLS
ALTER TABLE weekly_nfl_picks ENABLE ROW LEVEL SECURITY;

-- Allow public read access (same as daily_picks)
CREATE POLICY "Allow public read access to weekly_nfl_picks"
  ON weekly_nfl_picks
  FOR SELECT
  TO public
  USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access to weekly_nfl_picks"
  ON weekly_nfl_picks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to get current NFL week start (Monday)
CREATE OR REPLACE FUNCTION get_nfl_week_start(game_date DATE DEFAULT CURRENT_DATE)
RETURNS DATE AS $$
BEGIN
  -- NFL weeks start on Tuesday, so we find the previous Tuesday
  -- But for simplicity, we'll use Monday as week start
  RETURN game_date - EXTRACT(DOW FROM game_date)::INTEGER + 1;
END;
$$ LANGUAGE plpgsql;

-- Comment
COMMENT ON TABLE weekly_nfl_picks IS 'Stores NFL picks that persist for the entire week';

