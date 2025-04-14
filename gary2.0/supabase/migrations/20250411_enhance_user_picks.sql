-- Enhance user_picks table with additional fields
ALTER TABLE user_picks
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
ADD COLUMN IF NOT EXISTS pick_reference JSONB,
ADD COLUMN IF NOT EXISTS pick_type VARCHAR(20) CHECK (pick_type IN ('parlay', 'single')) DEFAULT 'single';

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_picks_created_at ON user_picks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_picks_user_decision ON user_picks(user_id, decision);
CREATE INDEX IF NOT EXISTS idx_user_picks_outcome ON user_picks(outcome);

-- Create a view for easier querying of bet history
CREATE OR REPLACE VIEW user_bet_history AS
SELECT 
    up.id,
    up.user_id,
    up.decision,
    up.outcome,
    up.created_at,
    up.pick_type,
    up.pick_reference,
    u.email,
    CASE 
        WHEN up.outcome = 'win' THEN 1
        WHEN up.outcome = 'loss' THEN -1
        ELSE 0
    END as result_value
FROM user_picks up
JOIN auth.users u ON up.user_id = u.id;

-- Add RLS policies
ALTER TABLE user_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own picks"
    ON user_picks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own picks"
    ON user_picks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Function to get user's betting streak
CREATE OR REPLACE FUNCTION get_user_streak(user_id UUID)
RETURNS TABLE (
    current_streak INTEGER,
    streak_type VARCHAR
) 
LANGUAGE plpgsql
AS $$
DECLARE
    last_outcome VARCHAR;
    streak_count INTEGER := 0;
BEGIN
    -- Get the last outcome
    SELECT outcome INTO last_outcome
    FROM user_picks
    WHERE user_id = user_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Count consecutive outcomes
    WITH RECURSIVE streak AS (
        SELECT 
            id,
            outcome,
            created_at,
            1 as depth
        FROM user_picks
        WHERE user_id = user_id
        ORDER BY created_at DESC
        LIMIT 1

        UNION ALL

        SELECT 
            p.id,
            p.outcome,
            p.created_at,
            s.depth + 1
        FROM user_picks p
        INNER JOIN streak s ON p.outcome = s.outcome
        WHERE p.user_id = user_id
        AND p.created_at < s.created_at
        ORDER BY p.created_at DESC
    )
    SELECT COUNT(*) INTO streak_count FROM streak;

    RETURN QUERY
    SELECT 
        streak_count,
        last_outcome;
END;
$$;
