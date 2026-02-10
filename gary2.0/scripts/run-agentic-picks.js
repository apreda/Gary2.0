#!/usr/bin/env node
/**
 * Agentic Pick Generation Script
 * 
 * This script runs Gary's agentic system to generate picks.
 * Usage:
 *   node scripts/run-agentic-picks.js --nba
 *   node scripts/run-agentic-picks.js --nfl
 *   node scripts/run-agentic-picks.js --nhl
 *   node scripts/run-agentic-picks.js --ncaab
 *   node scripts/run-agentic-picks.js --ncaaf
 *   node scripts/run-agentic-picks.js --all
 */

// MUST load env vars FIRST before any other imports
import '../src/loadEnv.js';

// Now import modules that depend on env vars
const { analyzeGame, buildSystemPrompt } = await import('../src/services/agentic/agenticOrchestrator.js');
const { oddsService } = await import('../src/services/oddsService.js');
const { picksService } = await import('../src/services/picksService.js');
const { getVenueForHomeTeam } = await import('../src/services/venueMapping.js');
const { ballDontLieService } = await import('../src/services/ballDontLieService.js');
const { getConstitution } = await import('../src/services/agentic/constitution/index.js');
// Quantum service removed - not needed
const { fetchSportsbookOdds, formatOddsForStorage } = await import('../src/services/sportsbookOddsService.js');
const { filterNBAPicks, clearFilterCache } = await import('../src/services/nbaPickFilter.js');
const { filterNHLPicks } = await import('../src/services/nhlPickFilter.js');
const { filterNCAABPicks } = await import('../src/services/ncaabPickFilter.js');
// Simple system: Gary picks SPREAD, ML, or PASS.
// ═══════════════════════════════════════════════════════════════════════════
// GARY PICK GENERATION
// ═══════════════════════════════════════════════════════════════════════════

// Configuration
// All US sports use EST-based "today" filtering - games happening today that haven't started yet
const SPORT_CONFIG = {
  nba: { key: 'basketball_nba', name: 'NBA', emoji: '🏀', useToday: true }, // Today's games (EST)
  nfl: { key: 'americanfootball_nfl', name: 'NFL', emoji: '🏈', daysAhead: 7 }, // NFL is weekly
  nhl: { key: 'icehockey_nhl', name: 'NHL', emoji: '🏒', isBeta: true, useToday: true }, // Today's games (EST)
  ncaab: { key: 'basketball_ncaab', name: 'NCAAB', emoji: '🏀', minStats: 8, useToday: true }, // Today's games (EST)
  ncaaf: { key: 'americanfootball_ncaaf', name: 'NCAAF', emoji: '🏈', fbsOnly: true, useToday: true } // Today's games (EST)
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

// NCAAB: Only analyze top 7 conferences + elite teams
// Power 6 + Atlantic 10 have best data, NBA talent, and most reliable betting markets
const NCAAB_ELITE_CONFERENCE_IDS = [
  1,   // ACC
  5,   // Atlantic 10 (A-10)
  6,   // Big 12
  7,   // Big East
  10,  // Big Ten
  24,  // SEC
  33,  // Pac-12
];

// Elite teams outside top 7 conferences to KEEP (by team name substring)
const NCAAB_ELITE_TEAM_NAMES = [
  'memphis', 'uconn', 'connecticut',
  'san diego state', 'nevada', 'new mexico', 'boise state', // Mountain West elites
  'drake', 'indiana state', // MVC elites
];

// ═══════════════════════════════════════════════════════════════════════════
// PICK LOGGING & TRANSPARENCY
// ═══════════════════════════════════════════════════════════════════════════
// 
// Gary evaluates the full slate and decides PASS vs PICK.
// We do not filter by confidence or apply hard rules here.
// This section only provides transparency tags (e.g., rest, injuries, traps).
// ═══════════════════════════════════════════════════════════════════════════

// Long-term injury keywords for context only (market may already price these in).
// Gary should still investigate if the absence changes tonight's matchup.
const LONG_TERM_INJURY_KEYWORDS = [
  'out for season', 'season-ending', 'out indefinitely', 'out all year',
  'ruled out for 2025', 'not expected to return', 'out for the year'
];

/**
 * Detect if a pick has a "trap" situation (for logging/awareness only; NOT a filter)
 * Returns { isTrap: boolean, trapReason: string | null }
 */
function detectTrapSituation(pick, sportName) {
  const factors = pick.supporting_factors || [];
  const contradictions = pick.contradicting_factors?.major || [];
  const allFactors = [...factors, ...contradictions].map(f => f.toLowerCase());
  
  // Detect back-to-back
  const isBackToBack = allFactors.some(f => 
    f.includes('back_to_back') || f.includes('b2b') || f.includes('back-to-back')
  );
  
  // Detect road favorite
  const isRoadFavorite = allFactors.some(f => 
    f.includes('road_favorite') || f.includes('away_favorite')
  );
  
  // Extract spread from pick
  const spreadMatch = pick.pick?.match(/([+-]?\d+\.?\d*)\s*[+-]\d+$/);
  const spreadValue = spreadMatch ? parseFloat(spreadMatch[1]) : 0;
  const isBigSpread = spreadValue < -5; // Laying more than 5 points
  
  // TRAP: Back-to-back + road favorite + big spread
  if (isBackToBack && isRoadFavorite && isBigSpread) {
    return { 
      isTrap: true, 
      trapReason: `B2B road favorite laying ${Math.abs(spreadValue)} points` 
    };
  }
  
  return { isTrap: false, trapReason: null };
}

/**
 * Identify likely long-term injuries for context.
 * Not a hard rule — use for investigation, not auto-ignore.
 */
function isLongTermInjury(injuryDescription) {
  if (!injuryDescription) return false;
  const lower = injuryDescription.toLowerCase();
  return LONG_TERM_INJURY_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Extract binary flags from pick for transparency
 */
function extractBinaryFlags(pick) {
  const factors = pick.supporting_factors || [];
  const contradictions = pick.contradicting_factors?.major || [];
  const allFactors = [...factors, ...contradictions].map(f => f.toLowerCase());
  
  return {
    rest_advantage: allFactors.some(f => 
      f.includes('rest_advantage') || f.includes('well_rested') || f.includes('rest_edge')
    ),
    back_to_back_disadvantage: allFactors.some(f => 
      f.includes('back_to_back') || f.includes('b2b') || f.includes('fatigue')
    ),
    injury_edge: allFactors.some(f => 
      f.includes('injury') && (f.includes('edge') || f.includes('advantage') || f.includes('out'))
    ),
    home_court: allFactors.some(f => 
      f.includes('home_court') || f.includes('home_advantage')
    ),
    efficiency_edge: allFactors.some(f => 
      f.includes('efficiency') || f.includes('net_rating') || f.includes('offensive_rating') || f.includes('corsi') || f.includes('xgf')
    ),
    goalie_edge: allFactors.some(f =>
      f.includes('goalie') || f.includes('gsax') || f.includes('save_pct')
    )
  };
}

// ═══════════════════════════════════════════════════════════════════════════

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

function getArgValue(flag) {
  // Supports: --flag value  |  --flag=value
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const next = args[idx + 1];
  if (!next || next.startsWith('--')) return undefined;
  return next;
}

function parseBoolish(val, defaultValue = true) {
  if (val === undefined || val === null) return defaultValue;
  const v = String(val).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return defaultValue;
}

const shouldStore = parseBoolish(getArgValue('--store'), true);

// --matchup flag to run a single specific game (e.g., "Bengals @ Dolphins" or "Cincinnati")
const matchupFilter = getArgValue('--matchup');
// --force flag to skip deduplication check (for re-running specific games)
const forceRerun = args.includes('--force');
// --date flag to filter games to specific date(s) (e.g., "2025-12-25" or "2025-12-25,2025-12-26")
const dateFilter = getArgValue('--date');
// --dynamic flag to enable dynamic slate review (organic pick selection based on board quality)
const useDynamicSlateReview = args.includes('--dynamic');
// --test flag to store picks in test_daily_picks table instead of production (for testing)
const useTestTable = args.includes('--test');
// --test-name flag to label the test run (e.g., "Sharp Betting Reference Test")
const testName = getArgValue('--test-name');
// --limit flag to limit number of games to analyze (useful for testing)
const gameLimit = parseInt(getArgValue('--limit'), 10) || null;
// --time flag to filter games by start time in EST (e.g., "12" for 12pm, "12,1" for 12pm and 1pm)
const timeFilter = getArgValue('--time');

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
║  Advanced options:                                               ║
║    --date 2025-12-25           (filter to specific date)         ║
║    --date 2025-12-25,2025-12-26 (multiple dates)                 ║
║    --time 12                   (filter to 12pm EST games)        ║
║    --time 12,13                (filter to 12pm and 1pm EST)      ║
║    --limit 5                   (limit to N games)                ║
║    --force                     (skip deduplication)              ║
║    --store false               (analyze only, don't save)        ║
║    --test                      (store to test_daily_picks table) ║
║    --test-name "My Test"       (label the test run)              ║
║    --matchup "Chicago"         (run single game only)            ║
║    --fresh                     (clear cache for fresh data)      ║
║                                                                  ║
║  Gary's Pick System:                                             ║
║    - SPREAD or MONEYLINE = picks stored                          ║
║    - PASS = skip game (no pick stored)                           ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);
  process.exit(0);
}

// Check environment variables
function checkEnv() {
  const checks = [
    { name: 'GEMINI_API_KEY', alts: [] },  // Gemini 3 Deep Think (replaced OpenAI)
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

  // Clear cache if --nocache or --fresh flag is passed (ensures fresh injury/lineup data)
  if (process.argv.includes('--nocache') || process.argv.includes('--fresh')) {
    console.log('🔄 Clearing all caches for fresh injury/lineup data...');
    ballDontLieService.clearCache();
    console.log('✅ Cache cleared - fetching fresh data from APIs\n');
  }

  const startTime = Date.now();
  const allPicks = [];
  const summary = {};

  for (const sportShort of sportsToRun) {
    const config = SPORT_CONFIG[sportShort];
    const sportStartTime = Date.now();

    // Clear NBA filter cache at start of each NBA run
    if (config.name === 'NBA') {
      clearFilterCache();
    }

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

      // NFL: Filter to current NFL week or playoffs
      if (config.key === 'americanfootball_nfl') {
        const currentWeekNumber = picksService.getNFLWeekNumber();
        const currentWeekStart = picksService.getNFLWeekStart();

        // Detect if we're in playoffs based on DATE (Odds API doesn't have postseason flag)
        // NFL playoffs: Wild Card (early Jan), Divisional (mid Jan), Championship (late Jan), Super Bowl (early Feb)
        // Regular season ends around Week 18 (typically first week of January)
        const month = now.getMonth() + 1; // 1-indexed
        const day = now.getDate();
        const isPlayoffPeriod = (month === 1 && day >= 10) || (month === 2 && day <= 15);
        const hasPlayoffGames = isPlayoffPeriod;

        if (isPlayoffPeriod) {
          console.log(`[${config.name}] Date check: ${month}/${day} - NFL Playoffs period detected`);
        }

        // CHECK: If --date flag is provided, filter to specific date(s) ONLY
        if (dateFilter) {
          // Parse comma-separated dates (e.g., "2025-12-25,2025-12-26")
          const targetDates = dateFilter.split(',').map(d => d.trim());
          console.log(`[${config.name}] --date filter active: targeting ${targetDates.join(', ')}`);

          games = allGames?.filter(g => {
            const gameTime = new Date(g.commence_time);
            const gameDateEST = gameTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
            // Game date matches one of the target dates
            return targetDates.includes(gameDateEST);
          }) || [];

          timeLabel = `${targetDates.join(' & ')}`;
          console.log(`[${config.name}] Date filter: found ${games.length} games on ${targetDates.join(', ')}`);
        } else if (hasPlayoffGames) {
          // PLAYOFFS: Use simple rolling window instead of week-based filtering
          // Playoffs have irregular schedules (Wild Card weekend = Sat+Sun, Divisional = Sat+Sun, etc.)
          console.log(`[${config.name}] 🏈 PLAYOFFS DETECTED - using rolling window filter`);

          // Get all games within next 48 hours that haven't started
          const windowMs = 48 * 60 * 60 * 1000; // 48 hours
          games = allGames?.filter(g => {
            const gameTime = new Date(g.commence_time);
            return gameTime > now && gameTime <= new Date(now.getTime() + windowMs);
          }) || [];

          // Determine playoff round based on date (already have month/day from above)
          let playoffRound = 'Playoffs';
          if (month === 1) {
            if (day >= 10 && day <= 16) playoffRound = 'Wild Card';
            else if (day >= 17 && day <= 23) playoffRound = 'Divisional';
            else if (day >= 24 && day <= 31) playoffRound = 'Conference Championship';
          } else if (month === 2) {
            if (day <= 7) playoffRound = 'Conference Championship';
            else if (day <= 15) playoffRound = 'Super Bowl';
          }

          timeLabel = `NFL ${playoffRound}`;
          console.log(`[${config.name}] NFL ${playoffRound}: found ${games.length} games in next 48h`);
        } else {
          // REGULAR SEASON: Default NFL week-based filtering
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
        }
      } else if (config.useToday) {
        // CHECK: If --date flag is provided, filter to specific date(s) instead of today
        if (dateFilter) {
          const targetDates = dateFilter.split(',').map(d => d.trim());
          console.log(`[${config.name}] --date filter active: targeting ${targetDates.join(', ')}`);
          
          games = allGames?.filter(g => {
            const gameTime = new Date(g.commence_time);
            const gameDateEST = gameTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
            // Game date matches one of the target dates
            return targetDates.includes(gameDateEST);
          }) || [];
          
          timeLabel = `${targetDates.join(' & ')}`;
          console.log(`[${config.name}] Date filter: found ${games.length} games on ${targetDates.join(', ')}`);
        } else {
          // Default: Get TODAY's games in EST timezone
          const todayEST = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD format

          // BDL FIX: BDL often returns dates without proper times (midnight UTC = 7 PM EST yesterday)
          // For NCAAB and NHL, trust the DATE from BDL and include ALL games for today
          // Don't filter by "hasn't started yet" because BDL commence_times are unreliable
          const isNCAAB = config.key === 'basketball_ncaab';
          const isNHL = config.key === 'icehockey_nhl';

          games = allGames?.filter(g => {
            const gameTime = new Date(g.commence_time);
            const gameDateEST = gameTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

            if (isNCAAB || isNHL) {
              // For NCAAB/NHL: Include ALL games for today's EST date, regardless of time
              // Skip "hasn't started" check since BDL times can be unreliable
              return gameDateEST === todayEST;
            } else {
              // For other sports: Game is today in EST AND hasn't started yet
              return gameDateEST === todayEST && gameTime >= now;
            }
          }) || [];

          timeLabel = `today (${todayEST})`;
          console.log(`[${config.name}] EST date filter: today=${todayEST}, found ${games.length} ${isNCAAB ? 'games' : 'upcoming games'}`);
        }
      } else if (config.daysAhead) {
        // Weekly sports: Use days ahead
        const endTime = new Date(now.getTime() + config.daysAhead * 24 * 60 * 60 * 1000);
        games = allGames?.filter(g => {
          const gameTime = new Date(g.commence_time);
          return gameTime >= now && gameTime <= endTime;
        }) || [];
        timeLabel = 'this week';
      } else {
        // Fallback: all upcoming games
        games = allGames?.filter(g => new Date(g.commence_time) >= now) || [];
        timeLabel = 'upcoming';
      }

      // NFL: Enrich games with playoff round significance (Wild Card, Divisional, Championship, Super Bowl)
      if (config.key === 'americanfootball_nfl' && games.length > 0) {
        try {
          console.log(`[${config.name}] Checking for postseason games via BDL...`);
          const bdlGames = await ballDontLieService.getGames('americanfootball_nfl', {
            postseason: true,
            seasons: [new Date().getMonth() <= 2 ? new Date().getFullYear() - 1 : new Date().getFullYear()],
            per_page: 100
          });
          
          if (bdlGames && bdlGames.length > 0) {
            // Create a map of BDL games by team matchup for quick lookup
            const bdlGameMap = new Map();
            for (const g of bdlGames) {
              const homeKey = g.home_team?.full_name?.toLowerCase() || g.home_team?.name?.toLowerCase() || '';
              const awayKey = g.visitor_team?.full_name?.toLowerCase() || g.visitor_team?.name?.toLowerCase() || '';
              const key = `${homeKey}:${awayKey}`;
              bdlGameMap.set(key, g);
            }
            
            // Map postseason week to significance
            const weekToSignificance = {
              1: 'Wild Card',
              2: 'Divisional Round',
              3: 'Conference Championship',
              4: 'Super Bowl'
            };
            
            // Enrich each game with gameSignificance
            for (const game of games) {
              const homeKey = game.home_team?.toLowerCase() || '';
              const awayKey = game.away_team?.toLowerCase() || '';
              const key = `${homeKey}:${awayKey}`;
              
              const bdlGame = bdlGameMap.get(key);
              if (bdlGame && bdlGame.postseason && bdlGame.week) {
                game.gameSignificance = weekToSignificance[bdlGame.week] || 'Playoff';
                console.log(`[${config.name}] ✓ ${game.away_team} @ ${game.home_team}: ${game.gameSignificance}`);
              }
            }
          }
        } catch (err) {
          console.warn(`[${config.name}] Could not fetch postseason data from BDL:`, err.message);
        }
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

      // NCAAB: Filter to TOP 7 conferences only (Power 6 + WCC for Gonzaga)
      // BOTH teams must be from an approved conference
      // Top 7: ACC, Big Ten, Big 12, SEC, Big East, WCC (Gonzaga), AAC
      if (config.key === 'basketball_ncaab') {
        console.log(`[${config.name}] Filtering to Top 7 conferences only (Power 6 + WCC)...`);
        const { ballDontLieService } = await import('../src/services/ballDontLieService.js');
        const MIN_GAMES_FOR_ANALYSIS = 5;

        // TOP 7 conference IDs from BDL (BOTH teams must be from one of these)
        // Verified via BDL API:
        //   1  = ACC (Duke, UNC, etc.)
        //   4  = AAC (Memphis, Tulane, etc.)
        //   6  = Big 12 (Kansas, Houston, etc.)
        //   7  = Big East (Villanova, UConn, etc.)
        //   10 = Big Ten (Michigan, Purdue, etc.)
        //   24 = SEC (Kentucky, Auburn, etc.)
        //   31 = WCC (Gonzaga, Saint Mary's, etc.)
        // 
        // REMOVED from previous Top 10:
        //   5  = A-10 (Dayton, VCU) - good mid-major but not elite
        //   20 = Mountain West (San Diego State) - solid but outside top 7
        const APPROVED_CONFERENCE_IDS = new Set([
          1,   // ACC
          4,   // AAC
          6,   // Big 12
          7,   // Big East
          10,  // Big Ten
          24,  // SEC
          // WCC removed — only Gonzaga/Saint Mary's are relevant, handled via APPROVED_TEAM_NAMES
        ]);

        // Elite teams from non-approved conferences that should still get picks
        const APPROVED_TEAM_NAMES = new Set([
          'gonzaga bulldogs',
          "saint mary's gaels",
        ]);

        // Conference ID to name mapping for logging and storage
        const CONF_ID_NAMES = {
          1: 'ACC', 4: 'AAC', 6: 'Big 12', 7: 'Big East',
          10: 'Big Ten', 24: 'SEC', 31: 'WCC', 33: 'Pac-12'
        };

        const isApprovedConference = (confId) => {
          return APPROVED_CONFERENCE_IDS.has(confId);
        };

        const getConfName = (confId) => {
          return CONF_ID_NAMES[confId] || `Conf-${confId}`;
        };

        const beforeCount = games.length;
        const filteredGames = [];
        const skippedGames = [];
        const skippedNonApproved = [];

        // Pre-fetch all teams once to optimize lookup
        const ncaabTeams = await ballDontLieService.getTeams('basketball_ncaab');
        const normalize = (name) => name?.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

        const teamMap = new Map();
        ncaabTeams.forEach(t => {
          if (t.full_name) teamMap.set(normalize(t.full_name), t);
          if (t.name) teamMap.set(normalize(t.name), t);
        });

        // Helper to find team by name using the map
        const findTeam = (name) => {
          const norm = normalize(name);
          if (teamMap.has(norm)) return teamMap.get(norm);
          // Try fuzzy match
          for (const [key, team] of teamMap.entries()) {
            if (key.includes(norm) || norm.includes(key)) return team;
          }
          return null;
        };

        const season = now.getMonth() + 1 <= 4 ? now.getFullYear() - 1 : now.getFullYear();
        console.log(`[${config.name}] Pre-processing ${games.length} games...`);

        for (const game of games) {
          try {
            // Get teams from pre-fetched map
            const homeTeam = findTeam(game.home_team);
            const awayTeam = findTeam(game.away_team);

            if (!homeTeam || !awayTeam) {
              skippedGames.push({ game, reason: 'Team not found in database' });
              continue;
            }

            const homeConfId = homeTeam.conference_id;
            const awayConfId = awayTeam.conference_id;

            // Attach conference names to game EARLY (before any validation)
            // This ensures conference data is always available for storage
            game.homeConference = getConfName(homeConfId);
            game.awayConference = getConfName(awayConfId);

            // AT LEAST ONE team must be from an approved conference OR be a named elite team
            const homeApproved = isApprovedConference(homeConfId) || APPROVED_TEAM_NAMES.has(normalize(game.home_team));
            const awayApproved = isApprovedConference(awayConfId) || APPROVED_TEAM_NAMES.has(normalize(game.away_team));

            if (!homeApproved && !awayApproved) {
              // Neither team is in Top 7 - skip
              skippedNonApproved.push({
                game,
                reason: `Neither in Top 7: ${game.home_team} (${getConfName(homeConfId)}), ${game.away_team} (${getConfName(awayConfId)})`
              });
              continue;
            }

            // Check season stats for both teams
            const [homeStats, awayStats] = await Promise.all([
              ballDontLieService.getTeamSeasonStats('basketball_ncaab', { teamId: homeTeam.id, season }),
              ballDontLieService.getTeamSeasonStats('basketball_ncaab', { teamId: awayTeam.id, season })
            ]);

            // Extract stats
            const h = homeStats?.[0] || {};
            const a = awayStats?.[0] || {};

            const homeGames = h.games_played || 0;
            const awayGames = a.games_played || 0;
            const homePts = h.pts || 0;
            const awayPts = a.pts || 0;
            const homeFgPct = h.fg_pct || 0;
            const awayFgPct = a.fg_pct || 0;

            const homeHasData = homeGames >= MIN_GAMES_FOR_ANALYSIS && homePts > 40 && homeFgPct > 30;
            const awayHasData = awayGames >= MIN_GAMES_FOR_ANALYSIS && awayPts > 40 && awayFgPct > 30;

            if (homeHasData && awayHasData) {
              // Conference already attached above - just push to filtered games
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
            console.warn(`[${config.name}] Could not verify data for ${game.away_team} @ ${game.home_team}: ${err.message}`);
            filteredGames.push(game);
          }
        }

        games = filteredGames;

        // Log conference filter results
        if (skippedNonApproved.length > 0) {
          console.log(`[${config.name}] 🚫 Skipped ${skippedNonApproved.length} games outside Top 7 conferences:`);
          skippedNonApproved.slice(0, 5).forEach(({ game, reason }) => {
            console.log(`   - ${game.away_team} @ ${game.home_team}: ${reason}`);
          });
          if (skippedNonApproved.length > 5) {
            console.log(`   ... and ${skippedNonApproved.length - 5} more`);
          }
        }

        if (skippedGames.length > 0) {
          console.log(`[${config.name}] ⚠️ Skipped ${skippedGames.length} games with insufficient data:`);
          skippedGames.slice(0, 5).forEach(({ game, reason }) => {
            console.log(`   - ${game.away_team} @ ${game.home_team}: ${reason}`);
          });
          if (skippedGames.length > 5) {
            console.log(`   ... and ${skippedGames.length - 5} more`);
          }
        }
        console.log(`[${config.name}] Top 7 conference + data quality filter: ${beforeCount} → ${games.length} games`);
        
        // DEBUG: Check if UCLA made it through
        const uclaInFiltered = games.find(g => 
          g.home_team?.toLowerCase().includes('ucla') || 
          g.away_team?.toLowerCase().includes('ucla')
        );
        console.log(`[${config.name}] 🔍 DEBUG: UCLA in filtered games: ${uclaInFiltered ? 'YES ✅' : 'NO ❌'}`);
        if (uclaInFiltered) {
          const idx = games.indexOf(uclaInFiltered);
          console.log(`[${config.name}] 🔍 DEBUG: UCLA game position: #${idx + 1} of ${games.length}`);
        }

        // NOTE: Extreme spread filter REMOVED per user request
        // All Top 7 conference games are now processed regardless of spread size
      }

      // Apply --matchup filter to run a single specific game
      if (matchupFilter) {
        const filterLower = matchupFilter.toLowerCase();
        const beforeMatchupFilter = games.length;
        games = games.filter(game => {
          const homeTeam = (game.home_team || '').toLowerCase();
          const awayTeam = (game.away_team || '').toLowerCase();
          // Match if filter appears in either team name
          return homeTeam.includes(filterLower) || awayTeam.includes(filterLower);
        });
        console.log(`[${config.name}] Matchup filter "${matchupFilter}": ${beforeMatchupFilter} -> ${games.length} games`);
        if (games.length === 0) {
          console.log(`[${config.name}] No games found matching "${matchupFilter}"`);
        }
      }

      // Apply --time filter to filter games by start time in EST (e.g., "12" for 12pm, "12,1" for 12pm and 1pm)
      if (timeFilter) {
        const targetHours = timeFilter.split(',').map(h => parseInt(h.trim(), 10));
        const beforeTimeFilter = games.length;
        games = games.filter(game => {
          const gameTime = new Date(game.commence_time);
          // Convert to EST hour (12-hour format for easier matching)
          const estHour = parseInt(gameTime.toLocaleString('en-US', { 
            timeZone: 'America/New_York', 
            hour: 'numeric', 
            hour12: false 
          }), 10);
          // Match if game hour matches any of the target hours
          return targetHours.includes(estHour);
        });
        const hoursDisplay = targetHours.map(h => `${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`).join(', ');
        console.log(`[${config.name}] Time filter (${hoursDisplay} EST): ${beforeTimeFilter} -> ${games.length} games`);
        if (games.length > 0) {
          games.forEach(g => {
            const gameTime = new Date(g.commence_time);
            const estTimeStr = gameTime.toLocaleString('en-US', { 
              timeZone: 'America/New_York', 
              hour: 'numeric', 
              minute: '2-digit',
              hour12: true 
            });
            console.log(`   - ${g.away_team} @ ${g.home_team} (${estTimeStr} EST)`);
          });
        }
      }

      // Apply max games limit if specified (for NCAAB which can have 70+ games)
      // --limit flag overrides config.maxGames for testing
      const MAX_GAMES = gameLimit || config.maxGames || 100;
      const limitedGames = games.slice(0, MAX_GAMES);

      const limitNote = gameLimit ? ` (--limit ${gameLimit})` : (games.length > MAX_GAMES ? ` (limited to ${MAX_GAMES})` : '');
      console.log(`[${config.name}] Found ${allGames?.length || 0} total games, ${games.length} ${timeLabel}${limitNote}`);

      // Replace games with limited version
      const finalGames = limitedGames;

      if (!finalGames || finalGames.length === 0) {
        console.log(`[${config.name}] No games found for today.`);
        summary[config.name] = { games: 0, picks: 0, time: 0 };
        continue;
      }

      console.log(`[${config.name}] Found ${finalGames.length} games\n`);

      // ═══════════════════════════════════════════════════════════════
      // TRUE MEMORY SESSION: Gary maintains memory across all games
      // ═══════════════════════════════════════════════════════════════
      // Create a session that persists Gary's analysis memory across games.
      // This enables organic ranking based on true conviction rather than
      // re-reading summaries of his own picks.
      // ═══════════════════════════════════════════════════════════════
      
      // Build system prompt for this sport
      let constitution = getConstitution(config.key);
      const today = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      constitution = constitution.replace(/{{CURRENT_DATE}}/g, today);
      const systemPrompt = buildSystemPrompt(constitution, config.key);
      
      console.log(`[${config.name}] 🎯 Processing ${finalGames.length} games`);

      // Process each game
      const sportPicks = [];
      let picksGenerated = 0;
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

        // Skip deduplication checks if --force flag is set (for re-running specific games)
        if (!forceRerun) {
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
        } else {
          console.log(`🔄 Force re-run enabled - skipping deduplication for "${gameKey}"`);
        }

        // Mark as being processed BEFORE we start (prevents race condition)
        processedGamesThisSession.add(gameKey);

        // Fetch sportsbook odds BEFORE analysis so Gary sees available lines
        let preSportsbookOdds = null;
        try {
          const preGameId = game.id || game.bdl_game_id;
          if (preGameId) {
            console.log(`   Fetching sportsbook odds comparison (pre-analysis)...`);
            preSportsbookOdds = await fetchSportsbookOdds(config.key, preGameId, game.home_team, game.away_team);
            if (preSportsbookOdds?.length > 0) {
              console.log(`   Found odds from ${preSportsbookOdds.length} sportsbooks`);
            }
          }
        } catch (oddsPreErr) {
          console.log(`   Could not fetch pre-analysis sportsbook odds: ${oddsPreErr.message}`);
        }

        // Run agentic analysis (each game is independent)
        const runnerOptions = {
          nocache: process.argv.includes('--nocache'),
          sportsbookOdds: preSportsbookOdds // Pass multi-book odds for scout report
        };
        let result;
        try {
          result = await analyzeGame(game, config.key, runnerOptions);
        } catch (err) {
          if (err.message?.includes('USER_ABORTED') || err.message?.includes('aborted')) {
            console.log(`\n⚠️  Request aborted for ${game.away_team} @ ${game.home_team}. Skipping...`);
            continue;
          }
          throw err; // Re-throw other errors
        }

        if (result && !result.error && result.pick) {
          // Check minimum stats requirement (for NCAAB especially)
          // Use UNIQUE stats count (not duplicates across iterations)
          const allTokens = result.toolCallHistory?.map(t => t.token) || [];
          const uniqueTokens = [...new Set(allTokens)];
          const statsCount = uniqueTokens.length;
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
              console.log(`   Reason: Too many zero/missing stats (${zeroStatCount}/${totalCheckedStats} = ${(zeroRatio * 100).toFixed(0)}%)`);
              console.log(`   Bad stats: ${badStats.slice(0, 5).join(', ')}${badStats.length > 5 ? '...' : ''}`);
              continue;
            }
          }

          console.log(`\n✅ PICK: ${result.pick}`);
          console.log(`   Type: ${result.type}`);
          if (result.toolCallHistory) {
            // Show UNIQUE stats only (not duplicates)
            console.log(`   Stats Requested (${statsCount} unique): ${uniqueTokens.join(', ')}`);
            
            // 📊 INVESTIGATION AUDIT - Show what Gary actually investigated
            // Filter out undefined/empty tokens
            const tokens = result.toolCallHistory.map(t => t.token).filter(t => t);
            // Count player stats: tokens containing PLAYER_, _PLAYER, GAME_LOGS, or specific player stat patterns
            const playerStatsCount = tokens.filter(t => 
              t && (t.includes('PLAYER_') || 
              t.includes('_PLAYER') || 
              t.includes('GAME_LOGS') ||
              t.match(/^(NBA|NFL|NHL|NCAAB|NCAAF)_PLAYER_STATS/))
            ).length;
            const teamStatsCount = tokens.filter(t => 
              t && !t.includes('PLAYER_') && 
              !t.includes('_PLAYER') && 
              !t.includes('GAME_LOGS') &&
              !t.match(/^(NBA|NFL|NHL|NCAAB|NCAAF)_PLAYER_STATS/)
            ).length;
            
            // Check key investigation areas
            const investigatedAreas = {
              homeAwaySplits: tokens.some(t => t && (t.includes('HOME_AWAY') || t.includes('SPLITS'))),
              recentForm: tokens.some(t => t && (t.includes('RECENT_FORM') || t.includes('LAST_'))),
              h2hHistory: tokens.some(t => t && t.includes('H2H')),
              pace: tokens.some(t => t && t.includes('PACE')),
              efficiency: tokens.some(t => t && (t.includes('RATING') || t.includes('EFG'))),
              clutchStats: tokens.some(t => t && t.includes('CLUTCH')),
              benchDepth: tokens.some(t => t && t.includes('BENCH')),
              playerLogs: playerStatsCount > 0
            };
            
            const coveredCount = Object.values(investigatedAreas).filter(v => v).length;
            const totalAreas = Object.keys(investigatedAreas).length;
            
            console.log(`\n📊 INVESTIGATION AUDIT:`);
            console.log(`   Team Stats: ${teamStatsCount} | Player Stats: ${playerStatsCount}`);
            console.log(`   Coverage: ${coveredCount}/${totalAreas} key areas`);
            console.log(`   Areas: ${Object.entries(investigatedAreas).map(([k, v]) => `${v ? '✓' : '✗'}${k.replace(/([A-Z])/g, ' $1').trim()}`).join(' | ')}`);
          }
          // Log full rationale (no truncation - Gary is guided to keep it ~250-350 words)
          const rationale = result.rationale || result.analysis || '';
          if (rationale) {
            console.log(`\n📝 RATIONALE:\n${rationale}\n`);
          } else if (result.rawAnalysis) {
            // Extract rationale from raw response if not parsed
            const raw = result.rawAnalysis;
            const rationaleMatch = raw.match(/"rationale"\s*:\s*"([^"]+)"/s);
            if (rationaleMatch) {
              console.log(`\n📝 RATIONALE:\n${rationaleMatch[1]}\n`);
            }
          }

          // Extract stat data with values for structured Tale of the Tape display
          // NOTE: iOS expects statsData rows to be keyed by the STAT TOKEN (e.g. TURNOVER_RATE),
          // and will only render values it can decode for that token. For NCAAB we keep 1 row per
          // token so the iOS app can show the full set Gary requested.
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
            // Football (NFL/NCAAF)
            'yards_per_game': 'Total YPG',
            'yards_per_play': 'Yards/Play',
            'points_per_game': 'PPG',
            'opp_yards_per_game': 'Opp Yards/Game',
            'opp_points_per_game': 'Opp PPG',
            'opp_ppg': 'Opp PPG',
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
            'rushing_ypg': 'Rush YPG',
            'total_ypg': 'Total YPG',
            'total_tds': 'Total TDs',
            'opp_passing_yards': 'Opp Pass Yds',
            'opp_rushing_yards': 'Opp Rush Yds',
            'opp_total_yards': 'Opp Total Yds',
            'total_yards': 'Total Yards',
            'passing_yards': 'Pass Yards',
            'rushing_yards': 'Rush Yards',
            'passing_ints': 'Pass INTs',
            'interceptions_thrown': 'INTs Thrown',
            'sacks': 'Sacks',
            
            // NHL - Special Teams
            'pp_pct': 'Power Play %',
            'pk_pct': 'Penalty Kill %',
            'pp_opportunities': 'PP Ops',
            'ppPct': 'Power Play %',
            'pkPct': 'Penalty Kill %',
            
            // NHL - Advanced Analytics
            'corsi_for_pct': 'Corsi For %',
            'expected_goals_for_pct': 'xG For %',
            'xg_for_pct': 'xG For %',
            'cf_pct': 'Corsi For %',
            'xgf_pct': 'xG For %',
            'high_danger_pct': 'High Danger %',
            'high_danger_chances_for_pct': 'HD Chances %',
            'pdo': 'PDO',
            
            // NHL - Goalie Stats
            'save_pct': 'Save %',
            'gsax': 'GSAX',
            'gaa': 'GAA',
            'starter': 'Starting Goalie',
            'record': 'Goalie Record',
            
            // NHL - Shots & Goals
            'shots_for_pg': 'Shots For/G',
            'shots_against_pg': 'Shots Against/G',
            'goals_for_pg': 'Goals For/G',
            'goals_against_pg': 'Goals Against/G',
            'shot_diff': 'Shot Diff',
            'shotsForPerGame': 'Shots For/G',
            'shotsAgainstPerGame': 'Shots Against/G',
            'goalsForPerGame': 'Goals For/G',
            'goalsAgainstPerGame': 'Goals Against/G',
            
            // NHL - Rest & Form
            'daysSinceLastGame': 'Days Rest',
            'isBackToBack': 'Back-to-Back',
            'gamesLast7Days': 'Games Last 7D',
            'goalsPerGame': 'Goals/Game',
            'goalsAgainstPerGame': 'GA/Game',
            'last5': 'Last 5',
            'last10': 'Last 10',
            
            // NHL - League Ranks
            'pp_rank': 'PP Rank',
            'pk_rank': 'PK Rank',
            'gf_rank': 'GF Rank',
            'ga_rank': 'GA Rank',
            'goals_for_rank': 'GF Rank',
            'goals_against_rank': 'GA Rank',
            
            // NCAAB
            'kenpom_rank': 'KenPom Rank',
            'adj_em': 'AdjEM',
            'adj_offense': 'AdjO',
            'adj_defense': 'AdjD',
            'net_rank': 'NET Rank',
            'net_ranking': 'NET Rank',
            'offensive_rating': 'Off Rating',
            'defensive_rating': 'Def Rating',
            'conference_record': 'Conf Record',
            'conference_win_pct': 'Conf Win %',
            'tempo': 'Tempo',
            
            // Weather
            'temperature': 'Temperature',
            'feels_like': 'Feels Like',
            'wind_speed': 'Wind Speed',
            'conditions': 'Conditions',
            'impact': 'Weather Impact'
          };

          // Normalize stat keys for dedup (e.g., opp_ppg and opp_points_per_game are the same)
          const normalizeKey = (key) => {
            const lower = key.toLowerCase();
            // Map common variations to canonical forms
            if (lower === 'opp_ppg' || lower === 'opp_points_per_game') return 'opp_ppg';
            if (lower === 'ppg' || lower === 'points_per_game') return 'ppg';
            if (lower === 'total_ypg' || lower === 'yards_per_game' || lower === 'total_yards_per_game' || lower === 'ypg') return 'ypg';
            if (lower === 'opp_ypg' || lower === 'opp_yards_per_game' || lower === 'opp_total_yards') return 'opp_ypg';
            if (lower === 'pass_tds' || lower === 'passing_tds' || lower === 'passing_touchdowns') return 'pass_tds';
            if (lower === 'rush_tds' || lower === 'rushing_tds' || lower === 'rushing_touchdowns') return 'rush_tds';
            if (lower === 'ints' || lower === 'interceptions' || lower === 'interceptions_thrown' || lower === 'passing_interceptions') return 'ints';
            if (lower === 'recv_ypg' || lower === 'receiving_yards_per_game' || lower === 'receiving_ypg') return 'recv_ypg';
            if (lower === 'recv_tds' || lower === 'receiving_tds' || lower === 'receiving_touchdowns') return 'recv_tds';
            if (lower === 'pp_pct' || lower === 'pppct' || lower === 'power_play_pct') return 'pp_pct';
            if (lower === 'pk_pct' || lower === 'pkpct' || lower === 'penalty_kill_pct') return 'pk_pct';
            if (lower === 'cf_pct' || lower === 'corsiforpct' || lower === 'corsi_for_pct') return 'cf_pct';
            if (lower === 'xgf_pct' || lower === 'xgforpct' || lower === 'xg_for_pct') return 'xgf_pct';
            return lower;
          };

          if (result.toolCallHistory) {
            // All sports now use flattened stats for better Tale of the Tape depth
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

                    // Create unique key for dedup using normalized key
                    const normalizedKey = normalizeKey(key);
                    const statKey = `${normalizedKey}:${hv}:${av}`;
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
                const vals = Object.entries(obj).filter(([k]) => k !== 'team').map(([, v]) => v);
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
                const allNA = Object.entries(home).filter(([k]) => k !== 'team').every(([, v]) => v === 'N/A') &&
                  Object.entries(away).filter(([k]) => k !== 'team').every(([, v]) => v === 'N/A');
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

          // NHL: ALWAYS use verifiedTaleOfTape from scout report for consistent display
          // NHL toolCallHistory can be sparse or inconsistent - verifiedTaleOfTape has reliable BDL stats
          if (config.key === 'icehockey_nhl' && result.verifiedTaleOfTape?.rows) {
            console.log(`   📊 NHL: Using verified Tale of Tape (${result.verifiedTaleOfTape.rows.length} rows) for pick card`);
            // Clear any toolCallHistory stats and use the verified rows instead
            statsData.length = 0;
            for (const row of result.verifiedTaleOfTape.rows) {
              // Skip injuries row (shown separately)
              if (row.name === 'Key Injuries') continue;
              // Extract value from nested structure: { team: "Name", value: "3.45" }
              const homeValue = typeof row.home === 'object' ? row.home.value : row.home;
              const awayValue = typeof row.away === 'object' ? row.away.value : row.away;
              const homeTeam = typeof row.home === 'object' ? row.home.team : result.homeTeam;
              const awayTeam = typeof row.away === 'object' ? row.away.team : result.awayTeam;
              // Use token as key (lowercase) to match iOS app format for NBA/NCAAB
              // iOS expects: { team: "Name", stat_key: "value" }, not { team: "Name", value: "value" }
              const statKey = row.token.toLowerCase();
              statsData.push({
                name: row.name,
                token: row.token,
                home: { team: homeTeam, [statKey]: homeValue },
                away: { team: awayTeam, [statKey]: awayValue }
              });
            }
            console.log(`   ✓ NHL: Added ${statsData.length} stats from verified Tale of Tape`);
          }

          // Also keep simple token list for backwards compatibility
          const statsUsed = result.toolCallHistory
            ? result.toolCallHistory.map(t => t.token)
            : [];

          // Use pre-fetched sportsbook odds (already fetched before analysis)
          let sportsbookOdds = null;
          let bestLine = null;
          try {
            const rawOdds = preSportsbookOdds; // Reuse pre-analysis odds — no duplicate API call
            if (rawOdds && rawOdds.length > 0) {
              // Format odds for the picked team
              sportsbookOdds = formatOddsForStorage(rawOdds, result.pick, result.homeTeam, result.awayTeam);
              console.log(`   Found odds from ${sportsbookOdds?.length || 0} sportsbooks`);

              // BEST LINE SELECTION: Find the best spread for Gary's pick
              if (sportsbookOdds && sportsbookOdds.length > 0 && result.type === 'spread') {
                const validOdds = sportsbookOdds.filter(o => typeof o.spread === 'number' && !isNaN(o.spread));
                if (validOdds.length > 0) {
                  const firstSpread = validOdds[0].spread;
                  const isUnderdog = firstSpread > 0;

                  // Compute median spread to filter outliers (e.g., Kalshi +32.5 vs consensus +17.5)
                  const sortedSpreads = validOdds.map(o => o.spread).sort((a, b) => a - b);
                  const medianSpread = sortedSpreads[Math.floor(sortedSpreads.length / 2)];
                  const MAX_DEVIATION = 4; // Max points away from median to be considered valid
                  const inRangeOdds = validOdds.filter(o => Math.abs(o.spread - medianSpread) <= MAX_DEVIATION);
                  const searchOdds = inRangeOdds.length > 0 ? inRangeOdds : validOdds;

                  let best = searchOdds[0];
                  for (const odds of searchOdds) {
                    if (isUnderdog) {
                      if (odds.spread > best.spread) best = odds;   // +18.5 > +17.5 = more cushion = better
                    } else {
                      if (odds.spread > best.spread) best = odds;   // -16.5 > -17.5 = fewer to cover = better
                    }
                  }

                  bestLine = {
                    book: best.book,
                    spread: best.spread,
                    spreadOdds: best.spread_odds
                  };

                  const defaultSpread = result.spread;
                  if (defaultSpread !== null && best.spread !== defaultSpread) {
                    console.log(`   Best line: ${best.spread > 0 ? '+' : ''}${best.spread} @ ${best.book} (default was ${defaultSpread > 0 ? '+' : ''}${defaultSpread})`);
                  }
                }
              }
            }
          } catch (oddsErr) {
            console.log(`   Could not process sportsbook odds: ${oddsErr.message}`);
          }

          // Create clean pick object without large/unnecessary fields
          // Use best available line if found, otherwise fall back to default
          const finalSpread = bestLine?.spread ?? result.spread;
          const finalSpreadOdds = bestLine?.spreadOdds ?? result.spreadOdds;
          const bestLineBook = bestLine?.book ?? null;

          // Update pick text to reflect best available line (not just Gary's raw output)
          let finalPickText = result.pick;
          if (bestLine && result.type === 'spread' && finalSpread !== result.spread && finalPickText) {
            // Replace the spread number in the pick text
            // e.g., "Washington Wizards +6.0 -114" → "Washington Wizards +6.5 -110"
            const spreadStr = finalSpread > 0 ? `+${finalSpread}` : `${finalSpread}`;
            const oddsStr = finalSpreadOdds ? ` ${finalSpreadOdds > 0 ? '+' + finalSpreadOdds : finalSpreadOdds}` : '';
            // Match pattern: team name followed by spread number and optional odds
            const pickMatch = finalPickText.match(/^(.+?)\s*[+-]\d+\.?\d*\s*[+-]?\d*$/);
            if (pickMatch) {
              finalPickText = `${pickMatch[1].trim()} ${spreadStr}${oddsStr}`;
              console.log(`   📝 Pick text updated: "${result.pick}" → "${finalPickText}"`);
            }
          }

          // Format game time for UI display
          const gameTimeEST = game.commence_time
            ? new Date(game.commence_time).toLocaleString('en-US', {
                timeZone: 'America/New_York',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              })
            : 'TBD';

          const cleanPick = {
            pick: finalPickText,
            type: result.type,
            odds: finalSpreadOdds || result.odds,
            confidence: result.confidence || 0.65, // Gary's conviction in the bet (0.50-1.00)
            // Thesis-based classification (new filtering system)
            thesis_type: result.thesis_type || null,
            thesis_mechanism: result.thesis_mechanism || null,
            supporting_factors: result.supporting_factors || [],
            contradicting_factors: result.contradicting_factors || [],
            homeTeam: result.homeTeam,
            awayTeam: result.awayTeam,
            // UI display fields
            game: `${result.awayTeam} @ ${result.homeTeam}`,
            time: gameTimeEST,
            spread: finalSpread, // Best available line (not just the first sportsbook)
            spreadOdds: finalSpreadOdds,
            bestLineBook: bestLineBook, // Which sportsbook has the best line
            moneylineHome: result.moneylineHome,
            moneylineAway: result.moneylineAway,
            total: result.total,
            rationale: result.rationale,
            league: config.name,
            sport: config.key,
            pick_id: `agentic-${config.key}-${game.id || Date.now()}`,
            commence_time: game.commence_time,
            // Venue/tournament context (for NBA Cup, playoffs, NFL primetime, etc.)
            // Use venue mapping based on HOME team (not the team in the pick)
            venue: result.venue || getVenueForHomeTeam(result.homeTeam, config.name) || null,
            isNeutralSite: result.isNeutralSite || false,
            tournamentContext: result.tournamentContext || null,
            gameSignificance: result.gameSignificance || null,
            // CFP-specific fields for NCAAF (seeding, round, venue)
            cfpRound: result.cfpRound || null,
            homeSeed: result.homeSeed || null,
            awaySeed: result.awaySeed || null,
            // NCAAB AP Top 25 rankings
            homeRanking: result.homeRanking || null,
            awayRanking: result.awayRanking || null,
            // NCAAB conference data for app filtering
            homeConference: result.homeConference || null,
            awayConference: result.awayConference || null,
            // Single conference field for app filtering (based on which team is in the pick)
            conference: (() => {
              const pickText = result.pick || '';
              const homeTeam = result.homeTeam || '';
              const awayTeam = result.awayTeam || '';
              // Check which team is in the pick and use their conference
              if (homeTeam && pickText.includes(homeTeam.split(' ').slice(-1)[0])) {
                return result.homeConference || null;
              } else if (awayTeam && pickText.includes(awayTeam.split(' ').slice(-1)[0])) {
                return result.awayConference || null;
              }
              // Fallback: use home conference if available
              return result.homeConference || result.awayConference || null;
            })(),
            statsUsed: statsUsed, // Token names for backwards compatibility
            statsData: statsData, // Full stat data with values for Tale of the Tape
            // Pre-computed Tale of the Tape from scout report (BDL verified stats)
            // Used when toolCallHistory is sparse (e.g., NHL, NCAAB)
            verifiedTaleOfTape: result.verifiedTaleOfTape || null,
            injuries: result.injuries || null, // Structured injury data from BDL
            sportsbook_odds: sportsbookOdds, // Multi-book odds comparison (ML + Spread)
            isBeta: config.isBeta || false, // Beta flag for sports with limited data
            dataLimitationNote: config.isBeta
              ? `${config.name} picks use supplemental web-sourced analytics. Confidence may be lower than NBA/NFL.`
              : null
          };

          // Add to picks
          sportPicks.push(cleanPick);
          picksGenerated += 1;
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
      let storedPicksCount = 0;
      let filteredOutCount = 0;

      if (sportPicks.length > 0) {
        if (!shouldStore) {
          console.log(`\n[${config.name}] Storage disabled (--store false). Generated ${sportPicks.length} pick(s) but will NOT write to Supabase.`);
        } else {
          console.log(`\n[${config.name}] Processing ${sportPicks.length} picks...`);

          // ═══════════════════════════════════════════════════════════════
          // GARY'S PICKS SUMMARY
          // ═══════════════════════════════════════════════════════════════
          console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
          console.log(`║  🏈 GARY'S ${config.name} PICKS (${sportPicks.length} picks)                   `);
          console.log(`╠══════════════════════════════════════════════════════════════════╣`);
          for (let i = 0; i < sportPicks.length; i++) {
            const p = sportPicks[i];
            const typeTag = p.type === 'pass' ? 'PASS' : (p.type === 'moneyline' ? 'ML' : 'SPREAD');
            const pickStr = (p.pick || 'PASS').slice(0, 30).padEnd(30);
            console.log(`║  ${pickStr} | ${typeTag.padEnd(6)}`);
          }
          console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

          // ═══════════════════════════════════════════════════════════════
          // SIMPLE PASS FILTER (Gary has full agency)
          // ═══════════════════════════════════════════════════════════════
          // Gary decides what's worth betting. We just filter out PASS picks.
          // No confidence thresholds, no quotas, no caps.
          // If Gary picked it (spread or ML), we store it.
          // ═══════════════════════════════════════════════════════════════

          const qualifiedPicks = sportPicks.filter(p => {
            // Filter out PASS picks
            if (p.pick === 'PASS' || p.type === 'pass') {
              console.log(`  ⏭️ PASS: ${p.homeTeam} vs ${p.awayTeam} - Gary moved on`);
              if (p.thesis_mechanism) {
                console.log(`     Reason: ${p.thesis_mechanism}`);
              }
              return false;
            }

            // Filter out totals (over/under) - game picks are spread/ML only
            if (p.type === 'total') {
              console.log(`  ❌ Filtered: ${p.pick} (totals not included for game picks)`);
              return false;
            }

            // Determine if this is an underdog pick
            const isUnderdogPick = 
              (p.type === 'spread' && p.pick.includes('+')) ||
              (p.type === 'moneyline' && p.odds && (parseInt(p.odds) >= 100 || String(p.odds).startsWith('+')));
            
            // Log the pick Gary staked his name on
            const pickType = p.type === 'moneyline' ? '💰ML' : '📊SPREAD';
            const dogTag = isUnderdogPick ? '🐕DOG' : '🏆FAV';
            console.log(`  ✅ PICK: ${p.pick} [${pickType}] [${dogTag}]`);
            if (p.thesis_mechanism) {
              console.log(`     Thesis: ${p.thesis_mechanism}`);
            }

            return true;
          });

          // Log filtering summary
          const passCount = sportPicks.filter(p => p.pick === 'PASS' || p.type === 'pass').length;
          console.log(`\n[${config.name}] Gary's decisions: ${qualifiedPicks.length} PICKS, ${passCount} PASS`)

          // ═══════════════════════════════════════════════════════════════
          // NBA PICK FILTER (Post-Filter)
          // Applies rule-based filtering to NBA picks only
          // ═══════════════════════════════════════════════════════════════
          let finalPicks = qualifiedPicks;

          if (config.name === 'NBA' && qualifiedPicks.length > 0) {
            console.log(`\n[NBA] Applying post-filter rules...`);
            const filterResult = await filterNBAPicks(qualifiedPicks);
            finalPicks = filterResult.kept;

            // Log removed picks
            if (filterResult.removed.length > 0) {
              console.log(`\n[NBA] Filtered out ${filterResult.removed.length} picks:`);
              for (const { pick, reason } of filterResult.removed) {
                console.log(`  - ${pick.pick} | ${reason}`);
              }
            }
          }

          // ═══════════════════════════════════════════════════════════════
          // NHL PICK FILTER (Confidence Trimming)
          // Removes top 2 and bottom 2 confidence picks (overconfidence + low conviction)
          // Max 5 picks, Min 3 picks. NHL is ML-only (no puck lines)
          // ═══════════════════════════════════════════════════════════════
          if (config.name === 'NHL' && qualifiedPicks.length > 0) {
            console.log(`\n[NHL] Applying confidence trimming filter...`);
            const filterResult = await filterNHLPicks(qualifiedPicks);
            finalPicks = filterResult.kept;

            // Log removed picks
            if (filterResult.removed.length > 0) {
              console.log(`\n[NHL] Filtered out ${filterResult.removed.length} picks:`);
              for (const { pick, reason } of filterResult.removed) {
                console.log(`  - ${pick.pick} | ${reason}`);
              }
            }
          }

          // ═══════════════════════════════════════════════════════════════
          // NCAAB PICK FILTER (Conference Diversity)
          // Per conference: 1 ML, 1 underdog spread, 1 favorite spread
          // Removes top/bottom confidence first
          // ═══════════════════════════════════════════════════════════════
          if (config.name === 'NCAAB' && qualifiedPicks.length > 0) {
            console.log(`\n[NCAAB] Applying conference diversity filter...`);
            const filterResult = await filterNCAABPicks(qualifiedPicks);
            finalPicks = filterResult.kept;

            // Log removed picks
            if (filterResult.removed.length > 0) {
              console.log(`\n[NCAAB] Filtered out ${filterResult.removed.length} picks:`);
              for (const { pick, reason } of filterResult.removed) {
                console.log(`  - ${pick.pick} | ${reason}`);
              }
            }
          }

          // ═══════════════════════════════════════════════════════════════
          // STORE FILTERED PICKS
          // NBA: Rule-based filtering (home favorites, standings, etc.)
          // NHL: Confidence trimming (remove top 2 + bottom 2, max 5)
          // NCAAB: Conference diversity (1 ML, 1 dog, 1 fav per conf)
          // Other sports: All Gary's picks go directly to Supabase
          // ═══════════════════════════════════════════════════════════════
          if (finalPicks.length > 0) {
            let picksToStore = finalPicks;

            filteredOutCount = qualifiedPicks.length - finalPicks.length;
            const filterNote = (config.name === 'NBA' || config.name === 'NHL' || config.name === 'NCAAB') && filteredOutCount > 0 ? ` (${filteredOutCount} filtered out)` : '';
            console.log(`\n[${config.name}] Storing ${picksToStore.length} picks${filterNote}`);
            await storePicks(picksToStore);
            allPicks.push(...picksToStore);
            storedPicksCount = picksToStore.length;
          } else {
            filteredOutCount = qualifiedPicks.length;
            const filterMsg = (config.name === 'NBA' || config.name === 'NHL' || config.name === 'NCAAB') ? ' (all filtered out)' : '';
            console.log(`\n[${config.name}] No picks to store${filterMsg}`);
          }
        }
      }

      const sportTime = ((Date.now() - sportStartTime) / 1000).toFixed(1);

      // Count picks vs passes
      const pickCount = sportPicks.filter(p => p.pick !== 'PASS' && p.type !== 'pass').length;
      const passCount = sportPicks.filter(p => p.pick === 'PASS' || p.type === 'pass').length;

      // Track failed games for this sport (slateSession removed)
      const failedCount = 0;

      summary[config.name] = {
        games: finalGames.length,
        picks: pickCount,
        passed: passCount,
        stored: storedPicksCount,
        filtered: filteredOutCount,
        failed: failedCount,
        failedGames: [],
        time: sportTime
      };

      const filterNote = filteredOutCount > 0 ? `, ${filteredOutCount} filtered` : '';
      console.log(`\n${config.emoji} ${config.name} COMPLETE: ${storedPicksCount} stored (${pickCount} picks${filterNote}) in ${sportTime}s`);

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
      console.log(`║  ${sport.padEnd(8)} Error: ${data.error.slice(0, 40)}`);
    } else {
      const filteredStr = data.filtered > 0 ? `, ${data.filtered} filtered` : '';
      const failedStr = data.failed > 0 ? ` (${data.failed} failed)` : '';
      console.log(`║  ${sport.padEnd(8)} ${String(data.games).padStart(3)} games -> ${String(data.stored || 0).padStart(2)} stored (${data.picks} picks${filteredStr})${failedStr} (${data.time}s)`);
    }
  }

  // Show details of any failed games
  const allFailedGames = Object.entries(summary)
    .filter(([_, data]) => data.failedGames && data.failedGames.length > 0)
    .flatMap(([sport, data]) => data.failedGames.map(f => ({ sport, ...f })));
  
  if (allFailedGames.length > 0) {
    console.log(`╠══════════════════════════════════════════════════════════════════╣`);
    console.log(`║  ⚠️  FAILED GAMES (${allFailedGames.length}):                                       `);
    for (const failed of allFailedGames.slice(0, 5)) {
      console.log(`║    ${failed.game.slice(0, 35).padEnd(35)} | ${failed.statsGathered} stats | ${failed.iterations} iterations`);
      console.log(`║      → ${failed.error.slice(0, 50)}`);
    }
    if (allFailedGames.length > 5) {
      console.log(`║    ... and ${allFailedGames.length - 5} more`);
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

  // ═══════════════════════════════════════════════════════════════════════════
  // GRACEFUL EXIT
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n🐻 Gary is signing off. Session complete!');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  
  // Give time for any pending async operations (Supabase connections, etc.) to complete
  await sleep(2000);
  
  // Explicitly exit with success code
  console.log('✅ Process complete. Exiting cleanly...');
  process.exit(0);
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
  // DRY RUN MODE - skip storage if --dry-run flag is passed
  if (process.argv.includes('--dry-run')) {
    console.log(`🧪 DRY RUN MODE - Skipping storage of ${picks.length} picks`);
    return;
  }

  // TEST MODE - store to test_daily_picks instead of production tables
  if (useTestTable) {
    console.log(`🧪 TEST MODE - Storing ${picks.length} picks to test_daily_picks table`);
    try {
      const result = await picksService.storeTestPicks(picks, testName, `Test run at ${new Date().toISOString()}`);
      if (result.success) {
        console.log(`✅ TEST: Stored ${result.count} picks in test_daily_picks (mode: ${result.mode})`);
      } else {
        console.error(`⚠️  TEST storage issue:`, result.error || result.message);
      }
    } catch (error) {
      console.error(`❌ Error storing test picks:`, error.message);
    }
    return;
  }

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