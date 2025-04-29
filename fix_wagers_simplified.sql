-- Simplified approach: create or modify the wagers table to fix the constraint issue

-- Check wagers table structure (informational only)
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'wagers';

-- Simpler approach: alter the pick_id column to allow nulls
ALTER TABLE wagers ALTER COLUMN pick_id DROP NOT NULL;

-- OR provide a default UUID value (alternative approach)
-- ALTER TABLE wagers ALTER COLUMN pick_id SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;

-- Fix any existing null pick_ids with a placeholder value
UPDATE wagers 
SET pick_id = '00000000-0000-0000-0000-000000000000'::uuid
WHERE pick_id IS NULL;

-- Print success message
SELECT 'Wagers table constraints modified. Picks should now save properly.' AS message;
