-- Add multi-slate support to DFS lineups table
-- Allows Gary to generate lineups for Main, Express, After Hours, etc.

-- Drop old unique constraint (one lineup per day)
ALTER TABLE dfs_lineups DROP CONSTRAINT IF EXISTS unique_daily_lineup;

-- Add new columns for slate-specific info
ALTER TABLE dfs_lineups ADD COLUMN IF NOT EXISTS slate_name VARCHAR(50) DEFAULT 'Main Slate';
ALTER TABLE dfs_lineups ADD COLUMN IF NOT EXISTS slate_game_count INTEGER;
ALTER TABLE dfs_lineups ADD COLUMN IF NOT EXISTS slate_start_time VARCHAR(20);
ALTER TABLE dfs_lineups ADD COLUMN IF NOT EXISTS contest_type VARCHAR(20) DEFAULT 'gpp' CHECK (contest_type IN ('gpp', 'cash'));
ALTER TABLE dfs_lineups ADD COLUMN IF NOT EXISTS ceiling_projection DECIMAL(5,1);
ALTER TABLE dfs_lineups ADD COLUMN IF NOT EXISTS floor_projection DECIMAL(5,1);
ALTER TABLE dfs_lineups ADD COLUMN IF NOT EXISTS stack_info JSONB;

-- New unique constraint: one lineup per date/platform/sport/slate/contest_type
ALTER TABLE dfs_lineups ADD CONSTRAINT unique_slate_lineup 
    UNIQUE (date, platform, sport, slate_name, contest_type);

-- Index for slate lookups
CREATE INDEX IF NOT EXISTS idx_dfs_lineups_slate ON dfs_lineups(date, platform, sport, slate_name);

-- Comments
COMMENT ON COLUMN dfs_lineups.slate_name IS 'Name of the DFS slate (Main, Express, After Hours, etc.)';
COMMENT ON COLUMN dfs_lineups.slate_game_count IS 'Number of games in this slate';
COMMENT ON COLUMN dfs_lineups.slate_start_time IS 'Start time of the first game in this slate';
COMMENT ON COLUMN dfs_lineups.contest_type IS 'GPP (tournaments) or Cash (50/50s)';
COMMENT ON COLUMN dfs_lineups.ceiling_projection IS 'Upside projection for tournaments';
COMMENT ON COLUMN dfs_lineups.floor_projection IS 'Floor projection for safe plays';
COMMENT ON COLUMN dfs_lineups.stack_info IS 'JSON with game stack details';

