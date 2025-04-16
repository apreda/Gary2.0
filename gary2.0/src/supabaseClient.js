import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xuttubsfgdcjfgmskcol.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dHR1YnNmZ2RjamZnbXNrY29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4OTY4MDQsImV4cCI6MjA1OTQ3MjgwNH0.wppXQAUHQXoD0z5wbjy93_0KYMREPufl_BCtb4Ugd40'

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey)

// Helper to ensure we have an anonymous session for public operations
export const ensureAnonymousSession = async () => {
  // Check if we have an active session
  const { data: { session } } = await supabase.auth.getSession()
  
  // If no session exists, sign in anonymously
  if (!session) {
    try {
      console.log('No active session, signing in anonymously...')
      const { error } = await supabase.auth.signInAnonymously()
      if (error) {
        console.error('Error signing in anonymously:', error)
        return false
      }
      console.log('Anonymous sign-in successful')
      return true
    } catch (error) {
      console.error('Failed to create anonymous session:', error)
      return false
    }
  }
  
  console.log('Session exists, no need to sign in')
  return true
}