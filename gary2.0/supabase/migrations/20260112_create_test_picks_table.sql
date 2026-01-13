-- ============================================================================
-- TEST PICKS TABLE - For development testing without affecting production
-- ============================================================================
-- This table mirrors daily_picks but is NOT displayed to users in the app.
-- Use this for testing Gary's analysis quality, debugging, and sharing rationales.
-- 
-- Created: 2026-01-12
-- Purpose: Store test picks that won't appear in the RealGaryPicks UI
-- ============================================================================

-- Create the test_daily_picks table (mirrors daily_picks structure)
CREATE TABLE IF NOT EXISTS test_daily_picks (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,
    picks JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Devil's Advocate metadata columns (matching daily_picks)
    devils_advocate_result TEXT,
    was_revised BOOLEAN DEFAULT FALSE,
    original_pick TEXT,
    iterations INTEGER,
    tool_calls_count INTEGER,
    
    -- Test-specific metadata
    test_name TEXT,  -- Optional: name for this test run (e.g., "Investigative Guardrails Test")
    test_notes TEXT  -- Optional: notes about what was being tested
);

-- Create unique constraint on date (same as daily_picks)
CREATE UNIQUE INDEX IF NOT EXISTS test_daily_picks_date_idx ON test_daily_picks(date);

-- Add comments
COMMENT ON TABLE test_daily_picks IS 'Test picks table - mirrors daily_picks but NOT displayed in app. Safe for unlimited testing.';
COMMENT ON COLUMN test_daily_picks.test_name IS 'Optional name/label for this test run';
COMMENT ON COLUMN test_daily_picks.test_notes IS 'Optional notes about what was being tested';

-- Enable RLS but allow all operations for authenticated users (dev convenience)
ALTER TABLE test_daily_picks ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for service role (scripts)
CREATE POLICY "Service role has full access to test_daily_picks"
ON test_daily_picks
FOR ALL
USING (true)
WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to copy a pick from test to production (when ready to ship)
CREATE OR REPLACE FUNCTION promote_test_pick_to_production(test_date DATE)
RETURNS void AS $$
BEGIN
    INSERT INTO daily_picks (date, picks, created_at, updated_at)
    SELECT date, picks, NOW(), NOW()
    FROM test_daily_picks
    WHERE date = test_date
    ON CONFLICT (date) DO UPDATE SET
        picks = EXCLUDED.picks,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION promote_test_pick_to_production IS 'Copy a test pick to production daily_picks table';

-- Function to clear old test picks (housekeeping)
CREATE OR REPLACE FUNCTION clear_old_test_picks(days_to_keep INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM test_daily_picks
    WHERE date < (CURRENT_DATE - days_to_keep);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION clear_old_test_picks IS 'Delete test picks older than N days (default 7)';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant access to authenticated users and service role
GRANT ALL ON test_daily_picks TO authenticated;
GRANT ALL ON test_daily_picks TO service_role;
GRANT USAGE, SELECT ON SEQUENCE test_daily_picks_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE test_daily_picks_id_seq TO service_role;
