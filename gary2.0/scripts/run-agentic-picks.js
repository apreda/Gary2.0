#!/usr/bin/env node
/**
 * Agentic Pick Generation Script
 * 
 * This script runs Gary's agentic system to generate picks.
 * Usage:
 *   node scripts/run-agentic-picks.js --nba
 *   node scripts/run-agentic-picks.js --nfl
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
  ncaab: { key: 'basketball_ncaab', name: 'NCAAB', emoji: '🏀', maxGames: 10 }, // Limit NCAAB to 10 games
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
  sportsToRun.push('nba', 'nfl', 'nhl', 'ncaab', 'ncaaf');
} else {
  if (args.includes('--nba')) sportsToRun.push('nba');
  if (args.includes('--nfl')) sportsToRun.push('nfl');
  if (args.includes('--nhl')) sportsToRun.push('nhl');
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
      // NFL uses 7 days (weekly), others use 24 hours
      const now = new Date();
      const daysAhead = config.daysAhead || 1;
      const endTime = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
      let games = allGames?.filter(g => {
        const gameTime = new Date(g.commence_time);
        return gameTime >= now && gameTime <= endTime;
      }) || [];
      const timeLabel = daysAhead === 7 ? 'this week' : 'within 24h';
      
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
          console.log(`\n✅ PICK: ${result.pick}`);
          console.log(`   Confidence: ${result.confidence}`);
          console.log(`   Type: ${result.type}`);
          if (result.toolCallHistory) {
            console.log(`   Stats Requested: ${result.toolCallHistory.map(t => t.token).join(', ')}`);
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
          // FILTER OUT stats with N/A values and duplicates - only store real, unique data
          const seenDataKeys = new Set();
          const statsData = result.toolCallHistory 
            ? result.toolCallHistory
                .map(t => ({
                  name: t.token.replace(/_/g, ' '),
                  token: t.token,
                  home: t.homeValue ?? 'N/A',
                  away: t.awayValue ?? 'N/A'
                }))
                .filter(stat => {
                  // Skip if home or away is just 'N/A' string
                  if (stat.home === 'N/A' || stat.away === 'N/A') return false;
                  
                  // Helper to check if a value is valid (not N/A, empty, placeholder, or invalid zero)
                  const isValidValue = (k, v) => {
                    if (k === 'team') return false; // Skip team name
                    if (v === 'N/A' || v === '' || v === null || v === undefined) return false;
                    if (Array.isArray(v) && v.length === 0) return false;
                    if (String(v).includes('Check scout')) return false;
                    // Filter out invalid zero rates (no NBA team has 0.000 FT rate, etc.)
                    if ((k.includes('rate') || k.includes('pct') || k.includes('_pct')) && 
                        (v === '0.000' || v === 0 || v === '0' || v === '0.0' || v === '0.00')) {
                      return false;
                    }
                    return true;
                  };
                  
                  // Skip if home/away objects have all invalid values
                  const hasRealHomeData = typeof stat.home === 'object' && stat.home !== null
                    ? Object.entries(stat.home).some(([k, v]) => isValidValue(k, v))
                    : true; // primitives are fine
                    
                  const hasRealAwayData = typeof stat.away === 'object' && stat.away !== null
                    ? Object.entries(stat.away).some(([k, v]) => isValidValue(k, v))
                    : true; // primitives are fine
                    
                  if (!hasRealHomeData || !hasRealAwayData) return false;
                  
                  // DEDUP: Skip if we've seen identical data (aliases to same fetcher)
                  const dataKey = JSON.stringify({ h: stat.home, a: stat.away });
                  if (seenDataKeys.has(dataKey)) return false;
                  seenDataKeys.add(dataKey);
                  
                  return true;
                })
            : [];
          
          // For NCAAF/NFL: Filter out useless stats and extract derived stats for cleaner display
          if (config.key === 'americanfootball_ncaaf' || config.key === 'americanfootball_nfl') {
            // Remove SP_PLUS_RATINGS for NCAAF - BDL doesn't have this data, it just returns 0.0
            const filteredOutTokens = ['SP_PLUS_RATINGS', 'NET_RATING', 'FEI_RATINGS'];
            for (let i = statsData.length - 1; i >= 0; i--) {
              if (filteredOutTokens.includes(statsData[i].token)) {
                // Check if all values are 0.0 or N/A
                const home = statsData[i].home || {};
                const away = statsData[i].away || {};
                const homeVals = Object.entries(home).filter(([k]) => k !== 'team').map(([,v]) => v);
                const awayVals = Object.entries(away).filter(([k]) => k !== 'team').map(([,v]) => v);
                const allZeroOrNA = [...homeVals, ...awayVals].every(v => 
                  v === '0.0' || v === '0' || v === 0 || v === 'N/A' || v === null
                );
                if (allZeroOrNA) {
                  statsData.splice(i, 1);
                }
              }
            }
            
            const derivedStats = [];
            
            for (const stat of statsData) {
              // From QB_STATS, extract separate rows for Pass TDs and INTs
              if (stat.token === 'QB_STATS' && stat.home && stat.away) {
                if (stat.home.passing_tds && stat.away.passing_tds && 
                    stat.home.passing_tds !== 'N/A' && stat.away.passing_tds !== 'N/A') {
                  derivedStats.push({
                    name: 'PASSING TDS',
                    token: 'PASSING_TDS',
                    home: { team: stat.home.team, passing_tds: stat.home.passing_tds },
                    away: { team: stat.away.team, passing_tds: stat.away.passing_tds }
                  });
                }
                if (stat.home.interceptions && stat.away.interceptions &&
                    stat.home.interceptions !== 'N/A' && stat.away.interceptions !== 'N/A') {
                  derivedStats.push({
                    name: 'INTERCEPTIONS',
                    token: 'INTERCEPTIONS',
                    home: { team: stat.home.team, interceptions: stat.home.interceptions },
                    away: { team: stat.away.team, interceptions: stat.away.interceptions }
                  });
                }
              }
              
              // From OL_RANKINGS or RB_STATS, extract rushing TDs
              if ((stat.token === 'OL_RANKINGS' || stat.token === 'RB_STATS') && stat.home && stat.away) {
                if (stat.home.rushing_tds && stat.away.rushing_tds &&
                    stat.home.rushing_tds !== 'N/A' && stat.away.rushing_tds !== 'N/A') {
                  // Only add if not already added
                  const alreadyHasRushTds = derivedStats.some(s => s.token === 'RUSHING_TDS');
                  if (!alreadyHasRushTds) {
                    derivedStats.push({
                      name: 'RUSHING TDS',
                      token: 'RUSHING_TDS',
                      home: { team: stat.home.team, rushing_tds: stat.home.rushing_tds },
                      away: { team: stat.away.team, rushing_tds: stat.away.rushing_tds }
                    });
                  }
                }
              }
            }
            
            // Add derived stats to statsData
            statsData.push(...derivedStats);
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
              ? 'NHL picks use supplemental web-sourced analytics. Confidence may be lower than NBA/NFL.'
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
        
        // Filter by confidence
        const qualifiedPicks = sportPicks.filter(p => p.confidence >= 0.65);
        console.log(`[${config.name}] ${qualifiedPicks.length} picks meet confidence threshold (>= 0.65)`);
        
        if (qualifiedPicks.length > 0) {
          await storePicks(qualifiedPicks);
          allPicks.push(...qualifiedPicks);
        }
      }
      
      const sportTime = ((Date.now() - sportStartTime) / 1000).toFixed(1);
      summary[config.name] = {
        games: finalGames.length,
        picks: sportPicks.length,
        qualified: sportPicks.filter(p => p.confidence >= 0.65).length,
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

