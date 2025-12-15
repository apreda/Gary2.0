#!/usr/bin/env node
/**
 * Agentic Pick Generation Script
 * 
 * This script runs Gary's agentic system to generate picks.
 * Usage:
 *   node scripts/run-agentic-picks.js --nba
 *   node scripts/run-agentic-picks.js --nfl
 *   node scripts/run-agentic-picks.js --nhl
 *   node scripts/run-agentic-picks.js --epl
 *   node scripts/run-agentic-picks.js --ncaab
 *   node scripts/run-agentic-picks.js --ncaaf
 *   node scripts/run-agentic-picks.js --all
 */

// MUST load env vars FIRST before any other imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env first, then .env.local (later values override)
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

// Now import modules that depend on env vars
const { analyzeGame } = await import('../src/services/agentic/agenticOrchestrator.js');
const { oddsService } = await import('../src/services/oddsService.js');
const { picksService } = await import('../src/services/picksService.js');

// Configuration
const SPORT_CONFIG = {
  nba: { key: 'basketball_nba', name: 'NBA', emoji: '🏀' }, // Full games - stats now working!
  nfl: { key: 'americanfootball_nfl', name: 'NFL', emoji: '🏈', daysAhead: 7 }, // NFL is weekly
  nhl: { key: 'icehockey_nhl', name: 'NHL', emoji: '🏒', isBeta: true }, // BETA: Limited advanced analytics
  epl: { key: 'soccer_epl', name: 'EPL', emoji: '⚽', isBeta: true, daysAhead: 7, confidenceThreshold: 0.63 }, // BETA: Lower threshold for EPL
  ncaab: { key: 'basketball_ncaab', name: 'NCAAB', emoji: '🏀', maxGames: 10, minStats: 8 }, // Limit NCAAB to 10 games, require 8+ stats
  ncaaf: { key: 'americanfootball_ncaaf', name: 'NCAAF', emoji: '🏈', fbsOnly: true } // FBS only (no FCS)
};

// FBS Conference IDs from BDL (excludes FCS conferences like Big Sky, SWAC, MEAC, etc.)
const FBS_CONFERENCE_IDS = [
  1,   // ACC
  2,   // American Athletic
  3,   // Big 12
  4,   // Big Ten
  5,   // Conference USA
  6,   // FBS Independents
  7,   // MAC (Mid-American)
  8,   // Mountain West
  9,   // Pac-12 (mostly defunct, teams moved)
  10,  // SEC
  11,  // Sun Belt
];

// In-memory tracking to prevent duplicate processing in same run session
// This prevents race conditions where DB check passes but pick is already being generated
const processedGamesThisSession = new Set();

function getGameKey(homeTeam, awayTeam) {
  return `${homeTeam}|${awayTeam}`.toLowerCase().trim();
}

// Parse arguments
const args = process.argv.slice(2);
const runAll = args.includes('--all');
const sportsToRun = [];

if (runAll) {
  sportsToRun.push('nba', 'nfl', 'nhl', 'epl', 'ncaab', 'ncaaf');
} else {
  if (args.includes('--nba')) sportsToRun.push('nba');
  if (args.includes('--nfl')) sportsToRun.push('nfl');
  if (args.includes('--nhl')) sportsToRun.push('nhl');
  if (args.includes('--epl')) sportsToRun.push('epl');
  if (args.includes('--ncaab')) sportsToRun.push('ncaab');
  if (args.includes('--ncaaf')) sportsToRun.push('ncaaf');
}

if (sportsToRun.length === 0) {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                 🐻 GARY AGENTIC PICKS GENERATOR                  ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Usage:                                                          ║
║    node scripts/run-agentic-picks.js --nba                       ║
║    node scripts/run-agentic-picks.js --nfl                       ║
║    node scripts/run-agentic-picks.js --nhl   (BETA)              ║
║    node scripts/run-agentic-picks.js --epl   (BETA)              ║
║    node scripts/run-agentic-picks.js --ncaab                     ║
║    node scripts/run-agentic-picks.js --ncaaf                     ║
║    node scripts/run-agentic-picks.js --all                       ║
║                                                                  ║
║  Or combine sports:                                              ║
║    node scripts/run-agentic-picks.js --nba --nfl                 ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);
  process.exit(0);
}

// Check environment variables
function checkEnv() {
  const checks = [
    { name: 'OPENAI_API_KEY', alts: ['VITE_OPENAI_API_KEY'] },
    { name: 'SUPABASE_URL', alts: ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'] },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', alts: ['SUPABASE_SERVICE_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY'] }
  ];
  const missing = [];
  
  for (const check of checks) {
    let value = process.env[check.name];
    if (!value) {
      for (const alt of check.alts) {
        if (process.env[alt]) {
          value = process.env[alt];
          break;
        }
      }
    }
    if (!value) {
      missing.push(check.name);
    }
  }
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(k => console.error(`   - ${k}`));
    console.error('\nMake sure you have a .env file with these variables.');
    process.exit(1);
  }
}

// Main execution
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║              🐻 GARY AGENTIC PICKS GENERATOR 🐻                  ║
║                                                                  ║
║        Stats-First Analysis | OpenAI Function Calling            ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);

  checkEnv();
  
  const startTime = Date.now();
  const allPicks = [];
  const summary = {};
  
  for (const sportShort of sportsToRun) {
    const config = SPORT_CONFIG[sportShort];
    const sportStartTime = Date.now();
    
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`${config.emoji} STARTING ${config.name} ANALYSIS`);
    console.log(`${'═'.repeat(70)}\n`);
    
    try {
      // Fetch games
      console.log(`[${config.name}] Fetching upcoming games...`);
      const allGames = await oddsService.getUpcomingGames(config.key, { nocache: true });
      
      // Filter to games within time window
      const now = new Date();
      let games;
      let timeLabel;
      
      // NFL: Filter to current NFL week only using week number
      // This prevents grabbing next week's games (e.g., Week 16 games when running Week 15)
      if (config.key === 'americanfootball_nfl') {
        const currentWeekNumber = picksService.getNFLWeekNumber();
        const currentWeekStart = picksService.getNFLWeekStart();
        
        // NFL weeks run Tuesday-Monday, so we filter games that belong to the current week
        // Get end of current week (next Tuesday 5:00 AM ET to catch late Monday games)
        const weekStartDate = new Date(currentWeekStart + 'T00:00:00');
        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setDate(weekEndDate.getDate() + 8); // Tuesday of next week
        weekEndDate.setHours(5, 0, 0, 0); // 5 AM to catch any late Monday finishes
        
        // Check if today is Monday (MNF day) - only process today's games
        const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
        const dayOfWeek = estNow.getDay(); // 0 = Sunday, 1 = Monday
        const isMonday = dayOfWeek === 1;
        
        if (isMonday) {
          // On Monday, only process Monday Night Football (games happening today)
          const todayStart = new Date(estNow);
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date(estNow);
          todayEnd.setHours(23, 59, 59, 999);
          
          games = allGames?.filter(g => {
            const gameTime = new Date(g.commence_time);
            const gameTimeEST = new Date(gameTime.toLocaleString("en-US", { timeZone: "America/New_York" }));
            // Game must be in the future AND happening today (Monday Night Football)
            return gameTime >= now && gameTimeEST >= todayStart && gameTimeEST <= todayEnd;
          }) || [];
          
          timeLabel = `MNF (Week ${currentWeekNumber})`;
          console.log(`[${config.name}] Monday Night Football filter: only today's games`);
        } else {
          // Other days, process the full week
          games = allGames?.filter(g => {
            const gameTime = new Date(g.commence_time);
            // Game must be in the future AND within the current NFL week
            return gameTime >= now && gameTime >= weekStartDate && gameTime < weekEndDate;
          }) || [];
          
          timeLabel = `Week ${currentWeekNumber} (${currentWeekStart})`;
          console.log(`[${config.name}] NFL Week ${currentWeekNumber} filter: weekStart=${currentWeekStart}, weekEnd=${weekEndDate.toISOString()}`);
        }
      } else {
        // Other sports use daysAhead (default 1 day = 24 hours)
        const daysAhead = config.daysAhead || 1;
        const endTime = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
        games = allGames?.filter(g => {
          const gameTime = new Date(g.commence_time);
          return gameTime >= now && gameTime <= endTime;
        }) || [];
        timeLabel = daysAhead === 7 ? 'this week' : 'within 24h';
      }
      
      // NCAAF: Filter to FBS only (exclude FCS games)
      if (config.fbsOnly && config.key === 'americanfootball_ncaaf') {
        console.log(`[${config.name}] Filtering to FBS games only (excluding FCS)...`);
        const { ballDontLieService } = await import('../src/services/ballDontLieService.js');
        const ncaafTeams = await ballDontLieService.getTeams('americanfootball_ncaaf');
        
        const fbsTeamNames = new Set(
          ncaafTeams
            .filter(t => FBS_CONFERENCE_IDS.includes(t.conference))
            .map(t => t.full_name?.toLowerCase())
        );
        
        const beforeCount = games.length;
        games = games.filter(g => {
          const homeIsFbs = fbsTeamNames.has(g.home_team?.toLowerCase());
          const awayIsFbs = fbsTeamNames.has(g.away_team?.toLowerCase());
          return homeIsFbs && awayIsFbs; // Both teams must be FBS
        });
        console.log(`[${config.name}] FBS filter: ${beforeCount} → ${games.length} games (removed ${beforeCount - games.length} FCS games)`);
      }
      
      // NCAAB: Filter out games with teams that have insufficient stats data
      // This prevents picks for tiny schools (D2/D3/NAIA) where we can't get good stats
      // Based on BDL docs: team_season_stats returns games_played, fgm, fga, fg_pct, fg3m, fg3a, pts, etc.
      if (config.key === 'basketball_ncaab') {
        console.log(`[${config.name}] Checking data quality for teams...`);
        const { ballDontLieService } = await import('../src/services/ballDontLieService.js');
        const MIN_GAMES_FOR_ANALYSIS = 5;
        
        const beforeCount = games.length;
        const filteredGames = [];
        const skippedGames = [];
        
        for (const game of games) {
          try {
            // Get team IDs
            const homeTeam = await ballDontLieService.getTeamByNameGeneric('basketball_ncaab', game.home_team);
            const awayTeam = await ballDontLieService.getTeamByNameGeneric('basketball_ncaab', game.away_team);
            
            if (!homeTeam || !awayTeam) {
              skippedGames.push({ game, reason: 'Team not found in database' });
              continue;
            }
            
            // Check season stats for both teams
            const season = now.getMonth() + 1 <= 4 ? now.getFullYear() - 1 : now.getFullYear();
            const [homeStats, awayStats] = await Promise.all([
              ballDontLieService.getTeamSeasonStats('basketball_ncaab', { teamId: homeTeam.id, season }),
              ballDontLieService.getTeamSeasonStats('basketball_ncaab', { teamId: awayTeam.id, season })
            ]);
            
            // Extract stats using exact BDL field names from docs
            const h = homeStats?.[0] || {};
            const a = awayStats?.[0] || {};
            
            // games_played, fgm, fga, fg_pct, fg3m, fg3a, pts are the key fields
            const homeGames = h.games_played || 0;
            const awayGames = a.games_played || 0;
            const homePts = h.pts || 0;  // Per-game average
            const awayPts = a.pts || 0;
            const homeFgPct = h.fg_pct || 0;  // Already a percentage
            const awayFgPct = a.fg_pct || 0;
            
            // Data quality: Must have 5+ games AND valid stats (PPG > 40, FG% > 30)
            // Any real D1 team scores 50+ PPG and shoots 35%+
            const homeHasData = homeGames >= MIN_GAMES_FOR_ANALYSIS && homePts > 40 && homeFgPct > 30;
            const awayHasData = awayGames >= MIN_GAMES_FOR_ANALYSIS && awayPts > 40 && awayFgPct > 30;
            
            if (homeHasData && awayHasData) {
              filteredGames.push(game);
            } else {
              const homeReason = !homeHasData ? `${homeGames}g/${homePts.toFixed(1)}ppg/${homeFgPct.toFixed(1)}%fg` : 'OK';
              const awayReason = !awayHasData ? `${awayGames}g/${awayPts.toFixed(1)}ppg/${awayFgPct.toFixed(1)}%fg` : 'OK';
              skippedGames.push({ 
                game, 
                reason: `${game.home_team}: ${homeReason} | ${game.away_team}: ${awayReason}` 
              });
            }
          } catch (err) {
            // If we can't check, include the game (let the 8-stat filter catch bad ones)
            console.warn(`[${config.name}] Could not verify data for ${game.away_team} @ ${game.home_team}: ${err.message}`);
            filteredGames.push(game);
          }
        }
        
        games = filteredGames;
        
        if (skippedGames.length > 0) {
          console.log(`[${config.name}] ⚠️ Skipped ${skippedGames.length} games with insufficient data:`);
          skippedGames.slice(0, 5).forEach(({ game, reason }) => {
            console.log(`   - ${game.away_team} @ ${game.home_team}: ${reason}`);
          });
          if (skippedGames.length > 5) {
            console.log(`   ... and ${skippedGames.length - 5} more`);
          }
        }
        console.log(`[${config.name}] Data quality filter: ${beforeCount} → ${games.length} games`);
      }
      
      // Apply max games limit if specified (for NCAAB which can have 70+ games)
      const MAX_GAMES = config.maxGames || 100;
      const limitedGames = games.slice(0, MAX_GAMES);
      
      console.log(`[${config.name}] Found ${allGames?.length || 0} total games, ${games.length} ${timeLabel}${games.length > MAX_GAMES ? ` (limited to ${MAX_GAMES})` : ''}`);
      
      // Replace games with limited version
      const finalGames = limitedGames;
      
      if (!finalGames || finalGames.length === 0) {
        console.log(`[${config.name}] No games found for today.`);
        summary[config.name] = { games: 0, picks: 0, time: 0 };
        continue;
      }
      
      console.log(`[${config.name}] Found ${finalGames.length} games\n`);
      
      // Process each game
      const sportPicks = [];
      for (let i = 0; i < finalGames.length; i++) {
        const game = finalGames[i];
        
        // Skip specific teams if configured (for testing)
        const SKIP_TEAMS = []; // Empty - let deduplication handle existing picks
        const shouldSkip = SKIP_TEAMS.some(team => 
          game.home_team?.toLowerCase().includes(team.toLowerCase()) ||
          game.away_team?.toLowerCase().includes(team.toLowerCase())
        );
        if (shouldSkip) {
          console.log(`\n⏭️  Skipping: ${game.away_team} @ ${game.home_team} (in skip list)`);
          continue;
        }
        
        console.log(`\n[${i + 1}/${finalGames.length}] ${game.away_team} @ ${game.home_team}`);
        
        // Create game key for deduplication
        const gameKey = getGameKey(game.home_team, game.away_team);
        
        // FIRST: Check in-memory set (prevents race conditions within same run)
        if (processedGamesThisSession.has(gameKey)) {
          console.log(`⏭️  Already processed in this session: "${gameKey}"`);
          continue;
        }
        
        // SECOND: Check database for existing pick
        const existingPick = await checkExistingPick(config.name, game.home_team, game.away_team);
        if (existingPick) {
          console.log(`⏭️  Already have pick for this game: "${existingPick}"`);
          processedGamesThisSession.add(gameKey); // Mark as processed
          continue;
        }
        
        // Mark as being processed BEFORE we start (prevents race condition)
        processedGamesThisSession.add(gameKey);
        
        // Run agentic analysis
        const result = await analyzeGame(game, config.key);
        
        if (result && !result.error && result.pick) {
          // Check minimum stats requirement (for NCAAB especially)
          const statsCount = result.toolCallHistory?.length || 0;
          const minStatsRequired = config.minStats || 0;
          
          if (minStatsRequired > 0 && statsCount < minStatsRequired) {
            console.log(`\n⏭️  SKIPPED: ${result.pick}`);
            console.log(`   Reason: Only ${statsCount} stats available (minimum ${minStatsRequired} required)`);
            console.log(`   Stats: ${result.toolCallHistory?.map(t => t.token).join(', ') || 'none'}`);
            continue; // Skip this pick
          }
          
          // For NCAAB: Check that we have real stat values (not 0.0% or 0-0)
          if (config.key === 'basketball_ncaab' && result.toolCallHistory) {
            let zeroStatCount = 0;
            let totalCheckedStats = 0;
            const badStats = [];
            
            for (const stat of result.toolCallHistory) {
              // Check for zero/empty values in home and away data
              const checkForZeros = (obj, teamLabel) => {
                if (!obj || typeof obj !== 'object') return false;
                for (const [key, val] of Object.entries(obj)) {
                  if (key === 'team') continue;
                  // Check for problematic zero values that indicate missing data
                  const isZero = val === 0 || val === '0' || val === '0.0' || val === '0.0%' || 
                      val === '0-0' || val === '0.000' || val === 0.0 || val === '0.00';
                  if (isZero) {
                    badStats.push(`${stat.token}:${teamLabel}:${key}=${val}`);
                    return true;
                  }
                }
                return false;
              };
              
              if (stat.homeValue || stat.awayValue) {
                totalCheckedStats++;
                const homeHasZero = checkForZeros(stat.homeValue, 'home');
                const awayHasZero = checkForZeros(stat.awayValue, 'away');
                if (homeHasZero || awayHasZero) {
                  zeroStatCount++;
                }
              }
            }
            
            // If more than 25% of stats have zeros, skip this pick
            const zeroRatio = totalCheckedStats > 0 ? zeroStatCount / totalCheckedStats : 0;
            if (zeroRatio > 0.25) {
              console.log(`\n⏭️  SKIPPED: ${result.pick}`);
              console.log(`   Reason: Too many zero/missing stats (${zeroStatCount}/${totalCheckedStats} = ${(zeroRatio*100).toFixed(0)}%)`);
              console.log(`   Bad stats: ${badStats.slice(0, 5).join(', ')}${badStats.length > 5 ? '...' : ''}`);
              continue;
            }
          }
          
          console.log(`\n✅ PICK: ${result.pick}`);
          console.log(`   Confidence: ${result.confidence}`);
          console.log(`   Type: ${result.type}`);
          if (result.toolCallHistory) {
            console.log(`   Stats Requested (${statsCount}): ${result.toolCallHistory.map(t => t.token).join(', ')}`);
          }
          // Log rationale preview
          const rationale = result.rationale || result.analysis || '';
          if (rationale) {
            console.log(`\n📝 RATIONALE:\n${rationale.substring(0, 800)}${rationale.length > 800 ? '...' : ''}\n`);
          } else if (result.rawAnalysis) {
            // Extract rationale from raw response if not parsed
            const raw = result.rawAnalysis;
            const rationaleMatch = raw.match(/"rationale"\s*:\s*"([^"]+)"/s);
            if (rationaleMatch) {
              console.log(`\n📝 RATIONALE:\n${rationaleMatch[1].substring(0, 800)}${rationaleMatch[1].length > 800 ? '...' : ''}\n`);
            }
          }
          
          // Extract stat data with values for structured Tale of the Tape display
          // FLATTEN nested stats - each individual metric becomes its own row
          // This ensures every stat Gary called shows up individually in the Tale of the Tape
          const seenStatKeys = new Set(); // Track unique stat keys to avoid duplicates
          const statsData = [];
          
          // Helper to check if a value is valid
          const isValidValue = (k, v) => {
            if (k === 'team' || k === 'category' || k === 'note' || k === 'interpretation') return false;
            if (v === 'N/A' || v === '' || v === null || v === undefined) return false;
            if (Array.isArray(v) && v.length === 0) return false;
            if (typeof v === 'object') return false; // Skip nested objects
            if (String(v).includes('Check scout')) return false;
            // Filter out invalid zero rates
            if ((k.includes('rate') || k.includes('pct') || k.includes('_pct')) && 
                (v === '0.000' || v === 0 || v === '0' || v === '0.0' || v === '0.00')) {
              return false;
            }
            return true;
          };
          
          // Human-readable names for common stat keys
          const statNameMap = {
            'yards_per_game': 'Total YPG',
            'yards_per_play': 'Yards/Play',
            'points_per_game': 'PPG',
            'opp_yards_per_game': 'Opp Yards/Game',
            'opp_points_per_game': 'Opp PPG',
            'third_down_pct': '3rd Down %',
            'fourth_down_pct': '4th Down %',
            'opp_third_down_pct': 'Opp 3rd Down %',
            'opp_fourth_down_pct': 'Opp 4th Down %',
            'turnover_diff': 'Turnover +/-',
            'takeaways': 'Takeaways',
            'giveaways': 'Giveaways',
            'qb_rating': 'QB Rating',
            'completion_pct': 'Completion %',
            'yards_per_attempt': 'Yards/Attempt',
            'passing_tds': 'Pass TDs',
            'interceptions': 'INTs',
            'rushing_yards_per_game': 'Rush YPG',
            'yards_per_carry': 'Yards/Carry',
            'rushing_tds': 'Rush TDs',
            'sacks_made': 'Sacks',
            'sacks_allowed': 'Sacks Allowed',
            'qb_hits': 'QB Hits',
            'fumble_recoveries': 'Fumble Rec',
            'total_takeaways': 'Total Takeaways',
            'point_diff': 'Point Diff',
            'red_zone_td_pct': 'Red Zone TD %',
            'red_zone_scores': 'Red Zone Scores',
            'red_zone_attempts': 'Red Zone Attempts',
            'receiving_yards_per_game': 'Receiving YPG',
            'receiving_tds': 'Receiving TDs',
            'yards_per_catch': 'Yards/Catch',
            'longest_pass': 'Long Pass',
            'total_yards_per_game': 'Total YPG',
            'passing_ypg': 'Passing YPG',
            'opp_ppg': 'Opp PPG',
            'sacks': 'Sacks'
          };
          
          if (result.toolCallHistory) {
            for (const t of result.toolCallHistory) {
              if (!t.token) continue;
              
              const homeVal = t.homeValue;
              const awayVal = t.awayValue;
              
              // If home/away are objects, flatten each key into its own stat row
              if (typeof homeVal === 'object' && homeVal !== null && 
                  typeof awayVal === 'object' && awayVal !== null) {
                const homeKeys = Object.keys(homeVal).filter(k => isValidValue(k, homeVal[k]));
                const awayKeys = Object.keys(awayVal).filter(k => isValidValue(k, awayVal[k]));
                const allKeys = [...new Set([...homeKeys, ...awayKeys])];
                
                for (const key of allKeys) {
                  const hv = homeVal[key];
                  const av = awayVal[key];
                  
                  // Skip if both are invalid
                  if (!isValidValue(key, hv) && !isValidValue(key, av)) continue;
                  
                  // Create unique key for dedup
                  const statKey = `${key}:${hv}:${av}`;
                  if (seenStatKeys.has(statKey)) continue;
                  seenStatKeys.add(statKey);
                  
                  // Get human-readable name
                  const displayName = statNameMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  
                  statsData.push({
                    name: displayName,
                    token: key.toUpperCase(),
                    home: { team: homeVal.team, [key]: hv ?? 'N/A' },
                    away: { team: awayVal.team, [key]: av ?? 'N/A' }
                  });
                }
              } else {
                // Primitive values - store directly
                if (homeVal === 'N/A' || awayVal === 'N/A') continue;
                
                const statKey = `${t.token}:${homeVal}:${awayVal}`;
                if (seenStatKeys.has(statKey)) continue;
                seenStatKeys.add(statKey);
                
                statsData.push({
                  name: t.token.replace(/_/g, ' '),
                  token: t.token,
                  home: homeVal,
                  away: awayVal
                });
              }
            }
          }
          
          // For NCAAF/NFL: Filter out useless stats that BDL doesn't provide
          if (config.key === 'americanfootball_ncaaf' || config.key === 'americanfootball_nfl') {
            // Remove stats with 0.0 or N/A values (BDL doesn't have this data)
            for (let i = statsData.length - 1; i >= 0; i--) {
              const stat = statsData[i];
              const home = stat.home || {};
              const away = stat.away || {};
              
              // Get values (excluding team name)
              const getVal = (obj) => {
                if (typeof obj !== 'object') return obj;
                const vals = Object.entries(obj).filter(([k]) => k !== 'team').map(([,v]) => v);
                return vals[0]; // First non-team value
              };
              
              const hv = getVal(home);
              const av = getVal(away);
              
              // Remove if both are zero or N/A
              const isZeroOrNA = (v) => v === '0.0' || v === '0' || v === 0 || v === 'N/A' || v === null || v === undefined;
              if (isZeroOrNA(hv) && isZeroOrNA(av)) {
                statsData.splice(i, 1);
              }
            }
          }
          
          // For NCAAB: Filter out stats that BDL doesn't provide for college basketball
          if (config.key === 'basketball_ncaab') {
            // Remove stats with 0.0 net ratings - BDL doesn't have efficiency ratings for NCAAB
            const efficiencyTokens = ['ADJ_EFFICIENCY_MARGIN', 'NET_RATING', 'ADJ_OFFENSIVE_EFF', 'ADJ_DEFENSIVE_EFF'];
            for (let i = statsData.length - 1; i >= 0; i--) {
              const stat = statsData[i];
              if (efficiencyTokens.includes(stat.token)) {
                const home = stat.home || {};
                const away = stat.away || {};
                // Check if net_rating is 0.0 or all values are N/A
                const netRatingZero = home.net_rating === '0.0' || home.net_rating === 0 || 
                                      away.net_rating === '0.0' || away.net_rating === 0;
                const allNA = Object.entries(home).filter(([k]) => k !== 'team').every(([,v]) => v === 'N/A') &&
                             Object.entries(away).filter(([k]) => k !== 'team').every(([,v]) => v === 'N/A');
                if (netRatingZero || allNA) {
                  statsData.splice(i, 1);
                }
              }
              
              // For TURNOVER_RATE and OREB_RATE - remove N/A rate fields, keep only per_game
              if (stat.token === 'TURNOVER_RATE' && stat.home && stat.away) {
                // Remove tov_rate if N/A, keep turnovers_per_game
                if (stat.home.tov_rate === 'N/A') delete stat.home.tov_rate;
                if (stat.away.tov_rate === 'N/A') delete stat.away.tov_rate;
                // Rename token for cleaner display
                stat.name = 'TURNOVERS PER GAME';
              }
              
              if (stat.token === 'OREB_RATE' && stat.home && stat.away) {
                // Remove oreb_rate if N/A, keep oreb_per_game
                if (stat.home.oreb_rate === 'N/A') delete stat.home.oreb_rate;
                if (stat.away.oreb_rate === 'N/A') delete stat.away.oreb_rate;
                // Rename token for cleaner display
                stat.name = 'OFFENSIVE REBOUNDS PER GAME';
              }
              
              // Filter out RECENT_FORM if it has undefined scores (means no completed games)
              if (stat.token === 'RECENT_FORM' && stat.home && stat.away) {
                const hasUndefinedScores = (stat.home.summary && stat.home.summary.includes('undefined-undefined')) ||
                                           (stat.away.summary && stat.away.summary.includes('undefined-undefined'));
                const allTies = (stat.home.last_5 && stat.home.last_5.match(/^T+$/)) ||
                               (stat.away.last_5 && stat.away.last_5.match(/^T+$/));
                if (hasUndefinedScores || allTies) {
                  statsData.splice(i, 1);
                }
              }
            }
          }
          
          // Also keep simple token list for backwards compatibility
          const statsUsed = result.toolCallHistory 
            ? result.toolCallHistory.map(t => t.token) 
            : [];
          
          // Create clean pick object without large/unnecessary fields
          const cleanPick = {
            pick: result.pick,
            type: result.type,
            odds: result.odds,
            confidence: result.confidence,
            homeTeam: result.homeTeam,
            awayTeam: result.awayTeam,
            spread: result.spread,
            spreadOdds: result.spreadOdds,
            moneylineHome: result.moneylineHome,
            moneylineAway: result.moneylineAway,
            total: result.total,
            rationale: result.rationale,
            league: config.name,
            sport: config.key,
            pick_id: `agentic-${config.key}-${game.id || Date.now()}`,
            commence_time: game.commence_time,
            statsUsed: statsUsed, // Token names for backwards compatibility
            statsData: statsData, // Full stat data with values for Tale of the Tape
            injuries: result.injuries || null, // Structured injury data from BDL
            isBeta: config.isBeta || false, // Beta flag for sports with limited data
            dataLimitationNote: config.isBeta
              ? `${config.name} picks use supplemental web-sourced analytics. Confidence may be lower than NBA/NFL.`
              : null
          };
          
          // Add to picks
          sportPicks.push(cleanPick);
        } else if (result.error) {
          console.log(`\n⚠️  Error: ${result.error}`);
        } else {
          console.log(`\n⚠️  No pick generated for this game`);
        }
        
        // Small delay between games
        if (i < finalGames.length - 1) {
          await sleep(2000);
        }
      }
      
      // Store picks for this sport
      if (sportPicks.length > 0) {
        console.log(`\n[${config.name}] Storing ${sportPicks.length} picks...`);
        
        // Filter by confidence (sport-specific threshold, default 0.65)
        const threshold = config.confidenceThreshold || 0.65;
        const qualifiedPicks = sportPicks.filter(p => p.confidence >= threshold);
        console.log(`[${config.name}] ${qualifiedPicks.length} picks meet confidence threshold (>= ${threshold})`);
        
        if (qualifiedPicks.length > 0) {
          await storePicks(qualifiedPicks);
          allPicks.push(...qualifiedPicks);
        }
      }
      
      const sportTime = ((Date.now() - sportStartTime) / 1000).toFixed(1);
      const threshold = config.confidenceThreshold || 0.65;
      summary[config.name] = {
        games: finalGames.length,
        picks: sportPicks.length,
        qualified: sportPicks.filter(p => p.confidence >= threshold).length,
        time: sportTime
      };
      
      console.log(`\n${config.emoji} ${config.name} COMPLETE: ${sportPicks.length} picks in ${sportTime}s`);
      
    } catch (error) {
      console.error(`\n❌ Error processing ${config.name}:`, error.message);
      summary[config.name] = { error: error.message };
    }
  }
  
  // Final summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                       📊 FINAL SUMMARY                           ║
╠══════════════════════════════════════════════════════════════════╣`);
  
  for (const [sport, data] of Object.entries(summary)) {
    if (data.error) {
      console.log(`║  ${sport.padEnd(8)} ❌ Error: ${data.error.slice(0, 40)}`);
    } else {
      console.log(`║  ${sport.padEnd(8)} ${String(data.games).padStart(3)} games → ${String(data.qualified || 0).padStart(2)} qualified picks (${data.time}s)`);
    }
  }
  
  console.log(`╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Total Picks: ${String(allPicks.length).padStart(3)}                                               ║
║  Total Time: ${totalTime.padStart(6)}s                                            ║
║                                                                  ║
║  ✅ Picks are now live in Supabase!                              ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

async function checkExistingPick(league, homeTeam, awayTeam) {
  try {
    // NFL uses weekly table, other sports use daily table
    if (league === 'NFL') {
      const { nflGameAlreadyHasPick } = await import('../src/services/picksService.js');
      if (typeof nflGameAlreadyHasPick === 'function') {
        const result = await nflGameAlreadyHasPick(homeTeam, awayTeam);
        if (result.exists) {
          return result.existingPick;
        }
      }
    } else {
      const { gameAlreadyHasPick } = await import('../src/services/picksService.js');
      if (typeof gameAlreadyHasPick === 'function') {
        const result = await gameAlreadyHasPick(league, homeTeam, awayTeam);
        if (result.exists) {
          return result.existingPick;
        }
      }
    }
  } catch (e) {
    // Function may not exist, continue
  }
  return null;
}

async function storePicks(picks) {
  try {
    // Separate NFL picks (go to weekly table) from other picks (go to daily table)
    const nflPicks = picks.filter(p => p.league === 'NFL');
    const otherPicks = picks.filter(p => p.league !== 'NFL');
    
    // Store NFL picks in weekly table
    if (nflPicks.length > 0) {
      console.log(`🏈 Storing ${nflPicks.length} NFL picks in weekly table...`);
      const nflResult = await picksService.storeWeeklyNFLPicks(nflPicks);
      if (nflResult.success) {
        console.log(`✅ NFL: Stored ${nflResult.count} new picks (${nflResult.total || nflResult.count} total for week)`);
      } else {
        console.error(`⚠️  NFL storage issue:`, nflResult.error || nflResult.message);
      }
    }
    
    // Store other sports in daily table
    if (otherPicks.length > 0) {
      const result = await picksService.storeDailyPicksInDatabase(otherPicks);
      if (result.success) {
        console.log(`✅ Successfully stored ${otherPicks.length} picks in daily table`);
      } else {
        console.error(`⚠️  Storage issue:`, result.error || 'Unknown error');
      }
    }
  } catch (error) {
    console.error(`❌ Error storing picks:`, error.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

