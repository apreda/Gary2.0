import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xuttubsfgdcjfgmskcol.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dHR1YnNmZ2RjamZnbXNrY29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4OTY4MDQsImV4cCI6MjA1OTQ3MjgwNH0.wppXQAUHQXoD0z5wbjy93_0KYMREPufl_BCtb4Ugd40'

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey)

// Helper function to handle database access without requiring authentication
// This is used since anonymous auth is disabled in Supabase
export const ensureAnonymousSession = async () => {
  // Instead of signing in anonymously, we'll just verify the connection works
  try {
    // Test the connection with a simple query to a public table
    const { error } = await supabase
      .from('daily_picks')
      .select('count')
      .limit(1);
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error verifying Supabase connection:', error);
      return false;
    }
    
    console.log('Supabase connection verified successfully');
    return true;
  } catch (error) {
    console.error('Failed to verify Supabase connection:', error);
    return false;
  }
}