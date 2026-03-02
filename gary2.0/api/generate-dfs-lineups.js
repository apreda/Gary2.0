/**
 * DFS Lineup Generation Endpoint
 * Generates daily fantasy sports lineups for Gary's Fantasy feature
 * 
 * Supports:
 * - DraftKings and FanDuel platforms
 * - NBA and NFL sports
 * - Optimal lineup with 3-tier pivot alternatives per position
 * - GPP (Tournament) vs Cash (50/50) optimization modes
 * 
 * Security:
 * - Requires header `x-admin-token` to match env DFS_GEN_SECRET or ADMIN_TASK_TOKEN
 * 
 * Query params:
 * - platform: 'draftkings' or 'fanduel' (default: both)
 * - sport: 'NBA' or 'NFL' (default: both active)
 * - date: YYYY-MM-DD (defaults to EST today)
 * - contestType: (removed) — GPP only
 *   Gary's Fantasy always generates tournament (GPP) lineups.
 */

import { createClient } from '@supabase/supabase-js';

// Get current date in EST
function estToday() {
  const now = new Date();
  const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
  const estDate = new Intl.DateTimeFormat('en-US', options).format(now);
  const [month, day, year] = estDate.split('/');
  return `${year}-${month}-${day}`;
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

// Check authorization (header-based only — never pass secrets in query params)
function isAuthorized(req) {
  try {
    const headerToken = req.headers['x-admin-token'] || req.headers['X-Admin-Token'];
    const secret = process.env.DFS_GEN_SECRET || process.env.ADMIN_TASK_TOKEN;

    if (secret && headerToken && String(headerToken) === String(secret)) return true;

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
  
  // Discovery mode (public)
  if (req.method === 'GET' && req.query.action === 'discover') {
    const { discoverDFSSlates } = await import('../src/services/agentic/dfsSlateDiscoveryService.js');
    const dateParam = req.query.date || estToday();
    const platform = req.query.platform || 'draftkings';
    const sport = req.query.sport || 'NBA';

    try {
      const slates = await discoverDFSSlates(sport, platform, dateParam);
      return res.status(200).json({
        ok: true,
        date: dateParam,
        platform,
        sport,
        slates
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // Health check
  if (req.method === 'GET' && !req.headers['x-admin-token'] && !req.headers['X-Admin-Token']) {
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
    
    // Contest type - ALWAYS GPP (tournament mode to win)
    // Gary doesn't do "safe mode" - we're here to win, not play it safe
    const contestType = 'gpp';
    const isGPP = true;
    
    console.log(`[DFS] Generating lineups for ${dateParam}`);
    console.log(`[DFS] Platforms: ${platforms.join(', ')}`);
    console.log(`[DFS] Sports: ${sports.join(', ')}`);
    console.log(`[DFS] Contest Type: GPP (TOURNAMENT MODE - Ceiling optimization, max upside to WIN)`);
    
    const { buildDFSContext } = await import('../src/services/agentic/dfsAgenticContext.js');
    const { discoverDFSSlates } = await import('../src/services/agentic/dfsSlateDiscoveryService.js');
    const { generateAgenticDFSLineup } = await import('../src/services/agentic/dfs/dfsAgenticOrchestrator.js');
    const { PLATFORM_CONSTRAINTS } = await import('../src/services/dfsLineupService.js');
    
    const results = [];
    const errors = [];
    
    // Generate lineup for each platform/sport combination
    for (const platform of platforms) {
      for (const sport of sports) {
        try {
          console.log(`\n[DFS] === ${platform.toUpperCase()} ${sport} ===`);
          
          // STEP 1: Discover all available slates for today
          console.log(`[DFS] 🔍 Discovering slates for ${dateParam}...`);
          const slates = await discoverDFSSlates(sport, platform, dateParam);
          
          if (!slates || slates.length === 0) {
            console.log(`[DFS] No slates found for ${platform} ${sport}`);
            errors.push({
              platform,
              sport,
              error: 'No slates available for this date'
            });
            continue;
          }
          
          console.log(`[DFS] ✅ Found ${slates.length} slate(s): ${slates.map(s => `${s.name} (${s.gameCount || 0} games)`).join(', ')}`);
          
          // STEP 2: Generate lineup for EACH slate
          for (const slate of slates) {
            try {
              console.log(`\n[DFS] 🎰 Building lineup for: ${slate.name}`);
              console.log(`[DFS] Games: ${slate.gameCount || 0}, Start: ${slate.startTime || 'TBD'}`);
              
              // Build context for this specific slate
              const context = await buildDFSContext(platform, sport, dateParam, slate);
              
              if (!context.players || context.players.length === 0) {
                console.log(`[DFS] No players found for ${slate.name}`);
                errors.push({
                  platform,
                  sport,
                  slate: slate.name,
                  error: 'No players with salaries found'
                });
                continue;
              }
              
              console.log(`[DFS] Player pool: ${context.players.length}`);

              // ═══════════════════════════════════════════════════════════════════
              // AGENTIC DFS LINEUP GENERATION (NO FALLBACKS)
              // Gary Pro (Gemini) actually reasons about lineup decisions
              // If this fails, we fail - no mathematical optimizer fallback
              // ═══════════════════════════════════════════════════════════════════

              const agenticResult = await generateAgenticDFSLineup({
                platform,
                sport,
                date: dateParam,
                slate,
                contestType,
                context
              });

              // Convert agentic result to expected format
              const lineup = {
                lineup: agenticResult.lineup.map(p => ({
                  player: p.name,
                  position: p.position,
                  salary: p.salary,
                  team: p.team,
                  projected_points: p.projectedPoints || p.projected_pts,
                  ceiling_projection: p.ceilingProjection,
                  reasoning: p.reasoning
                })),
                total_salary: agenticResult.totalSalary,
                projected_points: agenticResult.projectedPoints,
                ceiling_projection: agenticResult.ceilingProjection,
                floor_projection: agenticResult.floorProjection,
                gary_notes: agenticResult.garyNotes,
                harmony_reasoning: agenticResult.ceilingScenario,
                stackInfo: null, // Agentic system handles correlation differently
                conviction: agenticResult.conviction,
                archetype: agenticResult.archetype,
                build_thesis: agenticResult.buildThesis
              };

              // Gary's notes from agentic system
              const garyNotes = lineup.gary_notes || `${agenticResult.archetype}: ${agenticResult.buildThesis}`;
              
              // Store in database with slate-specific info (including agentic fields)
              const salaryCap = PLATFORM_CONSTRAINTS[platform]?.[sport]?.salaryCap || 50000;
              const lineupRecord = {
                date: dateParam,
                platform,
                sport,
                slate_name: slate.name,
                slate_start_time: slate.startTime,
                slate_game_count: slate.gameCount || 0,
                contest_type: contestType,
                salary_cap: salaryCap,
                total_salary: lineup.total_salary,
                projected_points: lineup.projected_points,
                ceiling_projection: lineup.ceiling_projection,
                floor_projection: lineup.floor_projection,
                stack_info: lineup.stackInfo,
                lineup: lineup.lineup,
                gary_notes: lineup.gary_notes,
                harmony_reasoning: lineup.harmony_reasoning,
                // NEW: Agentic system fields
                conviction: lineup.conviction,
                archetype: lineup.archetype,
                build_thesis: lineup.build_thesis,
                updated_at: new Date().toISOString()
              };
              
              // Upsert (update if exists, insert if not)
              const { error: upsertError } = await supabase
                .from('dfs_lineups')
                .upsert(lineupRecord, {
                  onConflict: ['date', 'platform', 'sport', 'slate_name', 'slate_start_time']
                });
              
              if (upsertError) {
                console.error(`[DFS] Upsert error: ${upsertError.message}`);
                errors.push({
                  platform,
                  sport,
                  slate: slate.name,
                  error: upsertError.message
                });
              } else {
                const ceilingStr = lineup.ceiling_projection ? ` (ceiling: ${lineup.ceiling_projection})` : '';
                const convictionStr = lineup.conviction ? ` | Conviction: ${lineup.conviction}` : '';
                console.log(`[DFS] ✅ Stored ${slate.name} lineup: $${lineup.total_salary}/${salaryCap}, ${lineup.projected_points} pts${ceilingStr}${convictionStr}`);
                results.push({
                  platform,
                  sport,
                  slate: slate.name,
                  slateGameCount: slate.gameCount || 0,
                  contestType,
                  totalSalary: lineup.total_salary,
                  projectedPoints: lineup.projected_points,
                  ceilingProjection: lineup.ceiling_projection,
                  floorProjection: lineup.floor_projection,
                  stackInfo: lineup.stackInfo,
                  playersCount: lineup.lineup.length,
                  // NEW: Agentic system fields
                  conviction: lineup.conviction,
                  archetype: lineup.archetype,
                  buildThesis: lineup.build_thesis
                });
              }
              
            } catch (slateErr) {
              console.error(`[DFS] Error generating lineup for ${slate.name}: ${slateErr.message}`);
              errors.push({
                platform,
                sport,
                slate: slate.name,
                error: slateErr.message
              });
            }
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



