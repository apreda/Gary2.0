-- DFS Lineups Table for Gary's Fantasy Feature
-- Stores daily fantasy sports lineups for DraftKings and FanDuel

CREATE TABLE IF NOT EXISTS dfs_lineups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('draftkings', 'fanduel')),
    sport VARCHAR(20) NOT NULL CHECK (sport IN ('NBA', 'NFL')),
    salary_cap INTEGER NOT NULL,
    total_salary INTEGER NOT NULL,
    projected_points DECIMAL(5,1) NOT NULL,
    lineup JSONB NOT NULL,
    gary_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint: one lineup per date/platform/sport combination
    CONSTRAINT unique_daily_lineup UNIQUE (date, platform, sport)
);

-- Index for fast lookups by date
CREATE INDEX IF NOT EXISTS idx_dfs_lineups_date ON dfs_lineups(date);

-- Index for platform + sport filtering
CREATE INDEX IF NOT EXISTS idx_dfs_lineups_platform_sport ON dfs_lineups(platform, sport);

-- Enable Row Level Security
ALTER TABLE dfs_lineups ENABLE ROW LEVEL SECURITY;

-- Public read access (same pattern as daily_picks)
CREATE POLICY "Allow public read access to dfs_lineups"
    ON dfs_lineups
    FOR SELECT
    USING (true);

-- Service role can insert/update (for generation endpoint)
CREATE POLICY "Allow service role to manage dfs_lineups"
    ON dfs_lineups
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Comment on table
COMMENT ON TABLE dfs_lineups IS 'Stores Gary AI daily fantasy sports lineups for DraftKings and FanDuel';
COMMENT ON COLUMN dfs_lineups.lineup IS 'JSON array of lineup positions with player info and pivot alternatives';
COMMENT ON COLUMN dfs_lineups.gary_notes IS 'Optional notes from Gary about the lineup strategy';

