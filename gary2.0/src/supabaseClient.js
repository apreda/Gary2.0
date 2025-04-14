import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://***REMOVED***.supabase.co'
const supabaseKey = '***REMOVED***'

export const supabase = createClient(supabaseUrl, supabaseKey)