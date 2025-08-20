// Server-side account deletion endpoint
// Requires env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return res.status(500).json({ error: 'Server not configured for deletion' })
    }

    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : null
    if (!token) return res.status(401).json({ error: 'Missing auth token' })

    // Verify token to get user id using anon client + provided token
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })
    const {
      data: { user },
      error: userErr
    } = await userClient.auth.getUser()
    if (userErr || !user) return res.status(401).json({ error: 'Invalid token' })

    // Optional: best-effort cleanup of user-owned rows (extend as needed)
    // Example: delete from daily_picks where user_id = user.id
    // Skipped here unless you add user_id relations. This endpoint focuses on auth deletion.

    // Admin delete
    const admin = createClient(supabaseUrl, serviceKey)
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
    if (delErr) return res.status(500).json({ error: delErr.message })

    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}


