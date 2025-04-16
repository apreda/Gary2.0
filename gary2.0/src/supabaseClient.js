import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://***REMOVED***.supabase.co'
const supabaseKey = '***REMOVED***'

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