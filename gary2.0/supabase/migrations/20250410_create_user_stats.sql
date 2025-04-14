-- Create user_stats table
CREATE TABLE IF NOT EXISTS public.user_stats (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    total_picks integer DEFAULT 0,
    ride_count integer DEFAULT 0,
    fade_count integer DEFAULT 0,
    win_count integer DEFAULT 0,
    loss_count integer DEFAULT 0,
    current_streak integer DEFAULT 0,
    longest_streak integer DEFAULT 0,
    last_result text,
    bankroll integer DEFAULT 1000,
    recent_results text[] DEFAULT ARRAY[]::text[],
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Set up Row Level Security
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to view only their own stats
CREATE POLICY "Users can view own stats" ON public.user_stats
    FOR SELECT
    USING (auth.uid() = id);

-- Create policy to allow users to update only their own stats
CREATE POLICY "Users can update own stats" ON public.user_stats
    FOR UPDATE
    USING (auth.uid() = id);

-- Create policy to allow users to insert their own stats
CREATE POLICY "Users can insert own stats" ON public.user_stats
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Create trigger to update the updated_at column
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_stats_updated_at
    BEFORE UPDATE ON public.user_stats
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.user_stats TO authenticated;
