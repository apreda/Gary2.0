/**
 * Gary Picks Service - Fully Integrated
 * Handles MLB (normal + props), NBA, and NHL pick generation and storage
 */
import { makeGaryPick } from './garyEngine.js';
import { oddsService } from './oddsService.js';
import { supabase, storeDailyPicks } from '../supabaseClient.js';
import { apiSportsService } from './apiSportsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { nhlPlayoffService } from './nhlPlayoffService.js';
import { picksService as enhancedPicksService } from './picksService.enhanced.js';
import { combinedMlbService } from './combinedMlbService.js';
import { mlbPicksGenerationService } from './mlbPicksGenerationService.js';
import { openaiService } from './openaiService.js';
import { getESTDate } from '../utils/dateUtils.js';
import { generateNBAPicks } from './nbaPicksHandler.js';
import { generateMLBPicks } from './mlbPicksHandler.js';
import { generateNHLPicks } from './nhlPicksHandler.js';
import { generateNFLPicks } from './nflPicksHandler.js';
import { generateWNBAPicks } from './wnbaPicksHandler.js';
import { generateNCAAFPicks } from './ncaafPicksHandler.js';
import { generateNCAABPicks } from './ncaabPicksHandler.js';

// Global processing state to prevent multiple simultaneous generations
let isCurrentlyGeneratingPicks = false;
let isProcessingNHL = false;
let isProcessingNBA = false;
let isProcessingMLB = false;
let isProcessingNFL = false;
let isProcessingWNBA = false;
let isProcessingNCAAF = false;
let isProcessingNCAAB = false;
let isStoringPicks = false;
let lastGenerationTime = 0;
const GENERATION_COOLDOWN = 30 * 1000; // 30 seconds

// Add deduplication and processing locks to prevent repetitive processing
const processedGames = new Set();
const processingLocks = new Map();
const apiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Process a game only once with enhanced locking mechanism
 * @param {string} gameId - Unique game identifier
 * @param {Function} processingFunction - Function to process the game
 * @returns {Promise} - Processing result or null if already processed
 */
const processGameOnce = async (gameId, processingFunction) => {
  // Create a unique session key to prevent cross-session duplicates (using EST date)
  const sessionKey = `${gameId}-${getESTDate()}`;
  
  if (processedGames.has(sessionKey)) {
    console.log(`🔄 Game ${gameId} already processed today, skipping...`);
    return null;
  }
  
  if (processingLocks.has(sessionKey)) {
    console.log(`🔄 Game ${gameId} currently being processed, waiting...`);
    return processingLocks.get(sessionKey);
  }
  
  const processingPromise = (async () => {
    console.log(`🎯 Processing game ${gameId} for the first time today`);
    const result = await processingFunction();
    return result;
  })();
  
  processingLocks.set(sessionKey, processingPromise);
  
  try {
    const result = await processingPromise;
    processedGames.add(sessionKey);
    console.log(`✅ Successfully processed game ${gameId}`);
    return result;
  } catch (error) {
    console.error(`❌ Error processing game ${gameId}:`, error);
    throw error;
  } finally {
    processingLocks.delete(sessionKey);
  }
};

/**
 * Cached API call to prevent duplicate requests
 * @param {string} key - Cache key
 * @param {Function} apiFunction - Function to call API
 * @returns {Promise} - Cached or fresh API result
 */
const cachedApiCall = async (key, apiFunction) => {
  const cached = apiCache.get(key);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`🔄 Using cached data for ${key}`);
    return cached.data;
  }

  console.log(`🔄 Making fresh API call for ${key}`);
  const data = await apiFunction();
  apiCache.set(key, { data, timestamp: Date.now() });
  return data;
};

// Helper: Checks if team names match (handles small variations)
function _teamNameMatch(team1, team2) {
  if (!team1 || !team2) return false;
  const clean1 = team1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const clean2 = team2.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean1 === clean2 || clean1.includes(clean2) || clean2.includes(clean1);
}

// Helper: Ensures valid Supabase session
async function ensureValidSupabaseSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Helper: Check if picks for today exist with enhanced validation
async function checkForExistingPicks(dateString) {
  await ensureValidSupabaseSession();
  const { data, error } = await supabase
    .from('daily_picks')
    .select('id, picks')
    .eq('date', dateString)
    .limit(1);
  
  if (error) {
    console.error('Error checking for existing picks:', error);
    return false;
  }
  
  // Check if we have valid picks data
  if (data && data.length > 0 && data[0].picks) {
    const picks = Array.isArray(data[0].picks) ? data[0].picks : JSON.parse(data[0].picks || '[]');
    console.log(`📊 Found existing picks for ${dateString}: ${picks.length} picks`);
    return picks.length > 0;
  }
  
  return false;
}

// Helper: Store picks in database
async function storeDailyPicksInDatabase(picks) {
  if (!picks || !Array.isArray(picks) || picks.length === 0)
    return { success: false, message: 'No picks provided' };

  // Prevent multiple simultaneous storage operations
  if (isStoringPicks) {
    console.log('🛑 Picks are already being stored, skipping duplicate storage operation');
    return { success: false, message: 'Storage already in progress' };
  }

  isStoringPicks = true;
  console.log(`🗄️ Starting storage operation for ${picks.length} picks`);

  // EST date for today in YYYY-MM-DD
  const now = new Date();
  const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
  const estDate = new Intl.DateTimeFormat('en-US', options).format(now);
  const [month, day, year] = estDate.split('/');
  const currentDateString = `${year}-${month}-${day}`;
  
  console.log(`Storing picks for date: ${currentDateString}`);

  // Helper to parse confidence safely
  const parseConfidenceValue = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  // Simplify pick structure to only include essential fields from OpenAI output
  const validPicks = picks.map((pick, index) => {
    // Extract the OpenAI output fields which contain the essential pick data
    let openAIOutput = null;
    
    // First try to get the data from the standardized paths
    if (pick.rawAnalysis?.rawOpenAIOutput) {
      openAIOutput = pick.rawAnalysis.rawOpenAIOutput;
    } else if (pick.analysis?.rawOpenAIOutput) {
      openAIOutput = pick.analysis.rawOpenAIOutput;
    }
    
    // Generate a consistent pick ID for this pick
    const generatePickId = (pickData, date, index) => {
      const components = [
        pickData.league || 'sport',
        pickData.homeTeam || pickData.awayTeam || 'teams',
        pickData.pick || 'pick',
        index.toString() // Add index to ensure uniqueness
      ];
      
      // Create a simple hash from the components
      const pickString = components.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
      
      return `pick-${date}-${pickString}`;
    };
    
    // If we found the OpenAI output, return just those fields
    if (openAIOutput) {
      const pickData = {
        pick: openAIOutput.pick || pick.pick,
        time: openAIOutput.time || pick.time,
        type: openAIOutput.type || pick.type,
        league: openAIOutput.league || pick.league,
        revenge: openAIOutput.revenge || false,
        awayTeam: openAIOutput.awayTeam || pick.awayTeam,
        homeTeam: openAIOutput.homeTeam || pick.homeTeam,
        momentum: openAIOutput.momentum || 0,
        rationale: openAIOutput.rationale || pick.rationale,
        trapAlert: openAIOutput.trapAlert || false,
        confidence: openAIOutput.confidence || pick.confidence,
        superstition: openAIOutput.superstition || false,
        // Include sport for filtering
        sport: pick.sport
      };
      
      // Add the generated pick ID
      pickData.pick_id = generatePickId(pickData, currentDateString, index);
      
      return pickData;
    }
    
    // Fallback to original fields if we can't find the OpenAI output
    const pickData = {
      pick: pick.pick,
      time: pick.time,
      type: pick.type || 'moneyline',
      league: pick.league || 'NBA',
      revenge: false,
      awayTeam: pick.awayTeam,
      homeTeam: pick.homeTeam,
      momentum: 0,
      rationale: pick.rationale,
      trapAlert: false,
      confidence: pick.confidence || 0,
      superstition: false,
      sport: pick.sport
    };
    
    // Add the generated pick ID
    pickData.pick_id = generatePickId(pickData, currentDateString, index);
    
    return pickData;
  }).filter(pick => {
    // Filter out picks with confidence below 0.60 threshold (all sports)
    // Robust confidence parsing (handles string values like "0.66")
    let confidence = 0;
    if (typeof pick.confidence === 'number') {
      confidence = pick.confidence;
    } else if (typeof pick.confidence === 'string') {
      const parsed = parseFloat(pick.confidence);
      confidence = Number.isFinite(parsed) ? parsed : 0;
    }
    const sport = pick.sport || '';
    const passesThreshold = confidence >= 0.50;
    if (passesThreshold) console.log(`✅ Including ${sport} pick with confidence ${confidence} (>= 0.50)`);
    else console.log(`❌ FILTERING OUT ${sport} pick with confidence ${confidence} (< 0.50)`);
    return passesThreshold;
  });

  console.log(`After confidence filtering (>= 0.50 across all sports), ${validPicks.length} picks remaining from ${picks.length} total`);

  // If no valid picks, exit early
  if (validPicks.length === 0) {
    console.warn('No picks to store after field mapping');
    isStoringPicks = false;
    console.log('🔓 Storage lock released');
    return { success: false, message: 'No picks to store' };
  }

  // Create append/merge storage: fetch existing row, merge, then upsert
  await ensureValidSupabaseSession();
  try {
    const { data: existingRows, error: selectError } = await supabase
      .from('daily_picks')
      .select('id, picks')
      .eq('date', currentDateString)
      .limit(1);

    if (selectError) {
      console.error('Error selecting existing daily_picks row:', selectError);
    }

    // Prepare merged picks
    let mergedPicks = [];
    let fallbackPicksRef = validPicks;
    if (existingRows && existingRows.length > 0) {
      const existing = existingRows[0];
      const existingPicks = Array.isArray(existing.picks)
        ? existing.picks
        : (() => { try { return JSON.parse(existing.picks || '[]'); } catch { return []; } })();

      // Deduplicate by pick_id if present, else by tuple (league, homeTeam, awayTeam, pick)
      const dedupeKey = (p) => p.pick_id || `${p.league || ''}|${p.homeTeam || ''}|${p.awayTeam || ''}|${p.pick || ''}`;
      const seen = new Set(existingPicks.map(dedupeKey));
      const toAppend = validPicks.filter(p => {
        const key = dedupeKey(p);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Apply cap for props only on the combined set (keep existing first)
      const combined = [...existingPicks, ...toAppend];
      const isPropPick = (p) => (p?.type === 'prop' || p?.pickType === 'prop');
      const props = combined.filter(isPropPick);
      const nonProps = combined.filter(p => !isPropPick(p));
      const cappedProps = props.slice(0, 10);
      mergedPicks = [...nonProps, ...cappedProps];
      fallbackPicksRef = mergedPicks;

      console.log(`Merging ${toAppend.length} new picks into existing ${existingPicks.length}; final size ${mergedPicks.length}`);

      // Try JSON update
      const { error: updateError } = await supabase
        .from('daily_picks')
        .update({ picks: mergedPicks })
        .eq('id', existing.id);

      if (updateError) {
        console.warn('JSON update failed, retrying with stringified picks:', updateError.message);
        const { error: updateAltError } = await supabase
          .from('daily_picks')
          .update({ picks: JSON.stringify(mergedPicks) })
          .eq('id', existing.id);
        if (updateAltError) {
          throw new Error(`Failed to append picks: ${updateAltError.message}`);
        }
      }

      console.log('✅ Successfully appended picks to existing daily_picks row');
      return { success: true, count: validPicks.length, mode: 'append' };
    } else {
      // No existing row: insert new
      // Cap total prop picks to 10 without changing existing filters
      const isPropPick = (p) => (p?.type === 'prop' || p?.pickType === 'prop');
      const propOnly = validPicks.filter(isPropPick);
      const nonProps = validPicks.filter(p => !isPropPick(p));
      const cappedProps = propOnly.slice(0, 10);
      const finalPicks = [...nonProps, ...cappedProps];
      fallbackPicksRef = finalPicks;

      const pickData = { date: currentDateString, picks: finalPicks };
      console.log('Inserting new daily_picks row');

      const { error: insertError } = await supabase
        .from('daily_picks')
        .insert(pickData);

      if (insertError) {
        console.error('Insert failed, retrying with stringified picks:', insertError.message);
        const { error: insertAltError } = await supabase
          .from('daily_picks')
          .insert({
            date: currentDateString,
            picks: JSON.stringify(finalPicks)
          });
        if (insertAltError) {
          throw new Error(`Failed to store picks: ${insertAltError.message}`);
        }
        console.log('✅ Successfully stored picks using alternative approach');
        return { success: true, count: finalPicks.length, method: 'alternative' };
      }

      console.log(`✅ Successfully stored ${finalPicks.length} picks in database (props capped at ${cappedProps.length}/10)`);
      return { success: true, count: finalPicks.length };
    }
  } catch (error) {
    console.error('❌ Error storing picks:', error);
    // Final fallback: use service-role direct REST helper (bypasses RLS)
    try {
      const fb = await storeDailyPicks(currentDateString, validPicks);
      if (fb?.success) {
        console.log('✅ Stored picks via service-role REST fallback');
        return { success: true, count: validPicks.length, method: 'service-role' };
      }
      throw new Error(fb?.message || 'Unknown REST fallback failure');
    } catch (restError) {
      console.error('❌ REST fallback also failed:', restError);
      throw new Error(`Failed to store picks: ${error.message}`);
    }
  } finally {
    isStoringPicks = false;
    console.log('🔓 Storage lock released');
  }
}

// Note: Regular season stats removed - playoffs only for NBA and NHL

// The core pick generator function
async function generateDailyPicks() {
  // Global deduplication check
  const now = Date.now();
  if (isCurrentlyGeneratingPicks) {
    console.log('🛑 Picks already being generated, skipping duplicate request...');
    return [];
  }
  
  if (now - lastGenerationTime < GENERATION_COOLDOWN) {
    console.log(`🛑 Generation cooldown active (${Math.round((GENERATION_COOLDOWN - (now - lastGenerationTime)) / 1000)}s remaining), skipping...`);
    return [];
  }
  
  isCurrentlyGeneratingPicks = true;
  lastGenerationTime = now;
  console.log('🚀 STARTING DAILY PICKS GENERATION - Global lock acquired');
  
  try {
    const sportsToAnalyze = [
      'basketball_nba',
      'baseball_mlb',
      'icehockey_nhl',
      'americanfootball_nfl',
      'basketball_wnba',
      'americanfootball_ncaaf',
      'basketball_ncaab'
    ];
    let allPicks = [];

    for (const sport of sportsToAnalyze) {
      let sportPicks = [];
      
      // Sport-specific processing locks to prevent duplication
      if (sport === 'baseball_mlb' && isProcessingMLB) {
        console.log('🛑 MLB picks already being processed, skipping...');
        continue;
      }
      if (sport === 'basketball_nba' && isProcessingNBA) {
        console.log('🛑 NBA picks already being processed, skipping...');
        continue;
      }
      if (sport === 'icehockey_nhl' && isProcessingNHL) {
        console.log('🛑 NHL picks already being processed, skipping...');
        continue;
      }
      if (sport === 'americanfootball_nfl' && isProcessingNFL) {
        console.log('🛑 NFL picks already being processed, skipping...');
        continue;
      }
      if (sport === 'basketball_wnba' && isProcessingWNBA) {
        console.log('🛑 WNBA picks already being processed, skipping...');
        continue;
      }
      if (sport === 'americanfootball_ncaaf' && isProcessingNCAAF) {
        console.log('🛑 NCAAF picks already being processed, skipping...');
        continue;
      }
      if (sport === 'basketball_ncaab' && isProcessingNCAAB) {
        console.log('🛑 NCAAB picks already being processed, skipping...');
        continue;
      }
      
      if (sport === 'baseball_mlb') {
        isProcessingMLB = true;
        sportPicks = await generateMLBPicks();
        isProcessingMLB = false;
      } else if (sport === 'basketball_nba') {
        isProcessingNBA = true;
        sportPicks = await generateNBAPicks();
        isProcessingNBA = false;
      } else if (sport === 'icehockey_nhl') {
        isProcessingNHL = true;
        sportPicks = await generateNHLPicks();
        isProcessingNHL = false;
      } else if (sport === 'americanfootball_nfl') {
        isProcessingNFL = true;
        sportPicks = await generateNFLPicks();
        isProcessingNFL = false;
      } else if (sport === 'basketball_wnba') {
        isProcessingWNBA = true;
        sportPicks = await generateWNBAPicks();
        isProcessingWNBA = false;
      } else if (sport === 'americanfootball_ncaaf') {
        isProcessingNCAAF = true;
        sportPicks = await generateNCAAFPicks();
        isProcessingNCAAF = false;
      } else if (sport === 'basketball_ncaab') {
        isProcessingNCAAB = true;
        sportPicks = await generateNCAABPicks();
        isProcessingNCAAB = false;
      }

      // Add for this sport
      allPicks.push(...sportPicks);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Store and return
    await storeDailyPicksInDatabase(allPicks);
    console.log('✅ DAILY PICKS GENERATION COMPLETED - Releasing global lock');
    return allPicks;
  } catch (error) {
    console.error('❌ DAILY PICKS GENERATION FAILED - Releasing global lock:', error);
    throw error;
  } finally {
    isCurrentlyGeneratingPicks = false;
    // Release all sport-specific locks in case of error
    isProcessingMLB = false;
    isProcessingNBA = false;
    isProcessingNHL = false;
    isProcessingNFL = false;
    isProcessingWNBA = false;
    isProcessingNCAAF = false;
    isProcessingNCAAB = false;
    isStoringPicks = false;
    console.log('🔓 All processing locks released');
  }
}

/**
 * Generate Gary's thoughts on all games for the day
 * Returns spread, moneyline, and over/under picks for every game
 * @returns {Promise<Array>} - Array of games with Gary's picks
 */
async function generateWhatGaryThinks() {
  console.log('🧠 Starting What Gary Thinks generation...');
  
  try {
    const allGames = [];
    const sports = ['baseball_mlb', 'basketball_nba', 'icehockey_nhl'];
    
    for (let sportIndex = 0; sportIndex < sports.length; sportIndex++) {
      const sport = sports[sportIndex];
      
      // Add delay between sports to prevent rate limiting (except for first sport)
      if (sportIndex > 0) {
        console.log(`⏳ Adding 5s delay between sports to prevent OpenAI rate limiting...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      console.log(`🧠 Getting ${sport} games for What Gary Thinks...`);
      
      const games = await oddsService.getUpcomingGames(sport);
      
      // Get today's date in EST time zone format (YYYY-MM-DD)
      const today = new Date();
      const estOptions = { timeZone: 'America/New_York' };
      const estDateString = today.toLocaleDateString('en-US', estOptions);
      const [month, day, year] = estDateString.split('/');
      const estFormattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
      // Filter games for today only
      const todayGames = games.filter(game => {
        const gameDate = new Date(game.commence_time);
        const gameDateInEST = gameDate.toLocaleDateString('en-US', estOptions);
        const [gameMonth, gameDay, gameYear] = gameDateInEST.split('/');
        const gameFormattedDate = `${gameYear}-${gameMonth.padStart(2, '0')}-${gameDay.padStart(2, '0')}`;
        return gameFormattedDate === estFormattedDate;
      });
      
      console.log(`🧠 Found ${todayGames.length} ${sport} games for today`);
      
      for (let i = 0; i < todayGames.length; i++) {
        const game = todayGames[i];
        try {
          // Add delay between games to prevent rate limiting (except for first game)
          if (i > 0) {
            console.log(`⏳ Adding 3s delay to prevent OpenAI rate limiting...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          
          // Extract odds data
          const odds = extractOddsData(game);
          
          // Get game stats (reuse existing logic)
          const gameStats = await getGameStatsForThoughts(game, sport);
          
          // Generate Gary's picks for this game
          const garyPicks = await generateGaryPicksForGame(game, gameStats, sport);
          
          const gameData = {
            id: game.id,
            homeTeam: game.home_team,
            awayTeam: game.away_team,
            league: sport === 'baseball_mlb' ? 'MLB' : sport === 'basketball_nba' ? 'NBA' : 'NHL',
            time: formatGameTime(game.commence_time),
            odds: odds,
            garyPicks: garyPicks,
            sport: sport
          };
          
          allGames.push(gameData);
          
        } catch (error) {
          console.error(`🧠 Error processing game ${game.away_team} @ ${game.home_team}:`, error);
          
          // If it's a rate limiting error, add extra delay
          if (error.message && (error.message.includes('429') || error.message.includes('Too Many Requests'))) {
            console.log(`⏳ Rate limit detected, adding 10s delay before continuing...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
        }
      }
    }
    
    console.log(`🧠 Generated What Gary Thinks for ${allGames.length} total games`);
    return allGames;
    
  } catch (error) {
    console.error('🧠 Error generating What Gary Thinks:', error);
    throw error;
  }
}

/**
 * Extract odds data from game object
 * @param {Object} game - Game object from odds service
 * @returns {Object} - Formatted odds data
 */
function extractOddsData(game) {
  if (!game.bookmakers || game.bookmakers.length === 0) {
    return null;
  }
  
  const bookmaker = game.bookmakers[0];
  const odds = {
    spread: { home: null, away: null },
    moneyline: { home: null, away: null },
    total: { line: null, over: null, under: null }
  };
  
  bookmaker.markets?.forEach(market => {
    if (market.key === 'spreads') {
      market.outcomes?.forEach(outcome => {
        if (outcome.name === game.home_team) {
          odds.spread.home = { line: outcome.point, odds: outcome.price };
        } else if (outcome.name === game.away_team) {
          odds.spread.away = { line: outcome.point, odds: outcome.price };
        }
      });
    } else if (market.key === 'h2h') {
      market.outcomes?.forEach(outcome => {
        if (outcome.name === game.home_team) {
          odds.moneyline.home = outcome.price;
        } else if (outcome.name === game.away_team) {
          odds.moneyline.away = outcome.price;
        }
      });
    } else if (market.key === 'totals') {
      if (market.outcomes?.length >= 2) {
        odds.total.line = market.outcomes[0].point;
        market.outcomes.forEach(outcome => {
          if (outcome.name === 'Over') {
            odds.total.over = outcome.price;
          } else if (outcome.name === 'Under') {
            odds.total.under = outcome.price;
          }
        });
      }
    }
  });
  
  return odds;
}

/**
 * Get game stats for What Gary Thinks (simplified version)
 * @param {Object} game - Game object
 * @param {string} sport - Sport type
 * @returns {Object} - Game stats
 */
async function getGameStatsForThoughts(game, sport) {
  // Reuse existing stats gathering logic but simplified
  if (sport === 'baseball_mlb') {
    // Get MLB stats
    return await combinedMlbService.getComprehensiveGameData(game.home_team, game.away_team);
  } else if (sport === 'basketball_nba') {
    // Get NBA stats
    const playoffAnalysis = await ballDontLieService.getNbaPlayoffPlayerStats(
      game.home_team,
      game.away_team
    );
    return { playoffAnalysis };
  } else if (sport === 'icehockey_nhl') {
    // Get NHL stats
    const playoffAnalysis = await ballDontLieService.getComprehensiveNhlPlayoffAnalysis(
      game.home_team,
      game.away_team
    );
    return { playoffAnalysis };
  }
  
  return {};
}

/**
 * Validate logical consistency between spread and moneyline picks
 * @param {Object} picks - The picks object with spread, moneyline, and total
 * @returns {Object} - Validated and corrected picks
 */
function validatePickConsistency(picks) {
  if (!picks || !picks.spread || !picks.moneyline) {
    return picks;
  }
  
  // Check for logical inconsistency
  if (picks.spread !== picks.moneyline) {
    console.warn(`🚨 Logical inconsistency detected: ${picks.moneyline} moneyline but ${picks.spread} spread. Fixing...`);
    // Fix by making spread match moneyline (since moneyline is the primary pick)
    picks.spread = picks.moneyline;
    console.log(`✅ Fixed: Both spread and moneyline now pick ${picks.moneyline}`);
  }
  
  return picks;
}

/**
 * Generate Gary's picks for a specific game (spread, moneyline, over/under)
 * @param {Object} game - Game object
 * @param {Object} gameStats - Game statistics
 * @param {string} sport - Sport type
 * @returns {Object} - Gary's picks
 */
async function generateGaryPicksForGame(game, gameStats, sport) {
  try {
    // Create a simplified prompt for What Gary Thinks
    const systemMessage = {
      role: "system",
      content: `You are Gary the Bear, analyzing this game to make picks on spread, moneyline, and over/under.

CRITICAL: You must pick ALL THREE bet types for this game:
1. SPREAD: Pick either "home" or "away" 
2. MONEYLINE: Pick either "home" or "away"
3. TOTAL: Pick either "over" or "under"

=== LOGICAL CONSISTENCY RULES (EXTREMELY IMPORTANT) ===
Your spread and moneyline picks MUST be logically consistent:

- If you pick a team on the MONEYLINE (meaning you think they'll WIN the game), you should generally pick the SAME team on the SPREAD (unless there's a very specific reason not to)
- If you pick the HOME team moneyline, you should pick the HOME team spread
- If you pick the AWAY team moneyline, you should pick the AWAY team spread
- The only exception is if you think a team will win but not cover a large spread, but this should be rare

NEVER pick contradictory bets like:
❌ Detroit moneyline + San Francisco spread
❌ Home team moneyline + Away team spread

=== RATIONALE FORMAT ===
Write a SINGLE PARAGRAPH (2-4 sentences) in first person as Gary, directly addressing the user. Focus on the most compelling matchup dynamics and situational factors that led to your conclusions across all three bet types.

NEVER EVER mention missing or limited stats in your rationale. Do not use phrases like "with no player stats available" or "relying on league averages" or any other language that suggests data limitations. Users should never know if data is missing.

Respond in this exact JSON format:
{
  "spread": "home" or "away",
  "moneyline": "home" or "away", 
  "total": "over" or "under",
  "rationale": "A 2-4 sentence paragraph explaining your picks using expert-level analysis."
}

Base your picks on the provided stats and odds. Be decisive - you must pick a side for each bet type. Remember: logical consistency between spread and moneyline is MANDATORY.`
    };

    const userMessage = {
      role: "user",
      content: `Analyze this ${sport} game and make your picks:

GAME: ${game.away_team} @ ${game.home_team}
TIME: ${game.commence_time}

ODDS DATA:
${JSON.stringify(extractOddsData(game), null, 2)}

STATS DATA:
${JSON.stringify(gameStats, null, 2)}

Make your picks for spread, moneyline, and total.`
    };

    const response = await openaiService.generateResponse([systemMessage, userMessage], {
      temperature: 0.7,
      maxTokens: 300
    });

    // Parse the JSON response
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const picks = JSON.parse(jsonMatch[0]);
      
      // Validate logical consistency between spread and moneyline
      return validatePickConsistency(picks);
    }

    // Fallback if parsing fails
    return {
      spread: 'home',
      moneyline: 'home', 
      total: 'over',
      rationale: 'Analysis based on available team data and current betting lines.'
    };

  } catch (error) {
    console.error('Error generating Gary picks for game:', error);
    // Return default picks if error (ensuring consistency)
    return {
      spread: 'home',
      moneyline: 'home',
      total: 'over',
      rationale: 'Analysis based on available team data and current betting lines.'
    };
  }
}

/**
 * Format game time for display
 * @param {string} timeString - ISO time string
 * @returns {string} - Formatted time
 */
function formatGameTime(timeString) {
  try {
    const date = new Date(timeString);
    const options = { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true, 
      timeZone: 'America/New_York' 
    };
    const timeFormatted = new Intl.DateTimeFormat('en-US', options).format(date);
    return `${timeFormatted} EST`;
  } catch (error) {
    return 'TBD';
  }
}

// Export both styles!
const picksService = {
  generateDailyPicks,
  generateWhatGaryThinks,
  storeDailyPicksInDatabase,
  checkForExistingPicks,
  ensureValidSupabaseSession,
  validatePickConsistency,
  _teamNameMatch
};

export { processGameOnce, cachedApiCall, _teamNameMatch };
export { picksService, generateDailyPicks };
export default picksService;