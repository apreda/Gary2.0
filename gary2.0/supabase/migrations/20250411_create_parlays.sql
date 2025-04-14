-- Drop existing table if it exists
DROP TABLE IF EXISTS parlays;

-- Create the parlays table
CREATE TABLE parlays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  legs JSONB[] NOT NULL,
  total_odds DECIMAL,
  payout_multiplier DECIMAL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  analysis TEXT,
  result TEXT DEFAULT 'pending'
);

-- Create index on created_at for faster queries
CREATE INDEX idx_parlays_created_at ON parlays(created_at DESC);

-- Add RLS policies
ALTER TABLE parlays ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read parlays
CREATE POLICY "Parlays are viewable by everyone"
  ON parlays FOR SELECT
  USING (true);

-- Only allow authenticated users to insert
CREATE POLICY "Authenticated users can insert parlays"
  ON parlays FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Only allow updates to status and result fields
CREATE POLICY "Authenticated users can update parlay status"
  ON parlays FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
