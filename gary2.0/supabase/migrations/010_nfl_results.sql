-- NFL Results Table
-- Stores results for NFL picks from weekly_nfl_picks table
-- Separate from game_results since NFL picks use a different source table

CREATE TABLE IF NOT EXISTS nfl_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nfl_pick_id UUID REFERENCES weekly_nfl_picks(id) ON DELETE SET NULL,
  game_date DATE NOT NULL,
  week_number INTEGER,
  season INTEGER DEFAULT 2025,
  result VARCHAR(10) NOT NULL CHECK (result IN ('won', 'lost', 'push')),
  final_score VARCHAR(20),
  pick_text TEXT NOT NULL,
  matchup TEXT,
  confidence INTEGER,
  home_team TEXT,
  away_team TEXT,
  home_score INTEGER,
  away_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_nfl_results_game_date ON nfl_results(game_date);
CREATE INDEX IF NOT EXISTS idx_nfl_results_season_week ON nfl_results(season, week_number);
CREATE INDEX IF NOT EXISTS idx_nfl_results_pick_text ON nfl_results(pick_text);

-- Prevent duplicate results for the same pick
CREATE UNIQUE INDEX IF NOT EXISTS idx_nfl_results_unique_pick 
  ON nfl_results(pick_text, game_date);

-- Enable RLS
ALTER TABLE nfl_results ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access to nfl_results"
  ON nfl_results
  FOR SELECT
  TO public
  USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access to nfl_results"
  ON nfl_results
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to read
CREATE POLICY "Allow authenticated read access to nfl_results"
  ON nfl_results
  FOR SELECT
  TO authenticated
  USING (true);

-- Comment
COMMENT ON TABLE nfl_results IS 'Stores graded results for NFL picks from weekly_nfl_picks';
