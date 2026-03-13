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
import { ncaabSeason } from '../src/utils/dateUtils.js';

// Now import modules that depend on env vars
const { analyzeGame, buildSystemPrompt } = await import('../src/services/agentic/orchestrator/index.js');
const { oddsService } = await import('../src/services/oddsService.js');
const { picksService } = await import('../src/services/picksService.js');
const { ballDontLieService } = await import('../src/services/ballDontLieService.js');
const { getConstitution } = await import('../src/services/agentic/constitution/index.js');
const { geminiGroundingSearch } = await import('../src/services/agentic/scoutReport/scoutReportBuilder.js');

// Manual WBC games + odds — update these daily before running --wbc
// Each entry: { away, home, spread, spreadOdds, ml }
const WBC_MANUAL_GAMES = [
  {
    away: 'South Korea', home: 'Dominican Republic',
    spread: { away: 4.5, home: -4.5 },
    spreadOdds: { away: 105, home: -130 },
    ml: { away: 650, home: -1000 },
  },
  {
    away: 'Canada', home: 'United States',
    spread: { away: 4.5, home: -4.5 },
    spreadOdds: { away: 100, home: -125 },
    ml: { away: 550, home: -900 },
  },
];

/**
 * Build pipeline-ready game objects from WBC_MANUAL_GAMES.
 */
function getManualWbcGames() {
  return WBC_MANUAL_GAMES.map((g, i) => ({
    id: `wbc-manual-${i}`,
    home_team: g.home,
    away_team: g.away,
    home_team_data: { full_name: g.home, name: g.home, abbreviation: '' },
    away_team_data: { full_name: g.away, name: g.away, abbreviation: '' },
    commence_time: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // Future time — manual games always pass time filter
    start_time: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    status: 'Pre-Game',
    venue: 'WBC Venue',
    description: 'World Baseball Classic',
    gameSignificance: 'WBC Pool Play',
    moneyline_home: g.ml.home,
    moneyline_away: g.ml.away,
    spread_home: g.spread.home,
    spread_away: g.spread.away,
  }));
}

/**
 * Return manual odds for a WBC game in sportsbook format.
 */
function fetchWbcOddsManual(homeTeam, awayTeam) {
  const g = WBC_MANUAL_GAMES.find(m => m.home === homeTeam && m.away === awayTeam);
  if (!g) {
    console.error(`[WBC Odds] HARD FAIL: No manual game entry for ${awayTeam} @ ${homeTeam}. Add it to WBC_MANUAL_GAMES.`);
    return null;
  }
  console.log(`[WBC Odds] Manual: ${g.away} ${g.spread.away > 0 ? '+' : ''}${g.spread.away} (${g.spreadOdds.away}) ML ${g.ml.away} / ${g.home} ${g.spread.home > 0 ? '+' : ''}${g.spread.home} (${g.spreadOdds.home}) ML ${g.ml.home}`);
  return [{
    spread_home: g.spread.home, spread_home_odds: g.spreadOdds.home,
    spread_away: g.spread.away, spread_away_odds: g.spreadOdds.away,
    ml_home: g.ml.home, ml_away: g.ml.away,
    total: null, total_over_odds: null, total_under_odds: null,
    displayName: 'Manual', vendor: 'Manual'
  }];
}

/**
 * Fetch multi-book sportsbook odds from BDL for a single game.
 * Returns array in the shape formatSportsbookComparison() expects:
 *   { spread_away, spread_away_odds, ml_away, spread_home, spread_home_odds, ml_home, displayName }
 */
async function fetchSportsbookOdds(sportKey, gameId, homeTeam, awayTeam) {
  if (!gameId) return null;
  try {
    const rows = await ballDontLieService.getOddsV2({ game_ids: [gameId] }, sportKey);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows.map(r => ({
      spread_home: r.spread_home_value ?? null,
      spread_home_odds: r.spread_home_odds ?? null,
      spread_away: r.spread_away_value ?? null,
      spread_away_odds: r.spread_away_odds ?? null,
      ml_home: r.moneyline_home_odds ?? null,
      ml_away: r.moneyline_away_odds ?? null,
      total: r.total_value ?? null,
      total_over_odds: r.total_over_odds ?? null,
      total_under_odds: r.total_under_odds ?? null,
      displayName: r.vendor || 'Unknown',
      vendor: r.vendor || 'Unknown'
    }));
  } catch (err) {
    console.warn(`[Sportsbook Odds] BDL fetch failed for game ${gameId}: ${err.message}`);
    return null;
  }
}

/**
 * Map multi-book odds to pick-side-specific format for storage & best-line selection.
 * Returns array of { book, spread, spread_odds, ml } from the perspective of the picked team.
 */
// Prediction markets excluded from odds pipeline (not real sportsbooks)
const EXCLUDED_VENDORS = new Set(['kalshi', 'polymarket']);

function formatOddsForStorage(oddsArray, pick, homeTeam, awayTeam) {
  if (!Array.isArray(oddsArray) || oddsArray.length === 0) return null;
  // Filter out prediction markets (Kalshi, Polymarket) — not real sportsbooks
  oddsArray = oddsArray.filter(row => {
    const vendor = (row.displayName || row.vendor || '').toLowerCase();
    return !EXCLUDED_VENDORS.has(vendor);
  });
  // Determine which side the pick is on (home or away)
  const pickLower = (pick || '').toLowerCase();
  const homeLower = (homeTeam || '').toLowerCase();
  const awayLower = (awayTeam || '').toLowerCase();
  const homeLastWord = homeLower.split(' ').pop();
  const awayLastWord = awayLower.split(' ').pop();
  let isHomePick = homeLastWord && pickLower.includes(homeLastWord);
  // Disambiguate when both teams share a last word (e.g., "Georgia Bulldogs" vs "Mississippi State Bulldogs")
  if (isHomePick && awayLastWord && awayLastWord === homeLastWord) {
    const homeFullMatch = pickLower.includes(homeLower);
    const awayFullMatch = pickLower.includes(awayLower);
    if (awayFullMatch && !homeFullMatch) isHomePick = false;
  }
  return oddsArray.map(row => {
    // BDL returns spread as string ("8.5") — convert to number for consistent storage
    const rawSpread = isHomePick ? row.spread_home : row.spread_away;
    const spreadNum = rawSpread != null ? parseFloat(rawSpread) : NaN;
    return {
    book: row.displayName || row.vendor || 'Unknown',
    spread: Number.isFinite(spreadNum) ? spreadNum : null,
    spread_odds: isHomePick ? row.spread_home_odds : row.spread_away_odds,
    ml: isHomePick ? row.ml_home : row.ml_away,
    // Keep full data for Supabase storage
    spread_home: row.spread_home,
    spread_away: row.spread_away,
    ml_home: row.ml_home,
    ml_away: row.ml_away,
    total: row.total,
    total_over_odds: row.total_over_odds,
    total_under_odds: row.total_under_odds
  };
  });
}
const { supabase } = await import('../src/supabaseClient.js');
// Graceful shutdown handler — log and exit cleanly on SIGTERM/SIGINT
// Picks stored before the signal are already safe in Supabase (incremental storage)
process.on('SIGTERM', () => {
  console.log('\n⚠️ Received SIGTERM — shutting down gracefully...');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('\n⚠️ Received SIGINT — shutting down gracefully...');
  process.exit(0);
});

// Simple system: Gary picks SPREAD or ML.
// ═══════════════════════════════════════════════════════════════════════════
// GARY PICK GENERATION
// ═══════════════════════════════════════════════════════════════════════════

// Configuration
// All US sports use EST-based "today" filtering - games happening today that haven't started yet
const SPORT_CONFIG = {
  nba: { key: 'basketball_nba', name: 'NBA', emoji: '🏀', useToday: true }, // Today's games (EST)
  nfl: { key: 'americanfootball_nfl', name: 'NFL', emoji: '🏈', daysAhead: 7 }, // NFL is weekly
  nhl: { key: 'icehockey_nhl', name: 'NHL', emoji: '🏒', isBeta: true, useToday: true }, // Today's games (EST)
  ncaab: { key: 'basketball_ncaab', name: 'NCAAB', emoji: '🏀', useToday: true }, // Today's games (EST) — Flash pre-investigates 20-30 stat calls per game; Gary's own fetch_stats are supplementary
  ncaaf: { key: 'americanfootball_ncaaf', name: 'NCAAF', emoji: '🏈', fbsOnly: true, useToday: true }, // Today's games (EST)
  mlb: { key: 'baseball_mlb', name: 'WBC', emoji: '⚾', useToday: true, isWbc: true } // WBC / MLB games
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

// ═══════════════════════════════════════════════════════════════════════════
// PICK LOGGING & TRANSPARENCY
// ═══════════════════════════════════════════════════════════════════════════
// 
// Gary evaluates the full slate and makes a pick.
// We do not filter by confidence or apply hard rules here.
// This section only provides transparency tags (e.g., rest, injuries, traps).
// ═══════════════════════════════════════════════════════════════════════════


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
// --offset flag to skip N games before applying limit (for parallel terminals)
const gameOffset = parseInt(getArgValue('--offset'), 10) || 0;
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
  if (args.includes('--mlb') || args.includes('--wbc')) sportsToRun.push('mlb');
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
║    - Gary always picks a side (SPREAD or MONEYLINE)              ║
║    - No PASS, no totals — spread/ML only                         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);
  process.exit(0);
}

// Check environment variables
function checkEnv() {
  const checks = [
    { name: 'GEMINI_API_KEY', alts: [] },
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
║        Stats-First Analysis | Gemini Function Calling            ║
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


    console.log(`\n${'═'.repeat(70)}`);
    console.log(`${config.emoji} STARTING ${config.name} ANALYSIS`);
    console.log(`${'═'.repeat(70)}\n`);

    try {
      // Fetch games
      console.log(`[${config.name}] Fetching upcoming games...`);

      // WBC: Use manually configured games + odds (no API fetch needed)
      let allGames;
      if (config.isWbc) {
        allGames = getManualWbcGames();
        console.log(`[${config.name}] Using ${allGames.length} manual WBC games`);
        for (const g of allGames) {
          console.log(`   ${g.away_team} @ ${g.home_team}: Spread ${g.spread_away > 0 ? '+' : ''}${g.spread_away} / ${g.spread_home > 0 ? '+' : ''}${g.spread_home}, ML ${g.moneyline_away}/${g.moneyline_home}`);
        }
      } else {
        allGames = await oddsService.getUpcomingGames(config.key, { nocache: true, targetDate: dateFilter });
      }

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

          const isNCAAB = config.key === 'basketball_ncaab';
          const isNHL = config.key === 'icehockey_nhl';
          const isMLB = config.key === 'baseball_mlb';

          games = allGames?.filter(g => {
            const gameTime = new Date(g.commence_time);
            const gameDateEST = gameTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

            // Game must be today in EST AND hasn't started yet
            return gameDateEST === todayEST && gameTime >= now;
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

      // NCAAB: Attach conference names to games for storage (no conference filtering — Gary picks all games)
      if (config.key === 'basketball_ncaab') {
        const { ballDontLieService } = await import('../src/services/ballDontLieService.js');

        const CONF_ID_NAMES = {
          1: 'ACC', 2: 'America East', 3: 'Atlantic 10', 4: 'AAC', 5: 'Atlantic Sun',
          6: 'Big 12', 7: 'Big East', 8: 'Big Sky', 9: 'Big South',
          10: 'Big Ten', 11: 'Big West', 12: 'CAA', 13: 'Conference USA',
          14: 'Horizon', 15: 'Ivy League', 16: 'MAAC', 17: 'MEAC',
          18: 'MAC', 19: 'Missouri Valley', 20: 'Mountain West', 21: 'NEC',
          22: 'Ohio Valley', 23: 'Patriot', 24: 'SEC', 25: 'Southern',
          26: 'Southland', 27: 'SWAC', 28: 'Summit', 29: 'Sun Belt',
          30: 'WAC', 31: 'WCC', 32: 'West Coast', 33: 'Pac-12'
        };

        const getConfName = (confId) => {
          return CONF_ID_NAMES[confId] || `Conf-${confId}`;
        };

        const ncaabTeams = await ballDontLieService.getTeams('basketball_ncaab');
        const normalize = (name) => name?.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

        const teamMap = new Map();
        ncaabTeams.forEach(t => {
          if (t.full_name) teamMap.set(normalize(t.full_name), t);
          if (t.name) teamMap.set(normalize(t.name), t);
        });

        const findTeam = (name) => {
          const norm = normalize(name);
          if (teamMap.has(norm)) return teamMap.get(norm);
          for (const [key, team] of teamMap.entries()) {
            if (key.includes(norm) || norm.includes(key)) return team;
          }
          return null;
        };

        const skippedGames = [];
        console.log(`[${config.name}] Attaching conference data to ${games.length} games (all conferences accepted)...`);

        for (const game of games) {
          try {
            const homeTeam = findTeam(game.home_team);
            const awayTeam = findTeam(game.away_team);

            if (!homeTeam || !awayTeam) {
              skippedGames.push({ game, reason: 'Team not found in database' });
              continue;
            }

            game.homeConference = getConfName(homeTeam.conference_id);
            game.awayConference = getConfName(awayTeam.conference_id);
          } catch (err) {
            console.warn(`[${config.name}] Could not verify data for ${game.away_team} @ ${game.home_team}: ${err.message}`);
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
        console.log(`[${config.name}] Conference data attached to ${games.length} games (all conferences accepted)`);
        
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
      // --offset flag skips N games before applying limit (for parallel terminals)
      const MAX_GAMES = gameLimit || config.maxGames || 100;
      const limitedGames = games.slice(gameOffset, gameOffset + MAX_GAMES);

      const offsetNote = gameOffset ? ` --offset ${gameOffset}` : '';
      const limitNote = gameLimit ? ` (--limit ${gameLimit}${offsetNote})` : (games.length > MAX_GAMES ? ` (limited to ${MAX_GAMES})` : '');
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
      // Replace date template — handle both sectioned object and flat string
      if (typeof constitution === 'object' && constitution.full) {
        for (const key of ['baseRules', 'domainKnowledge', 'investigationPrompts', 'guardrails', 'full']) {
          if (constitution[key]) {
            constitution[key] = constitution[key].replace(/{{CURRENT_DATE}}/g, today);
          }
        }
      } else {
        constitution = constitution.replace(/{{CURRENT_DATE}}/g, today);
      }
      const systemPrompt = buildSystemPrompt(constitution, config.key);
      
      console.log(`[${config.name}] 🎯 Processing ${finalGames.length} games`);

      // Process each game
      const sportPicks = [];
      let picksGenerated = 0;
      for (let i = 0; i < finalGames.length; i++) {
        const game = finalGames[i];

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
        // MLB/WBC: Use manual odds
        let preSportsbookOdds = null;
        try {
          if (config.isWbc) {
            console.log(`   Using manual WBC odds...`);
            preSportsbookOdds = fetchWbcOddsManual(game.home_team, game.away_team);
            if (preSportsbookOdds?.length > 0) {
              console.log(`   Manual WBC odds: ML ${preSportsbookOdds[0].ml_home}/${preSportsbookOdds[0].ml_away}`);
            } else {
              console.log(`   No manual odds for this game — Gary will use scout report odds`);
            }
          } else {
            const preGameId = game.bdl_game_id || game.id;
            if (preGameId) {
              console.log(`   Fetching sportsbook odds comparison (pre-analysis)...`);
              preSportsbookOdds = await fetchSportsbookOdds(config.key, preGameId, game.home_team, game.away_team);
              if (preSportsbookOdds?.length > 0) {
                console.log(`   Found odds from ${preSportsbookOdds.length} sportsbooks`);
              }
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
          // Use UNIQUE stats count — exclude rejected tokens (quality: 'unavailable')
          const allTokens = (result.toolCallHistory || [])
            .filter(t => t.token && t.quality !== 'unavailable')
            .map(t => t.token);
          const uniqueTokens = [...new Set(allTokens)];
          const statsCount = uniqueTokens.length;

          // For NCAAB: Check that we have real stat values (not 0.0% or 0-0)
          if (config.key === 'basketball_ncaab' && result.toolCallHistory) {
            let zeroStatCount = 0;
            let totalCheckedStats = 0;
            const badStats = [];

            for (const stat of result.toolCallHistory.filter(t => t.quality !== 'unavailable')) {
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
            // Filter out undefined/empty tokens AND rejected tokens (quality: 'unavailable')
            const tokens = result.toolCallHistory.filter(t => t.token && t.quality !== 'unavailable').map(t => t.token);
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
            
            // Check key investigation areas (sport-aware)
            const isNCAABSport = config.key === 'basketball_ncaab';
            const investigatedAreas = isNCAABSport ? {
              // NCAAB: BDL tokens only — scout report covers KenPom, rankings, H2H, injuries, home court
              fourFactors: tokens.some(t => t && (t.includes('EFG') || t.includes('TURNOVER_RATE') || t.includes('OREB_RATE') || t.includes('FT_RATE'))),
              tempo: tokens.some(t => t && t.includes('TEMPO')),
              efficiency: tokens.some(t => t && (t.includes('RATING') || t.includes('TS_PCT'))),
              scoring: tokens.some(t => t && (t.includes('SCORING') || t.includes('FG_PCT') || t.includes('THREE_PT'))),
              defense: tokens.some(t => t && (t.includes('REBOUNDS') || t.includes('STEALS') || t.includes('BLOCKS'))),
              assists: tokens.some(t => t && t.includes('ASSISTS')),
              playerLogs: playerStatsCount > 0
            } : {
              homeAwaySplits: tokens.some(t => t && (t.includes('HOME_AWAY') || t.includes('SPLITS'))),
              recentForm: tokens.some(t => t && (t.includes('RECENT_FORM') || t.includes('LAST_'))),
              h2hHistory: true, // H2H is preloaded in scout report for all sports
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
              // Skip tracking-only entries (no actual stat data) — these are coverage markers, not display stats
              if (t.homeValue === undefined && t.awayValue === undefined) continue;
              // Skip unavailable stats
              if (t.quality === 'unavailable') continue;

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

          // ALWAYS use verifiedTaleOfTape when available — toolCallHistory is inconsistent
          if ((config.key === 'icehockey_nhl' || config.key === 'basketball_nba' || config.key === 'basketball_ncaab' || config.key === 'baseball_mlb') && result.verifiedTaleOfTape?.rows) {
            const sportLabels = { 'icehockey_nhl': 'NHL', 'basketball_nba': 'NBA', 'basketball_ncaab': 'NCAAB', 'baseball_mlb': 'WBC' };
            const sportLabel = sportLabels[config.key] || config.key;
            console.log(`   📊 ${sportLabel}: Using verified Tale of Tape (${result.verifiedTaleOfTape.rows.length} rows) for pick card`);

            // Map verifiedTaleOfTape tokens to iOS StatValues property names
            // iOS StatValues.from(dict:) reads specific keys like "offensive_rating", "tempo", etc.
            // getValue(for: token) then uses the token to look up the value from those properties
            const tokenToIosKey = {
              // Common stats
              'L5_FORM': 'last_5',
              'L10_FORM': 'last_10',
              'RECORD': 'overall',
              'CONF_RECORD': 'conference_record',
              'EFG_PCT': 'efg_pct',
              // NBA stats (from BDL advanced + base)
              'OFF_RATING': 'offensive_rating',
              'DEF_RATING': 'defensive_rating',
              'NET_RATING': 'net_rating',
              'PACE': 'pace',
              'TS_PCT': 'true_shooting_pct',
              'PPG': 'points_per_game',
              'RPG': 'rebounds_per_game',
              'APG': 'assists_per_game',
              'FG_PCT': 'fg_pct',
              '3PT_PCT': 'three_pct',
              'FT_PCT': 'ft_pct',
              'TOV_GM': 'turnovers_per_game',
              'OREB_GM': 'oreb_per_game',
              'DREB_GM': 'dreb_per_game',
              // NCAAB Barttorvik stats
              'ADJOE': 'offensive_rating',
              'ADJDE': 'defensive_rating',
              'ADJEM': 'net_rating',
              'TEMPO': 'tempo',
              'T_RANK': 'kenpom_rank',
              'BARTHAG': 'efg_pct',  // Reuse efg_pct slot for Barthag display
              'WAB': 'wab',
              // NHL stats
              'GOALS_FOR_GM': 'goals_for_per_game',
              'GOALS_AGST_GM': 'goals_against_per_game',
              'SHOTS_FOR_GM': 'shots_for',
              'PP_PCT': 'power_play_pct',
              'PK_PCT': 'penalty_kill_pct',
              'FO_PCT': 'faceoff_pct',
              'CORSI_PCT': 'corsi_pct',
              'XG_PCT': 'xg_pct',
              'PDO': 'pdo',
              'SH_PCT_5V5': 'sh_pct_5v5',
              'SV_PCT_5V5': 'sv_pct_5v5',
              // NCAAB Barttorvik rankings
              'ADJOE_RANK': 'adjoe_rank',
              'ADJDE_RANK': 'adjde_rank',
              'PROJ_RECORD': 'proj_record',
              // MLB/WBC stats
              'POOL_RECORD': 'overall',
              'SP_ERA': 'sp_era',
              'SP_WHIP': 'sp_whip',
              'SP_K9': 'sp_k9',
              'SP_BB9': 'sp_bb9',
              'SP_RECORD': 'sp_record',
              'SP_IP': 'sp_ip',
              'SP_SO': 'sp_so',
              'TEAM_AVG': 'team_avg',
              'TEAM_OBP': 'team_obp',
              'TEAM_SLG': 'team_slg',
              'TEAM_OPS': 'team_ops',
              'TEAM_HR': 'team_hr',
              // WBC-specific context stats
              'GAME1_RESULT': 'game1_result',
              'SP_NAME': 'sp_name',
              'ML_ODDS': 'ml_odds',
              'RUN_LINE': 'run_line',
              'VENUE': 'venue_name',
              'LAST_PLAYED': 'last_played',
            };

            // Clear any toolCallHistory stats and use the verified rows instead
            statsData.length = 0;
            for (const row of result.verifiedTaleOfTape.rows) {
              // Skip injuries row (shown separately)
              if (row.name === 'Key Injuries') continue;
              // Extract value from nested structure: { team: "Name", value: "3.45" }
              // CRITICAL: iOS StatValues.from(dict:) casts with `as? String` — numbers silently fail
              // Always convert to String so iOS can parse them
              const rawHome = typeof row.home === 'object' ? row.home.value : row.home;
              const rawAway = typeof row.away === 'object' ? row.away.value : row.away;
              const homeValue = rawHome != null ? String(rawHome) : 'N/A';
              const awayValue = rawAway != null ? String(rawAway) : 'N/A';
              const homeTeam = typeof row.home === 'object' ? row.home.team : result.homeTeam;
              const awayTeam = typeof row.away === 'object' ? row.away.team : result.awayTeam;
              // Map token to iOS-compatible property name
              const iosKey = tokenToIosKey[row.token] || row.token.toLowerCase();
              statsData.push({
                name: row.name,
                token: row.token,
                home: { team: homeTeam, [iosKey]: homeValue },
                away: { team: awayTeam, [iosKey]: awayValue }
              });
            }
            console.log(`   ✓ ${sportLabel}: Added ${statsData.length} stats from verified Tale of Tape`);
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
            odds: result.type === 'spread' ? (finalSpreadOdds || result.odds) : result.odds,
            confidence: result.confidence || 0.65, // Gary's conviction in the bet (0.50-1.00)
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
            venue: result.venue || null,
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

          // Store each pick immediately so it appears in the app as soon as it's ready
          if (shouldStore && cleanPick.type !== 'pass' && cleanPick.pick !== 'PASS') {
            try {
              console.log(`\n📤 [${config.name}] Storing pick immediately: ${cleanPick.pick}`);
              await storePicks([cleanPick]);
              console.log(`✅ [${config.name}] Pick stored to Supabase`);
            } catch (storeErr) {
              console.log(`⚠️  [${config.name}] Immediate store failed (will retry at end): ${storeErr.message}`);
            }
          }
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
            const typeTag = p.type === 'moneyline' ? 'ML' : 'SPREAD';
            const pickStr = (p.pick || '').slice(0, 30).padEnd(30);
            console.log(`║  ${pickStr} | ${typeTag.padEnd(6)}`);
          }
          console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

          const qualifiedPicks = sportPicks.filter(p => {
            // Filter out totals (over/under) - game picks are spread/ML only
            if (p.type === 'total') {
              console.log(`  ❌ Filtered: ${p.pick} (totals not included for game picks)`);
              return false;
            }
            // Defense-in-depth: catch PASS if orchestrator didn't
            if (p.type === 'pass' || (p.pick && p.pick.toUpperCase() === 'PASS')) {
              console.log(`  ❌ Filtered: PASS pick (Gary must always pick a side)`);
              return false;
            }

            // Determine if this is an underdog pick
            // Spread: underdog gets + points. ML: positive odds = underdog, negative = favorite
            const isUnderdogPick =
              (p.type === 'spread' && p.pick.includes('+')) ||
              (p.type === 'moneyline' && p.odds != null && Number(p.odds) > 0);

            const pickType = p.type === 'moneyline' ? '💰ML' : '📊SPREAD';
            const dogTag = isUnderdogPick ? '🐕DOG' : '🏆FAV';
            console.log(`  ✅ PICK: ${p.pick} [${pickType}] [${dogTag}]`);

            return true;
          });

          console.log(`\n[${config.name}] ${qualifiedPicks.length} picks ready for filtering`)

          // ═══════════════════════════════════════════════════════════════
          // ═══════════════════════════════════════════════════════════════
          // STORE PICKS — Gary's output is final (no sport post-filters)
          // ═══════════════════════════════════════════════════════════════
          const finalPicks = qualifiedPicks;

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

      const pickCount = sportPicks.length;

      summary[config.name] = {
        games: finalGames.length,
        picks: pickCount,
        stored: storedPicksCount,
        filtered: filteredOutCount,
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