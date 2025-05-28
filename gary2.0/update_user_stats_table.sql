-- Update user_stats table to ensure all necessary columns exist
-- This script is safe to run multiple times

-- Add missing columns if they don't exist
ALTER TABLE user_stats 
ADD COLUMN IF NOT EXISTS push_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Ensure all existing columns have proper defaults
UPDATE user_stats 
SET 
  total_picks = COALESCE(total_picks, 0),
  win_count = COALESCE(win_count, 0),
  loss_count = COALESCE(loss_count, 0),
  push_count = COALESCE(push_count, 0),
  ride_count = COALESCE(ride_count, 0),
  fade_count = COALESCE(fade_count, 0),
  current_streak = COALESCE(current_streak, 0),
  longest_streak = COALESCE(longest_streak, 0),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW())
WHERE 
  total_picks IS NULL OR 
  win_count IS NULL OR 
  loss_count IS NULL OR 
  push_count IS NULL OR 
  ride_count IS NULL OR 
  fade_count IS NULL OR 
  current_streak IS NULL OR 
  longest_streak IS NULL OR
  created_at IS NULL OR
  updated_at IS NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(id);
CREATE INDEX IF NOT EXISTS idx_user_stats_updated_at ON user_stats(updated_at);

-- Add a trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_user_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_stats_updated_at ON user_stats;
CREATE TRIGGER trigger_user_stats_updated_at
    BEFORE UPDATE ON user_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_user_stats_updated_at();

-- Ensure user_picks table has the right structure too
ALTER TABLE user_picks 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create indexes for user_picks
CREATE INDEX IF NOT EXISTS idx_user_picks_user_id ON user_picks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_picks_pick_id ON user_picks(pick_id);
CREATE INDEX IF NOT EXISTS idx_user_picks_outcome ON user_picks(outcome);
CREATE INDEX IF NOT EXISTS idx_user_picks_decision ON user_picks(decision);

-- Add trigger for user_picks updated_at
CREATE OR REPLACE FUNCTION update_user_picks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_picks_updated_at ON user_picks;
CREATE TRIGGER trigger_user_picks_updated_at
    BEFORE UPDATE ON user_picks
    FOR EACH ROW
    EXECUTE FUNCTION update_user_picks_updated_at();

-- Show current table structures
SELECT 'user_stats columns:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'user_stats'
ORDER BY ordinal_position;

SELECT 'user_picks columns:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'user_picks'
ORDER BY ordinal_position; 