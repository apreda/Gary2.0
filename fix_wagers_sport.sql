-- Fix the NOT NULL constraint on the sport column in wagers table

-- Alter the sport column to allow NULL values
ALTER TABLE wagers ALTER COLUMN sport DROP NOT NULL;

-- Add a default value
ALTER TABLE wagers ALTER COLUMN sport SET DEFAULT 'unknown';

-- Fix any existing NULL sport values with a default value
UPDATE wagers 
SET sport = 'unknown'
WHERE sport IS NULL;

-- Print success message
SELECT 'Sport column constraint in wagers table modified. Picks should now save properly.' AS message;
