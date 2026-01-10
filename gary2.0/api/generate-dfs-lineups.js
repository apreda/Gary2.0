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
 * - contestType: 'gpp' or 'cash' (default: 'gpp')
 *     - gpp: Optimize for ceiling (350+ pts), use stacking, apply chalk pivot
 *     - cash: Optimize for floor (280 pts), prioritize consistency
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
  
  // Discovery mode (public)
  if (req.method === 'GET' && req.query.action === 'discover') {
    const { discoverDFSSlates } = await import('../src/services/agentic/dfsAgenticContext.js');
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
    
    // Contest type - ALWAYS GPP (tournament mode to win)
    // Gary doesn't do "safe mode" - we're here to win, not play it safe
    const contestType = 'gpp';
    const isGPP = true;
    
    console.log(`[DFS] Generating lineups for ${dateParam}`);
    console.log(`[DFS] Platforms: ${platforms.join(', ')}`);
    console.log(`[DFS] Sports: ${sports.join(', ')}`);
    console.log(`[DFS] Contest Type: GPP (TOURNAMENT MODE - Ceiling optimization, max upside to WIN)`);
    
    // Lazy import services
    const { buildDFSContext, discoverDFSSlates } = await import('../src/services/agentic/dfsAgenticContext.js');
    const { generateDFSLineup, validateLineup, PLATFORM_CONSTRAINTS } = await import('../src/services/dfsLineupService.js');
    
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
              
              // Generate optimal lineup with pivots
              // Archetype selection: balanced_build (default), stars_and_scrubs, cash_safe
              const archetype = req.query.archetype || 'balanced_build';
              
              const lineup = await generateDFSLineup({
                platform,
                sport,
                players: context.players,
                context: {
                  contestType,
                  archetype,
                  fadePlayers: context.fadePlayers || [],
                  targetPlayers: context.targetPlayers || [],
                  games: context.games || [],
                  ownershipData: context.ownershipData || {},
                  slate: slate
                }
              });
              
              // Validate lineup
              const validation = validateLineup(lineup, platform, sport);
              if (!validation.valid) {
                console.warn(`[DFS] Lineup validation warnings: ${validation.errors.join(', ')}`);
              }
              
              // Gary's notes are now built inside generateDFSLineup
              const garyNotes = lineup.gary_notes || buildGaryNotes(context, lineup, contestType);
              
              // Store in database with slate-specific info
              const lineupRecord = {
                date: dateParam,
                platform,
                sport,
                slate_name: slate.name,
                slate_start_time: slate.startTime,
                slate_game_count: slate.gameCount || 0,
                contest_type: contestType,
                salary_cap: PLATFORM_CONSTRAINTS[platform][sport].salaryCap,
                total_salary: lineup.total_salary,
                projected_points: lineup.projected_points,
                ceiling_projection: lineup.ceiling_projection,
                floor_projection: lineup.floor_projection,
                stack_info: lineup.stackInfo,
                lineup: lineup.lineup,
                gary_notes: garyNotes,
                updated_at: new Date().toISOString()
              };
              
              // Upsert (update if exists, insert if not)
              const { error: upsertError } = await supabase
                .from('dfs_lineups')
                .upsert(lineupRecord, {
                  onConflict: 'date,platform,sport,slate_name,contest_type'
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
                console.log(`[DFS] ✅ Stored ${slate.name} lineup: $${lineup.total_salary}/${PLATFORM_CONSTRAINTS[platform][sport].salaryCap}, ${lineup.projected_points} pts${ceilingStr}`);
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
                  playersCount: lineup.lineup.length
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

/**
 * Build Gary's commentary notes for the lineup
 * Includes narrative context - what makes Gary more than just a "math bot"
 * 
 * @param {Object} context - DFS context with narrative data
 * @param {Object} lineup - Generated lineup
 * @param {string} contestType - 'gpp' or 'cash'
 */
export function buildGaryNotes(context, lineup, contestType = 'gpp') {
  const notes = [];
  
  // GPP Tournament mode - we're here to WIN
  notes.push(`🎰 TOURNAMENT LINEUP - Optimized for ceiling (max upside to win big)`);
  if (lineup.ceiling_projection) {
    notes.push(`📈 Ceiling projection: ${lineup.ceiling_projection} pts | Floor: ${lineup.floor_projection} pts`);
  }
  
  // NFL Stacking info
  if (lineup.stackInfo?.primaryStack) {
    const stack = lineup.stackInfo;
    notes.push(`🏈 Stack: ${stack.primaryStack.qb} + ${stack.primaryStack.receivers?.join(', ')} (${stack.primaryStack.team})`);
    if (stack.bringback) {
      notes.push(`↩️ Bringback: ${stack.bringback.player} (${stack.bringback.team})`);
    }
  }
  
  // Price Lag / Breakout plays
  const priceLagPlayers = lineup.lineup.filter(p => p.isPriceLag || p.projectionBoosted);
  if (priceLagPlayers.length > 0) {
    notes.push(`🚀 Price Lag breakouts: ${priceLagPlayers.map(p => 
      `${p.player} ($${p.salary?.toLocaleString() || 'N/A'})`
    ).join(', ')}`);
  }
  
  // Contrarian plays (tournament differentiation)
  const contrarianPlayers = lineup.lineup.filter(p => p.isContrarian || (p.ownership && p.ownership < 10));
  if (contrarianPlayers.length > 0) {
    notes.push(`🎲 Contrarian edge: ${contrarianPlayers.map(p => 
      `${p.player} (${p.ownership || '<10'}% owned)`
    ).join(', ')}`);
  }
  
  // Top narrative targets
  if (context.targetPlayers?.length > 0) {
    const targets = context.targetPlayers.slice(0, 3);
    const inLineup = targets.filter(t => 
      lineup.lineup.some(p => p.player.toLowerCase().includes(t.name?.toLowerCase()))
    );
    if (inLineup.length > 0) {
      notes.push(`🎯 Narrative plays: ${inLineup.map(t => 
        `${t.name} (${t.reason})`
      ).join(', ')}`);
    }
  }
  
  // Players to fade that we avoided
  if (context.fadePlayers?.length > 0) {
    const faded = context.fadePlayers.slice(0, 2);
    notes.push(`⚠️ Fading: ${faded.map(f => 
      `${f.name} (${f.reason})`
    ).join(', ')}`);
  }
  
  // Mention late scratches if any
  if (context.lateScratches?.length > 0) {
    notes.push(`📝 Late scratches: ${context.lateScratches.join(', ')}`);
  }
  
  // Mention weather if NFL
  if (context.weatherAlerts?.length > 0) {
    notes.push(`🌧️ Weather watch: ${context.weatherAlerts.join('; ')}`);
  }
  
  // QB changes (NFL specific)
  if (context.qbChanges?.length > 0) {
    notes.push(`🔄 QB changes: ${context.qbChanges.join(', ')}`);
  }
  
  // Game narrative highlights
  if (context.narratives?.length > 0) {
    const highTotal = context.narratives.find(n => 
      (n.vegas_total > 225 && context.sport === 'NBA') || 
      (n.vegas_total > 50 && context.sport === 'NFL')
    );
    if (highTotal) {
      notes.push(`🔥 Shootout alert: ${highTotal.game} (O/U ${highTotal.vegas_total}) - stack opportunity`);
    }
  }
  
  // Value play callout
  const cheapestStarter = lineup.lineup.reduce((min, p) => 
    p.salary < min.salary ? p : min
  , lineup.lineup[0]);
  
  if (cheapestStarter) {
    notes.push(`💰 Value play: ${cheapestStarter.player} at $${cheapestStarter.salary?.toLocaleString() || 'N/A'}`);
  }
  
  // Salary remaining
  const salaryCap = lineup.salary_cap || 50000;
  const remaining = salaryCap - lineup.total_salary;
  if (remaining > 0) {
    notes.push(`📊 $${remaining.toLocaleString()} under cap - room for pivots`);
  }
  
  return notes.join('\n');
}

