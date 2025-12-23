/**
 * DFS Lineup Generation Endpoint
 * Generates daily fantasy sports lineups for Gary's Fantasy feature
 * 
 * Supports:
 * - DraftKings and FanDuel platforms
 * - NBA and NFL sports
 * - Optimal lineup with 3-tier pivot alternatives per position
 * 
 * Security:
 * - Requires header `x-admin-token` to match env DFS_GEN_SECRET or ADMIN_TASK_TOKEN
 * 
 * Query params:
 * - platform: 'draftkings' or 'fanduel' (default: both)
 * - sport: 'NBA' or 'NFL' (default: both active)
 * - date: YYYY-MM-DD (defaults to EST today)
 */

import { createClient } from '@supabase/supabase-js';

// Get current date in EST
function estToday() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const est = new Date(utc + (3600000 * -5));
  return est.toISOString().split('T')[0];
}

// Initialize Supabase admin client
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase admin env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }
  return createClient(url, serviceKey, { 
    auth: { autoRefreshToken: false, persistSession: false } 
  });
}

// Check authorization
function isAuthorized(req) {
  try {
    const headerToken = req.headers['x-admin-token'] || req.headers['X-Admin-Token'];
    const secret = process.env.DFS_GEN_SECRET || process.env.ADMIN_TASK_TOKEN;
    
    // Header auth
    if (secret && headerToken && String(headerToken) === String(secret)) return true;
    
    // Query param auth (for browser/cron triggers)
    const queryToken = req.query?.token;
    if (secret && queryToken && String(queryToken) === String(secret)) return true;
    
    return false;
  } catch {
    return false;
  }
}

// Determine which sports have games today
async function getActiveSports(dateStr) {
  const { ballDontLieService } = await import('../src/services/ballDontLieService.js');
  
  const activeSports = [];
  
  // Check NBA
  try {
    const nbaGames = await ballDontLieService.getGames('basketball_nba', { dates: [dateStr] }, 5);
    if (nbaGames && nbaGames.length > 0) {
      activeSports.push('NBA');
      console.log(`[DFS] Found ${nbaGames.length} NBA games for ${dateStr}`);
    }
  } catch (e) {
    console.warn(`[DFS] Error checking NBA games: ${e.message}`);
  }
  
  // Check NFL (typically Sun/Mon/Thu)
  try {
    const nflGames = await ballDontLieService.getGames('americanfootball_nfl', { dates: [dateStr] }, 5);
    if (nflGames && nflGames.length > 0) {
      activeSports.push('NFL');
      console.log(`[DFS] Found ${nflGames.length} NFL games for ${dateStr}`);
    }
  } catch (e) {
    console.warn(`[DFS] Error checking NFL games: ${e.message}`);
  }
  
  return activeSports;
}

export default async function handler(req, res) {
  // CORS headers
  const origin = req.headers.origin || '';
  const allowed = [
    'https://www.betwithgary.ai',
    'https://betwithgary.ai',
    'http://localhost:5173',
    'http://localhost:3000'
  ];
  const allowOrigin = allowed.includes(origin) ? origin : 'https://www.betwithgary.ai';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // Health check
  if (req.method === 'GET' && !req.query.token) {
    return res.status(200).json({ 
      ok: true, 
      endpoint: 'api/generate-dfs-lineups',
      description: 'Gary\'s Fantasy DFS lineup generator'
    });
  }
  
  // Auth check for actual generation
  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  
  const startTime = Date.now();
  
  try {
    const supabase = getSupabaseAdmin();
    const dateParam = req.query.date || estToday();
    
    // Determine platforms to generate
    const platformParam = req.query.platform?.toLowerCase();
    const platforms = platformParam 
      ? [platformParam] 
      : ['draftkings', 'fanduel'];
    
    // Determine sports to generate
    const sportParam = req.query.sport?.toUpperCase();
    let sports = sportParam 
      ? [sportParam] 
      : await getActiveSports(dateParam);
    
    if (sports.length === 0) {
      return res.status(200).json({
        ok: true,
        message: 'No active sports with games today',
        date: dateParam,
        lineups: []
      });
    }
    
    console.log(`[DFS] Generating lineups for ${dateParam}`);
    console.log(`[DFS] Platforms: ${platforms.join(', ')}`);
    console.log(`[DFS] Sports: ${sports.join(', ')}`);
    
    // Lazy import services
    const { buildDFSContext } = await import('../src/services/agentic/dfsAgenticContext.js');
    const { generateDFSLineup, validateLineup, PLATFORM_CONSTRAINTS } = await import('../src/services/dfsLineupService.js');
    
    const results = [];
    const errors = [];
    
    // Generate lineup for each platform/sport combination
    for (const platform of platforms) {
      for (const sport of sports) {
        try {
          console.log(`\n[DFS] === ${platform.toUpperCase()} ${sport} ===`);
          
          // Build context (BDL stats + Gemini Grounding salaries)
          const context = await buildDFSContext(platform, sport, dateParam);
          
          if (!context.players || context.players.length === 0) {
            console.log(`[DFS] No players found for ${platform} ${sport}`);
            errors.push({
              platform,
              sport,
              error: 'No players with salaries found'
            });
            continue;
          }
          
          // Generate optimal lineup with pivots
          const lineup = await generateDFSLineup({
            platform,
            sport,
            players: context.players
          });
          
          // Validate lineup
          const validation = validateLineup(lineup, platform, sport);
          if (!validation.valid) {
            console.warn(`[DFS] Lineup validation warnings: ${validation.errors.join(', ')}`);
          }
          
          // Build Gary's notes
          const garyNotes = buildGaryNotes(context, lineup);
          
          // Store in database
          const lineupRecord = {
            date: dateParam,
            platform,
            sport,
            salary_cap: PLATFORM_CONSTRAINTS[platform][sport].salaryCap,
            total_salary: lineup.total_salary,
            projected_points: lineup.projected_points,
            lineup: lineup.lineup,
            gary_notes: garyNotes,
            updated_at: new Date().toISOString()
          };
          
          // Upsert (update if exists, insert if not)
          const { error: upsertError } = await supabase
            .from('dfs_lineups')
            .upsert(lineupRecord, {
              onConflict: 'date,platform,sport'
            });
          
          if (upsertError) {
            console.error(`[DFS] Upsert error: ${upsertError.message}`);
            errors.push({
              platform,
              sport,
              error: upsertError.message
            });
          } else {
            console.log(`[DFS] ✅ Stored ${platform} ${sport} lineup: $${lineup.total_salary}/${PLATFORM_CONSTRAINTS[platform][sport].salaryCap}, ${lineup.projected_points} pts`);
            results.push({
              platform,
              sport,
              totalSalary: lineup.total_salary,
              projectedPoints: lineup.projected_points,
              playersCount: lineup.lineup.length
            });
          }
          
        } catch (err) {
          console.error(`[DFS] Error generating ${platform} ${sport}: ${err.message}`);
          errors.push({
            platform,
            sport,
            error: err.message
          });
        }
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`\n[DFS] Generation complete in ${duration}ms`);
    console.log(`[DFS] Success: ${results.length}, Errors: ${errors.length}`);
    
    return res.status(200).json({
      ok: true,
      date: dateParam,
      duration: `${duration}ms`,
      lineups: results,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error(`[DFS] Fatal error: ${error.message}`);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}

/**
 * Build Gary's commentary notes for the lineup
 */
function buildGaryNotes(context, lineup) {
  const notes = [];
  
  // Mention late scratches if any
  if (context.lateScratches?.length > 0) {
    notes.push(`Late scratches factored in: ${context.lateScratches.join(', ')}`);
  }
  
  // Mention weather if NFL
  if (context.weatherAlerts?.length > 0) {
    notes.push(`Weather watch: ${context.weatherAlerts.join('; ')}`);
  }
  
  // Value play callout
  const cheapestStarter = lineup.lineup.reduce((min, p) => 
    p.salary < min.salary ? p : min
  , lineup.lineup[0]);
  
  if (cheapestStarter) {
    notes.push(`Value play: ${cheapestStarter.player} at $${cheapestStarter.salary} could unlock salary elsewhere`);
  }
  
  // Salary remaining
  const remaining = lineup.salary_cap - lineup.total_salary;
  if (remaining > 0) {
    notes.push(`$${remaining} remaining under cap - room for pivots if needed`);
  }
  
  return notes.join('\n');
}

