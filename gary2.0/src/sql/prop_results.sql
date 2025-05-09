-- Create prop_results table
CREATE TABLE public.prop_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prop_pick_id UUID REFERENCES public.prop_picks(id) NOT NULL,
  player_name TEXT NOT NULL,
  team TEXT NOT NULL,
  league TEXT NOT NULL,
  prop_type TEXT NOT NULL,
  prop_line NUMERIC NOT NULL,
  pick_direction TEXT NOT NULL,
  actual_result NUMERIC,
  result_status TEXT CHECK (result_status IN ('won', 'lost', 'push', 'pending')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE public.prop_results ENABLE ROW LEVEL SECURITY;

-- Create policy to allow admin access
CREATE POLICY "Admin users can perform all operations" 
  ON public.prop_results
  USING (auth.uid() IN (
    SELECT au.id FROM auth.users au
    WHERE au.email = 'admin@betwithgary.ai'
  ));

-- Create policy to allow users to read results
CREATE POLICY "All users can read prop results" 
  ON public.prop_results 
  FOR SELECT 
  USING (true);
