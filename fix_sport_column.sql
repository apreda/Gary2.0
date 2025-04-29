-- Fix the NOT NULL constraint on the sport column in wagers table

-- Alter the sport column to allow NULL values
ALTER TABLE wagers ALTER COLUMN sport DROP NOT NULL;

-- Add a default value for future inserts
ALTER TABLE wagers ALTER COLUMN sport SET DEFAULT 'unknown';

-- Update any existing NULL sport values
UPDATE wagers 
SET sport = 'unknown'
WHERE sport IS NULL;

-- Print success message
SELECT 'Sport column constraint in wagers table modified to allow NULL values' AS message;
