-- Fix user_picks table to accept string pick_id values
-- The current table expects UUID format but we're using string IDs

-- First, check the current structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_picks' AND column_name = 'pick_id';

-- Change pick_id column from UUID to TEXT to accept our string IDs
ALTER TABLE user_picks ALTER COLUMN pick_id TYPE TEXT;

-- Ensure the table has the correct structure
ALTER TABLE user_picks 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_picks_user_id ON user_picks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_picks_pick_id ON user_picks(pick_id);
CREATE INDEX IF NOT EXISTS idx_user_picks_user_pick ON user_picks(user_id, pick_id);
CREATE INDEX IF NOT EXISTS idx_user_picks_outcome ON user_picks(outcome);
CREATE INDEX IF NOT EXISTS idx_user_picks_decision ON user_picks(decision);

-- Ensure RLS is enabled
ALTER TABLE user_picks ENABLE ROW LEVEL SECURITY;

-- Create or update RLS policies
DROP POLICY IF EXISTS "Users can view their own picks" ON user_picks;
DROP POLICY IF EXISTS "Users can insert their own picks" ON user_picks;
DROP POLICY IF EXISTS "Users can update their own picks" ON user_picks;

CREATE POLICY "Users can view their own picks"
    ON user_picks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own picks"
    ON user_picks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own picks"
    ON user_picks FOR UPDATE
    USING (auth.uid() = user_id);

-- Show the updated structure
SELECT 'user_picks table structure after fix:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'user_picks'
ORDER BY ordinal_position; 