-- Check and fix daily_picks table structure

-- First, let's examine the current structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'daily_picks';

-- Create the table with the correct structure if it doesn't exist
CREATE TABLE IF NOT EXISTS daily_picks (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  picks JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Check if there are any triggers on the daily_picks table
SELECT tgname AS trigger_name, 
       pg_get_triggerdef(oid) AS trigger_definition
FROM pg_trigger
WHERE tgrelid = 'daily_picks'::regclass::oid;

-- Disable any problematic triggers (uncomment and replace trigger_name if needed)
-- ALTER TABLE daily_picks DISABLE TRIGGER trigger_name;
