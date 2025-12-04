-- Migration: Add RLS policy to prop_picks table for public read access
-- This allows the frontend (using anon key) to read prop picks

-- First ensure RLS is enabled on the table
ALTER TABLE prop_picks ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Allow public read access to prop_picks" ON prop_picks;

-- Create policy to allow anyone to read prop picks
CREATE POLICY "Allow public read access to prop_picks"
    ON prop_picks
    FOR SELECT
    TO public
    USING (true);

-- Allow authenticated users to insert/update (for admin operations)
DROP POLICY IF EXISTS "Allow service role to manage prop_picks" ON prop_picks;
CREATE POLICY "Allow service role to manage prop_picks"
    ON prop_picks
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

