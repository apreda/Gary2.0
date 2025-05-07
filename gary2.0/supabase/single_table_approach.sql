-- This script sets up a system where you primarily use your public.users table
-- but it stays synced with the auth.users table that Supabase requires

-- 1. First, drop any existing problematic triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;

-- 2. Make sure the public.users table exists with the fields you need
-- This will be your primary table for app data and Stripe
CREATE TABLE IF NOT EXISTS public.users (
  -- Link to auth.users (required)
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Your custom fields
  email TEXT,
  plan TEXT DEFAULT 'free',
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'inactive',
  subscription_period_start TIMESTAMPTZ,
  subscription_period_end TIMESTAMPTZ,
  stats JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Set up row level security so users can only access their own data
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own data
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
CREATE POLICY "Users can view their own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Allow service roles full access (for admin operations)
DROP POLICY IF EXISTS "Service roles can do anything" ON public.users;
CREATE POLICY "Service roles can do anything" ON public.users
  USING (auth.role() = 'service_role');

-- 4. Create a trigger function that automatically syncs new users
CREATE OR REPLACE FUNCTION public.sync_user_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert basic user info into public.users
  INSERT INTO public.users (id, email, created_at)
  VALUES (NEW.id, NEW.email, NOW())
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create a trigger that runs when new users sign up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_on_signup();

-- 6. Create a trigger function that keeps email in sync when updated
CREATE OR REPLACE FUNCTION public.sync_user_on_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update email if it changed
  IF NEW.email <> OLD.email THEN
    UPDATE public.users 
    SET email = NEW.email, updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create a trigger that runs when user info is updated
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_on_update();

-- 8. Sync any existing auth users to the public.users table
INSERT INTO public.users (id, email, created_at)
SELECT id, email, created_at
FROM auth.users
ON CONFLICT (id) DO NOTHING;
