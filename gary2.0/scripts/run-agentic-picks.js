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
const { getVenueForHomeTeam } = await import('../src/services/venueMapping.js');
const { ballDontLieService } = await import('../src/services/ballDontLieService.js');
// Conviction filter removed - using simpler thesis-based filtering + confidence sorting
// ═══════════════════════════════════════════════════════════════════════════
// GARY PICK GENERATION
// ═══════════════════════════════════════════════════════════════════════════

// Configuration
// All US sports use EST-based "today" filtering - games happening today that haven't started yet
const SPORT_CONFIG = {
  nba: { key: 'basketball_nba', name: 'NBA', emoji: '🏀', useToday: true }, // Today's games (EST)
  nfl: { key: 'americanfootball_nfl', name: 'NFL', emoji: '🏈', daysAhead: 7 }, // NFL is weekly
  nhl: { key: 'icehockey_nhl', name: 'NHL', emoji: '🏒', isBeta: true, useToday: true }, // Today's games (EST)
  epl: { key: 'soccer_epl', name: 'EPL', emoji: '⚽', isBeta: true, daysAhead: 7, confidenceThreshold: 0.63 }, // EPL is weekly
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

// ═══════════════════════════════════════════════════════════════════════════
// SMART CONFIDENCE-BASED FILTERING
// ═══════════════════════════════════════════════════════════════════════════
// 
// Philosophy: Confidence is king, with smart trap detection.
// 
// Gary still uses ALL his factors (stats, injuries, spots, etc.) in analysis.
// But we filter using simple, proven rules:
// 
// 1. Confidence >= 0.62 (Gary's true conviction)
// 2. Hard rules for known traps (B2B road favorites laying points)
// 3. Skip games with too many unknowns (>2 questionable starters)
// 4. Long-term injuries (3+ weeks) are NOT edges - ignore as contradictions
// 
// Binary flags added for transparency on key factors.
// ═══════════════════════════════════════════════════════════════════════════

// Long-term injuries that should NOT count as edges or contradictions
const LONG_TERM_INJURY_KEYWORDS = [
  'out for season', 'season-ending', 'out indefinitely', 'out all year',
  'ruled out for 2025', 'not expected to return', 'out for the year'
];

/**
 * Detect if a pick has a "trap" situation that should reduce confidence
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
 * Check if an injury should be ignored (long-term, not an edge)
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

/**
 * Rank and filter picks using smart confidence-based system
 */
function rankAndFilterPicks(picks, sport) {
  if (picks.length === 0) return [];

  // Add binary flags to each pick
  const picksWithFlags = picks.map(p => ({
    ...p,
    flags: extractBinaryFlags(p),
    trap: detectTrapSituation(p, sport)
  }));

  // Sort by confidence descending (highest conviction first)
  const sortedPicks = [...picksWithFlags].sort((a, b) => {
    const confA = typeof a.confidence === 'number' ? a.confidence : 0.5;
    const confB = typeof b.confidence === 'number' ? b.confidence : 0.5;
    return confB - confA;
  });

  // Log confidence ranking with flags
  console.log(`\n[${sport}] 📊 CONFIDENCE RANKING (with flags):`);
  sortedPicks.forEach((p, i) => {
    const conf = typeof p.confidence === 'number' ? p.confidence.toFixed(2) : '?';
    const flags = p.flags;
    const flagStr = [
      flags.rest_advantage ? '💤REST' : '',
      flags.back_to_back_disadvantage ? '⚠️B2B' : '',
      flags.injury_edge ? '🏥INJ' : '',
      flags.efficiency_edge ? '📊EFF' : '',
      flags.goalie_edge ? '🥅GOALIE' : ''
    ].filter(Boolean).join(' ') || 'none';
    const trapStr = p.trap.isTrap ? `🚨TRAP: ${p.trap.trapReason}` : '';
    console.log(`   ${i + 1}. ${p.pick.padEnd(35)} Conf: ${conf} | Flags: ${flagStr} ${trapStr}`);
  });

  console.log(`\n[${sport}] ✅ Final: ${sortedPicks.length} picks (sorted by confidence)`);

  return sortedPicks;
}

// ═══════════════════════════════════════════════════════════════════════════
// DYNAMIC SLATE REVIEWER (ORGANIC FILTERING)
// ═══════════════════════════════════════════════════════════════════════════
// 
// Philosophy: Let Gary decide how many picks to release based on board quality.
// Instead of a fixed confidence threshold, we use a dynamic approach:
// 
// 1. Calculate the "Board Quality Score" (average confidence across all games)
// 2. Determine a target pick count based on games analyzed
// 3. Select the top N picks where N scales with board quality
// 4. Never release more than the "quality ceiling" even on great boards
// 
// This prevents forcing picks on bad boards and allows more picks on great ones.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dynamic Slate Reviewer - Organically determines how many picks to release
 * @param {Array} picks - All analyzed picks for a sport
 * @param {string} sport - Sport name (NBA, NHL, etc.)
 * @param {number} totalGames - Total games analyzed
 * @returns {Array} - Filtered picks based on board quality
 */
function dynamicSlateReview(picks, sport, totalGames) {
  if (picks.length === 0) return [];
  
  // Configuration per sport
  const SPORT_CONFIG = {
    'NBA': { minPicks: 1, maxPicks: 5, qualityFloor: 0.60, idealRatio: 0.35 },
    'NHL': { minPicks: 1, maxPicks: 4, qualityFloor: 0.58, idealRatio: 0.30 },
    'NFL': { minPicks: 1, maxPicks: 6, qualityFloor: 0.55, idealRatio: 0.40 },
    'NCAAB': { minPicks: 1, maxPicks: 5, qualityFloor: 0.62, idealRatio: 0.25 },
    'NCAAF': { minPicks: 0, maxPicks: 4, qualityFloor: 0.50, idealRatio: 0.50 }, // CFP - want all good picks
    'EPL': { minPicks: 1, maxPicks: 3, qualityFloor: 0.55, idealRatio: 0.30 }
  };
  
  const config = SPORT_CONFIG[sport] || { minPicks: 1, maxPicks: 4, qualityFloor: 0.55, idealRatio: 0.30 };
  
  // Step 1: Calculate Board Quality Score
  const confidences = picks.map(p => typeof p.confidence === 'number' ? p.confidence : 0.5);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const maxConfidence = Math.max(...confidences);
  const minConfidence = Math.min(...confidences);
  const confidenceSpread = maxConfidence - minConfidence;
  
  // Board quality is weighted: avg confidence (60%) + max confidence (30%) + spread penalty (10%)
  // Higher spread = less certainty about the board
  const boardQuality = (avgConfidence * 0.6) + (maxConfidence * 0.3) - (confidenceSpread * 0.1);
  
  console.log(`\n[${sport}] 📊 DYNAMIC SLATE REVIEW`);
  console.log(`   Board Stats: ${picks.length} picks, ${totalGames} games analyzed`);
  console.log(`   Confidence: Avg=${avgConfidence.toFixed(2)}, Max=${maxConfidence.toFixed(2)}, Min=${minConfidence.toFixed(2)}`);
  console.log(`   Board Quality Score: ${boardQuality.toFixed(3)}`);
  
  // Step 2: Determine target pick count based on board quality and game count
  // Base target = games * idealRatio (e.g., 9 games * 0.35 = ~3 picks)
  let baseTarget = Math.round(totalGames * config.idealRatio);
  
  // Adjust based on board quality
  // If board quality is high (>0.70), allow more picks
  // If board quality is low (<0.60), reduce picks
  let qualityMultiplier = 1.0;
  if (boardQuality >= 0.75) {
    qualityMultiplier = 1.5; // Great board - allow 50% more picks
  } else if (boardQuality >= 0.68) {
    qualityMultiplier = 1.25; // Good board - allow 25% more picks
  } else if (boardQuality < 0.58) {
    qualityMultiplier = 0.75; // Weak board - reduce picks by 25%
  } else if (boardQuality < 0.52) {
    qualityMultiplier = 0.5; // Bad board - halve the picks
  }
  
  let targetPicks = Math.round(baseTarget * qualityMultiplier);
  
  // Enforce min/max bounds
  targetPicks = Math.max(config.minPicks, Math.min(config.maxPicks, targetPicks));
  
  // NFL SMALL SLATE RULE: If fewer than 4 games, keep ALL qualified picks
  // On small NFL slates (like Saturday doubleheaders), we don't want to artificially limit
  if (sport === 'NFL' && totalGames < 4) {
    console.log(`   🏈 NFL SMALL SLATE (${totalGames} games < 4) - keeping all qualified picks`);
    targetPicks = picks.length; // Keep all picks that pass quality floor
  }
  
  console.log(`   Target Picks: ${targetPicks} (base=${baseTarget}, multiplier=${qualityMultiplier.toFixed(2)})`);
  
  // Step 3: Sort by confidence and select top N
  const sortedPicks = [...picks].sort((a, b) => {
    const confA = typeof a.confidence === 'number' ? a.confidence : 0.5;
    const confB = typeof b.confidence === 'number' ? b.confidence : 0.5;
    return confB - confA;
  });
  
  // Step 4: Apply quality floor - don't release picks below the floor even if they'd be in top N
  const selectedPicks = sortedPicks
    .slice(0, targetPicks)
    .filter(p => {
      const conf = typeof p.confidence === 'number' ? p.confidence : 0;
      if (conf < config.qualityFloor) {
        console.log(`   ⚠️ Dropped: ${p.pick} (conf ${conf.toFixed(2)} below floor ${config.qualityFloor})`);
        return false;
      }
      return true;
    });
  
  // Step 5: Log final selection
  console.log(`\n[${sport}] 🎯 SLATE SELECTION (${selectedPicks.length}/${picks.length} picks):`);
  selectedPicks.forEach((p, i) => {
    const conf = typeof p.confidence === 'number' ? p.confidence.toFixed(2) : '?';
    console.log(`   ${i + 1}. ${p.pick.padEnd(35)} Conf: ${conf}`);
  });
  
  // Log dropped picks for transparency
  const droppedPicks = sortedPicks.slice(selectedPicks.length);
  if (droppedPicks.length > 0) {
    console.log(`\n[${sport}] 📉 DROPPED (below threshold or over limit):`);
    droppedPicks.slice(0, 5).forEach((p, i) => {
      const conf = typeof p.confidence === 'number' ? p.confidence.toFixed(2) : '?';
      console.log(`   ${selectedPicks.length + i + 1}. ${p.pick.padEnd(35)} Conf: ${conf}`);
    });
    if (droppedPicks.length > 5) {
      console.log(`   ... and ${droppedPicks.length - 5} more`);
    }
  }
  
  return selectedPicks;
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

const limitArgRaw = getArgValue('--limit');
const limitPicks = limitArgRaw ? Number.parseInt(limitArgRaw, 10) : undefined;
const shouldStore = parseBoolish(getArgValue('--store'), true);
const minConfidenceOverrideRaw = getArgValue('--min-confidence') ?? getArgValue('--minConfidence');
const minConfidenceOverride = (minConfidenceOverrideRaw !== undefined && minConfidenceOverrideRaw !== null)
  ? Number.parseFloat(String(minConfidenceOverrideRaw))
  : undefined;

// --matchup flag to run a single specific game (e.g., "Bengals @ Dolphins" or "Cincinnati")
const matchupFilter = getArgValue('--matchup');
// --force flag to skip deduplication check (for re-running specific games)
const forceRerun = args.includes('--force');
// --date flag to filter games to specific date(s) (e.g., "2025-12-25" or "2025-12-25,2025-12-26")
const dateFilter = getArgValue('--date');
// --dynamic flag to enable dynamic slate review (organic pick selection based on board quality)
const useDynamicSlateReview = args.includes('--dynamic');

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
║  Advanced options:                                               ║
║    --dynamic                   (organic pick selection)          ║
║    --date 2025-12-25           (filter to specific date)         ║
║    --date 2025-12-25,2025-12-26 (multiple dates)                 ║
║    --force                     (skip deduplication)              ║
║    --min-confidence 0.65       (override confidence threshold)   ║
║    --store false               (analyze only, don't save)        ║
║                                                                  ║
║  Dynamic Slate Review (--dynamic):                               ║
║    Organically selects picks based on board quality instead      ║
║    of using fixed confidence thresholds. Gary decides how        ║
║    many picks to release based on the overall slate strength.    ║
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

  // Clear cache if --nocache flag is passed
  if (process.argv.includes('--nocache')) {
    console.log('🔄 Clearing all caches for fresh run...');
    ballDontLieService.clearCache();
    console.log('✅ Cache cleared\n');
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
        } else {
          // Default NFL week-based filtering (no --date flag)
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
        // US sports: Get TODAY's games in EST timezone (games that haven't started yet)
        // This is simple: if it's Dec 19 in EST, get all Dec 19 games that are still upcoming
        const todayEST = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD format
        const tomorrowDate = new Date(now);
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowEST = tomorrowDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        
        games = allGames?.filter(g => {
          const gameTime = new Date(g.commence_time);
          const gameDateEST = gameTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
          // Game is today in EST AND hasn't started yet
          return gameDateEST === todayEST && gameTime >= now;
        }) || [];
        
        timeLabel = `today (${todayEST})`;
        console.log(`[${config.name}] EST date filter: today=${todayEST}, found ${games.length} upcoming games`);
      } else if (config.daysAhead) {
        // Weekly sports (EPL): Use days ahead
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

      // NCAAB: Filter to TOP 10 conferences only
      // BOTH teams must be from an approved conference
      // Top 10: ACC, Big Ten, Big 12, SEC, Pac-12, Big East, AAC, A-10, Mountain West, WCC
      if (config.key === 'basketball_ncaab') {
        console.log(`[${config.name}] Filtering to Top 10 conferences only (BOTH teams must qualify)...`);
        const { ballDontLieService } = await import('../src/services/ballDontLieService.js');
        const MIN_GAMES_FOR_ANALYSIS = 5;

        // TOP 10 conference IDs from BDL (BOTH teams must be from one of these)
        // Verified via BDL API:
        //   1  = ACC (Duke, etc.)
        //   4  = AAC (Memphis, etc.)
        //   5  = A-10 (Dayton, etc.)
        //   6  = Big 12 (Kansas, etc.)
        //   7  = Big East (Villanova, etc.)
        //   10 = Big Ten (Michigan, etc.)
        //   20 = Mountain West (San Diego State, etc.)
        //   24 = SEC (Kentucky, etc.)
        //   31 = WCC (Gonzaga, etc.) - also includes remaining Pac-12 schools
        const APPROVED_CONFERENCE_IDS = new Set([
          1,   // ACC
          4,   // AAC
          5,   // A-10
          6,   // Big 12
          7,   // Big East
          10,  // Big Ten
          20,  // Mountain West
          24,  // SEC
          31   // WCC (and Pac-12 remnants)
        ]);

        // Conference ID to name mapping for logging
        const CONF_ID_NAMES = {
          1: 'ACC', 4: 'AAC', 5: 'A-10', 6: 'Big 12', 7: 'Big East',
          10: 'Big Ten', 20: 'Mountain West', 24: 'SEC', 31: 'WCC/Pac-12'
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

            // BOTH teams must be from an approved Top 10 conference
            const homeApproved = isApprovedConference(homeConfId);
            const awayApproved = isApprovedConference(awayConfId);
            
            if (!homeApproved || !awayApproved) {
              const issues = [];
              if (!homeApproved) issues.push(`${game.home_team} (${getConfName(homeConfId)})`);
              if (!awayApproved) issues.push(`${game.away_team} (${getConfName(awayConfId)})`);
              skippedNonApproved.push({ 
                game, 
                reason: `Not in Top 10: ${issues.join(', ')}` 
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
          console.log(`[${config.name}] 🚫 Skipped ${skippedNonApproved.length} games outside Top 10 conferences:`);
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
        console.log(`[${config.name}] Top 10 conference + data quality filter: ${beforeCount} → ${games.length} games`);

        // NCAAB: Filter out extreme spreads (≥14 points)
        // These are unpredictable - will the favorite keep starters in? Garbage time variance is too high.
        // Nobody can reliably predict if a team up 20+ will keep pushing or coast.
        const EXTREME_SPREAD_THRESHOLD = 14;
        const beforeSpreadFilter = games.length;
        const extremeSpreadGames = [];

        games = games.filter(game => {
          // Extract spread from bookmakers
          const bookmakers = game.bookmakers || [];
          let spread = null;

          for (const bookmaker of bookmakers) {
            const markets = bookmaker?.markets || [];
            const spreadMarket = markets.find(m => m.key === 'spreads');
            if (spreadMarket?.outcomes?.length) {
              // Get the absolute spread value (either outcome works, they're inverse)
              const outcome = spreadMarket.outcomes[0];
              if (typeof outcome?.point === 'number') {
                spread = Math.abs(outcome.point);
                break;
              }
            }
          }

          // If no spread found, include the game (rare edge case)
          if (spread === null) return true;

          // Filter out extreme spreads
          if (spread >= EXTREME_SPREAD_THRESHOLD) {
            extremeSpreadGames.push({ game, spread });
            return false;
          }
          return true;
        });

        if (extremeSpreadGames.length > 0) {
          console.log(`[${config.name}] ⚠️ Filtered out ${extremeSpreadGames.length} extreme spread games (≥${EXTREME_SPREAD_THRESHOLD} pts):`);
          extremeSpreadGames.slice(0, 5).forEach(({ game, spread }) => {
            console.log(`   - ${game.away_team} @ ${game.home_team} (spread: ${spread})`);
          });
          if (extremeSpreadGames.length > 5) {
            console.log(`   ... and ${extremeSpreadGames.length - 5} more`);
          }
        }
        console.log(`[${config.name}] Spread filter: ${beforeSpreadFilter} → ${games.length} games`);
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
        console.log(`[${config.name}] Matchup filter "${matchupFilter}": ${beforeMatchupFilter} → ${games.length} games`);
        if (games.length === 0) {
          console.log(`[${config.name}] ⚠️ No games found matching "${matchupFilter}"`);
        }
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

        // Run agentic analysis
        const runnerOptions = { nocache: process.argv.includes('--nocache') };
        const result = await analyzeGame(game, config.key, runnerOptions);

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
              console.log(`   Reason: Too many zero/missing stats (${zeroStatCount}/${totalCheckedStats} = ${(zeroRatio * 100).toFixed(0)}%)`);
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
            // Thesis-based classification (new filtering system)
            thesis_type: result.thesis_type || null,
            thesis_mechanism: result.thesis_mechanism || null,
            supporting_factors: result.supporting_factors || [],
            contradicting_factors: result.contradicting_factors || [],
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
            statsUsed: statsUsed, // Token names for backwards compatibility
            statsData: statsData, // Full stat data with values for Tale of the Tape
            injuries: result.injuries || null, // Structured injury data from BDL
            isBeta: config.isBeta || false, // Beta flag for sports with limited data
            dataLimitationNote: config.isBeta
              ? `${config.name} picks use supplemental web-sourced analytics. Confidence may be lower than NBA/NFL.`
              : null
          };

          // Verbose logging for thesis fields
          const majors = cleanPick.contradicting_factors?.major || [];
          const minors = cleanPick.contradicting_factors?.minor || [];
          console.log(`\n📋 THESIS DETAILS:`);
          console.log(`   Type: ${cleanPick.thesis_type || 'NOT SET'}`);
          console.log(`   Mechanism: ${cleanPick.thesis_mechanism || 'NOT SET'}`);
          console.log(`   Supporting: [${(cleanPick.supporting_factors || []).join(', ')}]`);
          console.log(`   Contradicting (MAJOR): [${majors.join(', ')}]`);
          console.log(`   Contradicting (minor): [${minors.join(', ')}]`);

          // Add to picks
          sportPicks.push(cleanPick);

          // Stop early if a pick limit is specified (counts generated picks, not games)
          picksGenerated += 1;
          if (Number.isFinite(limitPicks) && limitPicks > 0 && picksGenerated >= limitPicks) {
            console.log(`\n[${config.name}] ✅ Limit reached: generated ${picksGenerated}/${limitPicks} pick(s). Stopping early for this sport.`);
            break;
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
      if (sportPicks.length > 0) {
        if (!shouldStore) {
          console.log(`\n[${config.name}] Storage disabled (--store false). Generated ${sportPicks.length} pick(s) but will NOT write to Supabase.`);
        } else {
          console.log(`\n[${config.name}] Storing ${sportPicks.length} picks...`);

          // ═══════════════════════════════════════════════════════════════
          // SMART CONFIDENCE-BASED FILTERING
          // ═══════════════════════════════════════════════════════════════
          // Philosophy: Confidence is king, with smart trap detection
          // - Thesis types are logged but NOT used for filtering
          // - Contradictions are logged but NOT hard-filtered (context matters)
          // - Hard rules only for known statistical traps
          // ═══════════════════════════════════════════════════════════════
          
          // Sport-specific confidence thresholds (adjust as needed based on results)
          const CONFIDENCE_BY_SPORT = {
            'NBA': 0.69,    // Targeting 3-4 quality picks per night
            'NCAAF': 0,     // Store all NCAAF picks (CFP games are limited, want all analysis)
            'NCAAB': 0.72,  // Higher bar for college hoops (updated Dec 31, 2025)
            'NHL': 0.67,    // User requested 0.67 for NHL
            'NFL': 0.63,    // Week 16: 0.63 threshold (quality over quantity)
            'EPL': 0.60     // Match calibration
          };
          
          // Use override if provided, otherwise sport-specific default
          const MIN_CONFIDENCE = minConfidenceOverride ?? (CONFIDENCE_BY_SPORT[config.name] ?? 0.64);
          const MIN_CONFIDENCE_UNDERDOG = Math.min(MIN_CONFIDENCE, 0.69); // Raised from 0.60 to 0.69 per user request
          const MAX_FAVORITE_SPREAD = -10; // Filter out NBA double-digit spreads (-10.5, -11, etc.)

          const qualifiedPicks = sportPicks.filter(p => {
            const confidence = typeof p.confidence === 'number' ? p.confidence : 0;
            const majorCount = p.contradicting_factors?.major?.length || 0;
            const trap = detectTrapSituation(p, config.name);
            
            // Determine if this is an underdog pick (positive spread or plus money ML)
            const isUnderdogPick = 
              (p.type === 'spread' && p.pick.includes('+')) ||
              (p.type === 'moneyline' && p.odds && (parseInt(p.odds) >= 100 || String(p.odds).startsWith('+')));
            const effectiveMinConfidence = isUnderdogPick ? MIN_CONFIDENCE_UNDERDOG : MIN_CONFIDENCE;
            
            // 1. PASS/COIN_FLIP CHECK - Gary explicitly passed on this game
            if (p.pick === 'PASS' || p.thesis_type === 'coin_flip') {
              console.log(`  ❌ Filtered: ${p.pick || 'PASS'} (Gary passed - ${p.thesis_type || 'no clear edge'})`);
              return false;
            }

            // 2. CONFIDENCE CHECK (primary filter) - Option A: Underdogs get lower threshold
            if (confidence < effectiveMinConfidence) {
              const dogNote = isUnderdogPick ? ' (underdog threshold)' : '';
              console.log(`  ❌ Filtered: ${p.pick} (confidence ${confidence.toFixed(2)} < ${effectiveMinConfidence}${dogNote} for ${config.name})`);
              return false;
            }
            
            // 2.5 UNDERDOG BONUS LOG - highlight when underdogs pass through
            if (isUnderdogPick) {
              console.log(`  🐕 Underdog detected: ${p.pick} (conf: ${confidence.toFixed(2)}) - applying lower threshold`);
            }

            // 4. TRAP DETECTION (B2B road favorite laying points)
            if (trap.isTrap) {
              console.log(`  ⚠️ Trap Warning: ${p.pick} (${trap.trapReason}) - Gary kept it with conf ${confidence.toFixed(2)}`);
              // [AGENCY UPDATE] We no longer hard-filter traps. Gary's confidence is the final arbiter.
            }

            // [AGENCY UPDATE] Removed rigid supporting factor counts and spread limits.
            // Gary now has full agency to decide if a big spread or heavy favorite is worth the risk.
            // His confidence score reflects his organic assessment of the value and conviction.

            // 7. Filter out totals (over/under) - game picks are spread/ML only
            if (p.type === 'total') {
              console.log(`  ❌ Filtered: ${p.pick} (totals not included for game picks)`);
              return false;
            }

            // QUALIFIED! Log with context (thesis/contradictions for reference, not filtering)
            const flags = extractBinaryFlags(p);
            const flagStr = [
              flags.rest_advantage ? '💤REST' : '',
              flags.back_to_back_disadvantage ? '⚠️B2B' : '',
              flags.injury_edge ? '🏥INJ' : '',
              flags.efficiency_edge ? '📊EFF' : '',
              flags.goalie_edge ? '🥅GOALIE' : ''
            ].filter(Boolean).join(' ') || 'none';
            
            console.log(`  ✅ Qualified: ${p.pick} (conf: ${confidence.toFixed(2)}, thesis: ${p.thesis_type || 'N/A'}, flags: ${flagStr})`);
            
            // Log contradictions for awareness (not filtering)
            if (majorCount > 0) {
              console.log(`     📋 Contradictions noted: ${p.contradicting_factors.major.join(', ')}`);
            }

            return true;
          });

          // Log filtering summary
          console.log(`[${config.name}] Smart filtering: ${qualifiedPicks.length}/${sportPicks.length} picks qualified (conf >= ${MIN_CONFIDENCE}, no traps)`)

          if (qualifiedPicks.length > 0) {
            let finalPicks;
            
            if (useDynamicSlateReview) {
              // NEW: Dynamic Slate Review - Organic pick selection based on board quality
              // This replaces static confidence thresholds with board-aware selection
              console.log(`\n[${config.name}] 🎲 Using DYNAMIC SLATE REVIEW (--dynamic flag enabled)`);
              finalPicks = dynamicSlateReview(qualifiedPicks, config.name, finalGames.length);
            } else {
              // LEGACY: Quality ranking and archetype de-duplication
              // This organically reduces picks to the strongest ones
              finalPicks = rankAndFilterPicks(qualifiedPicks, config.name);
            }

            if (finalPicks.length > 0) {
              await storePicks(finalPicks);
              allPicks.push(...finalPicks);
            }
          }
        }
      }

      const sportTime = ((Date.now() - sportStartTime) / 1000).toFixed(1);
      
      // Use the same thresholds we calculated during filtering
      const SUMMARY_MIN_CONFIDENCE = minConfidenceOverride ?? (({
        'NBA': 0.69, 'NCAAF': 0, 'NCAAB': 0.72, 'NHL': 0.67, 'NFL': 0.63, 'EPL': 0.60
      })[config.name] ?? 0.64);

      // Count qualified picks - confidence-based filtering
      const qualifiedCount = sportPicks.filter(p => {
        const conf = typeof p.confidence === 'number' ? p.confidence : 0;
        const trap = detectTrapSituation(p, config.name);
        // Determine if this is an underdog pick (positive spread)
        const isUnderdogPick = 
          (p.type === 'spread' && p.spread && parseFloat(p.spread) > 0) ||
          (p.type === 'moneyline' && p.odds && (parseInt(p.odds) >= 100 || String(p.odds).startsWith('+')));
        const effectiveMin = isUnderdogPick ? Math.min(SUMMARY_MIN_CONFIDENCE, 0.60) : SUMMARY_MIN_CONFIDENCE;
        
        return conf >= effectiveMin && !trap.isTrap;
      }).length;

      summary[config.name] = {
        games: finalGames.length,
        picks: sportPicks.length,
        qualified: qualifiedCount,
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
  // DRY RUN MODE - skip storage if --dry-run flag is passed
  if (process.argv.includes('--dry-run')) {
    console.log(`🧪 DRY RUN MODE - Skipping storage of ${picks.length} picks`);
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