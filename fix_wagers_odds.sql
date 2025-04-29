-- Fix the NOT NULL constraint on the odds column in wagers table

-- First, check the current structure of the wagers table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'wagers' AND column_name = 'odds';

-- Alter the odds column to allow NULL values
ALTER TABLE wagers ALTER COLUMN odds DROP NOT NULL;

-- Alternatively, set a default value (this can be better for data integrity)
-- ALTER TABLE wagers ALTER COLUMN odds SET DEFAULT -110;

-- Fix any existing NULL odds values with a reasonable default
UPDATE wagers 
SET odds = -110
WHERE odds IS NULL;

-- Print success message
SELECT 'Odds column constraint in wagers table modified. Picks should now save properly.' AS message;
