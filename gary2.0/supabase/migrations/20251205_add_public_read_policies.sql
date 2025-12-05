-- Migration: Add public read access to results tables
-- This allows the Billfold page to display results without authentication

-- Enable public read access to game_results
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'game_results' 
        AND policyname = 'Allow public read access to game_results'
    ) THEN
        CREATE POLICY "Allow public read access to game_results" 
        ON game_results 
        FOR SELECT 
        TO anon 
        USING (true);
    END IF;
END $$;

-- Enable public read access to prop_results
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'prop_results' 
        AND policyname = 'Allow public read access to prop_results'
    ) THEN
        CREATE POLICY "Allow public read access to prop_results" 
        ON prop_results 
        FOR SELECT 
        TO anon 
        USING (true);
    END IF;
END $$;

-- Verify the policies were created
SELECT schemaname, tablename, policyname, permissive, cmd 
FROM pg_policies 
WHERE tablename IN ('game_results', 'prop_results');

