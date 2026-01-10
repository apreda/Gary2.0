-- Add Devil's Advocate metadata columns to daily_picks table
-- These columns track the multi-pass analysis process to verify Gary's picks

ALTER TABLE daily_picks 
ADD COLUMN IF NOT EXISTS devils_advocate_result TEXT,
ADD COLUMN IF NOT EXISTS was_revised BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS original_pick TEXT,
ADD COLUMN IF NOT EXISTS iterations INTEGER,
ADD COLUMN IF NOT EXISTS tool_calls_count INTEGER;

-- Add comments to explain the columns
COMMENT ON COLUMN daily_picks.devils_advocate_result IS 'Result of Devil''s Advocate check: validated, revised, rejected, or error';
COMMENT ON COLUMN daily_picks.was_revised IS 'Whether Gary revised his initial pick after Devil''s Advocate challenge';
COMMENT ON COLUMN daily_picks.original_pick IS 'The original pick before Devil''s Advocate revision (if any)';
COMMENT ON COLUMN daily_picks.iterations IS 'Number of iterations Gary went through in the agentic loop';
COMMENT ON COLUMN daily_picks.tool_calls_count IS 'Total number of stat lookups Gary performed';

