-- Create RLS policies for daily_picks table
-- This will allow anyone to read picks and authenticated users to create/update them

-- Create policy to allow anyone to select picks
CREATE POLICY "Anyone can read picks" 
  ON daily_picks FOR SELECT USING (true);
  
-- Create policy to allow authenticated users to insert/update picks
CREATE POLICY "Authenticated users can create picks" 
  ON daily_picks FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');
  
CREATE POLICY "Authenticated users can update picks" 
  ON daily_picks FOR UPDATE 
  USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Authenticated users can delete picks" 
  ON daily_picks FOR DELETE 
  USING (auth.role() = 'authenticated' OR auth.role() = 'anon');
