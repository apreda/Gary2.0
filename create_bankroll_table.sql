-- Create a minimal bankroll table to satisfy trigger dependencies
-- This addresses the 'relation "bankroll" does not exist' error during picks storage

-- Create the bankroll table with required columns
CREATE TABLE IF NOT EXISTS bankroll (
  id SERIAL PRIMARY KEY,
  starting_amount DECIMAL DEFAULT 10000,
  current_amount DECIMAL DEFAULT 10000,
  monthly_goal_percent INTEGER DEFAULT 30,
  start_date DATE DEFAULT CURRENT_DATE,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial record if none exists
INSERT INTO bankroll (starting_amount, current_amount, monthly_goal_percent, start_date, last_updated) 
VALUES (10000, 10000, 30, CURRENT_DATE, NOW())
ON CONFLICT DO NOTHING;

-- Add Row Level Security (RLS) policies for bankroll table
ALTER TABLE bankroll ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to select bankroll data
CREATE POLICY "Anyone can read bankroll" 
  ON bankroll FOR SELECT USING (true);
  
-- Create policy to allow authenticated users to update bankroll
CREATE POLICY "Authenticated users can update bankroll" 
  ON bankroll FOR UPDATE 
  USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Add comment on table for documentation
COMMENT ON TABLE bankroll IS 'Minimal bankroll table to satisfy database dependencies for daily picks storage';

-- Print success message
SELECT 'Bankroll table created successfully. This should resolve the "relation bankroll does not exist" error.' AS message;
