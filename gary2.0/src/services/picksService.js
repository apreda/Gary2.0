/**
 * Gary Picks Service - Fully Integrated
 * Handles NBA, NFL, NHL, NCAAF, NCAAB pick generation and storage
 */
import { supabase, storeDailyPicks } from '../supabaseClient.js';
import { ballDontLieService } from './ballDontLieService.js';
import { getESTDate } from '../utils/dateUtils.js';

// Storage lock to prevent concurrent writes
let isStoringPicks = false;

// Lightweight in-flight locks only (no daily dedupe so repeated runs are allowed)
const processingLocks = new Map();

/**
 * Process a game only once with enhanced locking mechanism
 * @param {string} gameId - Unique game identifier
 * @param {Function} processingFunction - Function to process the game
 * @returns {Promise} - Processing result or null if already processed
 */
const processGameOnce = async (gameId, processingFunction, opts = {}) => {
  // Allow repeated runs any time; only prevent simultaneous in-flight duplicate work
  const sessionKey = `${gameId}-${getESTDate()}`;
  const force = opts && opts.force === true;
  if (processingLocks.has(sessionKey) && !force) {
    console.log(`🔄 Game ${gameId} currently being processed, waiting...`);
    return processingLocks.get(sessionKey);
  }
  
  const processingPromise = (async () => {
    console.log(`🎯 Processing game ${gameId} (no daily dedupe)`);
    const result = await processingFunction();
    return result;
  })();
  if (!force) {
    processingLocks.set(sessionKey, processingPromise);
  }
  
  try {
    const result = await processingPromise;
    console.log(`✅ Successfully processed game ${gameId}`);
    return result;
  } catch (error) {
    console.error(`❌ Error processing game ${gameId}:`, error);
    throw error;
  } finally {
    if (!force) {
      processingLocks.delete(sessionKey);
    }
  }
};

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

/**
 * Check if a specific game already has a pick in today's database
 * This prevents picking both sides of a game (e.g., Cowboys +3 AND Lions ML)
 * @param {string} league - Sport league (e.g., 'NFL', 'NBA')
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {Promise<{exists: boolean, existingPick: string|null}>}
 */
async function gameAlreadyHasPick(league, homeTeam, awayTeam) {
  // EST date for today
  const now = new Date();
  const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
  const estDate = new Intl.DateTimeFormat('en-US', options).format(now);
  const [month, day, year] = estDate.split('/');
  const currentDateString = `${year}-${month}-${day}`;

  await ensureValidSupabaseSession();
  const { data, error } = await supabase
    .from('daily_picks')
    .select('picks')
    .eq('date', currentDateString)
    .limit(1);

  if (error || !data || data.length === 0) {
    return { exists: false, existingPick: null };
  }

  const existingPicks = Array.isArray(data[0].picks)
    ? data[0].picks
    : (() => { try { return JSON.parse(data[0].picks || '[]'); } catch { return []; } })();

  // Normalize team names for comparison (lowercase, trim)
  const normalize = (str) => (str || '').toLowerCase().trim();
  const targetHome = normalize(homeTeam);
  const targetAway = normalize(awayTeam);
  const targetLeague = normalize(league);

  // Find any existing pick for this game (non-prop picks only)
  const existingGamePick = existingPicks.find(p => {
    if (p?.type === 'prop' || p?.pickType === 'prop') return false;
    const pickLeague = normalize(p?.league);
    const pickHome = normalize(p?.homeTeam);
    const pickAway = normalize(p?.awayTeam);
    return pickLeague === targetLeague && pickHome === targetHome && pickAway === targetAway;
  });

  if (existingGamePick) {
    console.log(`🚫 GAME ALREADY HAS PICK: ${league} ${awayTeam} @ ${homeTeam} → "${existingGamePick.pick}"`);
    return { exists: true, existingPick: existingGamePick.pick };
  }

  return { exists: false, existingPick: null };
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

  // Simplify pick structure to only include essential fields from Gemini output
  const validPicks = picks.map((pick, index) => {
    // Extract the Gemini output fields which contain the essential pick data
    let geminiOutput = null;
    
    // First try to get the data from the standardized paths
    if (pick.rawAnalysis?.rawGeminiOutput) {
      geminiOutput = pick.rawAnalysis.rawGeminiOutput;
    } else if (pick.analysis?.rawGeminiOutput) {
      geminiOutput = pick.analysis.rawGeminiOutput;
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
    
    // If we found the Gemini output, return just those fields
    if (geminiOutput) {
      const pickData = {
        pick: geminiOutput.pick || pick.pick,
        time: geminiOutput.time || pick.time,
        type: geminiOutput.type || pick.type,
        odds: geminiOutput.odds || pick.odds,
        league: geminiOutput.league || pick.league,
        revenge: geminiOutput.revenge || false,
        awayTeam: geminiOutput.awayTeam || pick.awayTeam,
        homeTeam: geminiOutput.homeTeam || pick.homeTeam,
        momentum: geminiOutput.momentum || 0,
        rationale: geminiOutput.rationale || pick.rationale,
        trapAlert: geminiOutput.trapAlert || false,
        confidence: geminiOutput.confidence || pick.confidence,
        superstition: geminiOutput.superstition || false,
        // Include sport for filtering
        sport: pick.sport,
        // Include agentic system fields (CRITICAL - was missing!)
        statsUsed: pick.statsUsed || [],
        statsData: pick.statsData || [], // Full stat values for Tale of the Tape
        injuries: pick.injuries || null, // Structured injury data from BDL
        commence_time: pick.commence_time || null,
        // Venue/tournament context (for NBA Cup, neutral site games, CFP games, etc.)
        venue: pick.venue || null,
        isNeutralSite: pick.isNeutralSite || false,
        tournamentContext: pick.tournamentContext || null,
        gameSignificance: pick.gameSignificance || null,
        // CFP-specific fields for NCAAF
        cfpRound: pick.cfpRound || null,
        homeSeed: pick.homeSeed || null,
        awaySeed: pick.awaySeed || null,
        // NCAAB conference data for app filtering
        conference: pick.conference || null,
        homeConference: pick.homeConference || null,
        awayConference: pick.awayConference || null,
        // NCAAB AP Poll rankings for pick cards
        homeRanking: pick.homeRanking || null,
        awayRanking: pick.awayRanking || null,
        supporting_factors: pick.supporting_factors || [],
        contradicting_factors: pick.contradicting_factors || null,
        // Odds data (spread, moneyline, total)
        spread: pick.spread ?? null,
        spreadOdds: pick.spreadOdds ?? null,
        bestLineBook: pick.bestLineBook || null,
        moneylineHome: pick.moneylineHome ?? null,
        moneylineAway: pick.moneylineAway ?? null,
        total: pick.total ?? null,
        // Multi-book sportsbook odds comparison (for iOS app display)
        sportsbook_odds: pick.sportsbook_odds || null
      };

      // Add the generated pick ID
      pickData.pick_id = generatePickId(pickData, currentDateString, index);

      return pickData;
    }

    // Fallback to original fields if we can't find the Gemini output
    const pickData = {
      pick: pick.pick,
      time: pick.time,
      type: pick.type || 'moneyline',
      odds: pick.odds,
      league: pick.league || 'NBA',
      revenge: false,
      awayTeam: pick.awayTeam,
      homeTeam: pick.homeTeam,
      momentum: 0,
      rationale: pick.rationale,
      trapAlert: false,
      confidence: pick.confidence || 0,
      superstition: false,
      sport: pick.sport,
      // Include agentic system fields
      statsUsed: pick.statsUsed || [],
      statsData: pick.statsData || [], // Full stat values for Tale of the Tape
      injuries: pick.injuries || null, // Structured injury data from BDL
      commence_time: pick.commence_time || null,
      gameTime: pick.gameTime || null,
      // Venue/tournament context (for NBA Cup, neutral site games, CFP games, etc.)
      venue: pick.venue || null,
      isNeutralSite: pick.isNeutralSite || false,
      tournamentContext: pick.tournamentContext || null,
      gameSignificance: pick.gameSignificance || null,
      // CFP-specific fields for NCAAF
      cfpRound: pick.cfpRound || null,
      homeSeed: pick.homeSeed || null,
      awaySeed: pick.awaySeed || null,
      // NCAAB conference data for app filtering
      conference: pick.conference || null,
      homeConference: pick.homeConference || null,
      awayConference: pick.awayConference || null,
      // NCAAB AP Poll rankings for pick cards
      homeRanking: pick.homeRanking || null,
      awayRanking: pick.awayRanking || null,
      supporting_factors: pick.supporting_factors || [],
      contradicting_factors: pick.contradicting_factors || null,
      // Odds data (spread, moneyline, total)
      spread: pick.spread ?? null,
      spreadOdds: pick.spreadOdds ?? null,
      bestLineBook: pick.bestLineBook || null,
      moneylineHome: pick.moneylineHome ?? null,
      moneylineAway: pick.moneylineAway ?? null,
      total: pick.total ?? null,
      // Multi-book sportsbook odds comparison (for iOS app display)
      sportsbook_odds: pick.sportsbook_odds || null
    };

    // Add the generated pick ID
    pickData.pick_id = generatePickId(pickData, currentDateString, index);

    return pickData;
  }).filter(pick => {
    // All picks are stored regardless of confidence; sport-specific filters run before storage.
    const sport = pick.sport || '';
    let confidence = 0;
    if (typeof pick.confidence === 'number') {
      confidence = pick.confidence;
    } else if (typeof pick.confidence === 'string') {
      const parsed = parseFloat(pick.confidence);
      confidence = Number.isFinite(parsed) ? parsed : 0;
    }

    console.log(`✅ Including ${sport} pick with confidence ${confidence}`);
    return true;
  });

  console.log(`After mapping, ${validPicks.length} picks remaining from ${picks.length} total (no confidence filter)`);

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

      // GAME-LEVEL DEDUPE: Only ONE pick per game, regardless of pick type (spread/ML/etc)
      // This prevents Gary from picking both sides of a game (e.g., Cowboys +3 AND Lions ML)
      // Helper to check if a pick is a prop pick (defined once, used throughout)
      const checkIsProp = (p) => (p?.type === 'prop' || p?.pickType === 'prop');
      
      // For game picks: dedupe by game matchup only (not by the specific pick)
      // For prop picks: dedupe by player + prop to allow multiple player props per game
      const gameKey = (p) => {
        if (checkIsProp(p)) {
          // Props: allow multiple per game but dedupe by player+prop
          return `prop|${p.league || ''}|${p.player || ''}|${p.prop || p.statType || ''}`;
        }
        // Game picks: ONE per game - use homeTeam/awayTeam regardless of pick direction
        return `game|${p.league || ''}|${p.homeTeam || ''}|${p.awayTeam || ''}`;
      };
      
      const seen = new Set();
      const toAppend = validPicks.filter(p => {
        const key = gameKey(p);
        if (seen.has(key)) {
          console.log(`⚠️ BLOCKED DUPLICATE in current batch: ${key}`);
          return false;
        }
        seen.add(key);
        return true;
      });

      // Filter out existing picks that match the new ones we are about to add
      const newKeys = new Set(toAppend.map(gameKey));
      const filteredExisting = existingPicks.filter(p => !newKeys.has(gameKey(p)));

      // Apply cap for props only on the combined set (keep existing first)
      const combined = [...filteredExisting, ...toAppend];
      const props = combined.filter(checkIsProp);
      const nonProps = combined.filter(p => !checkIsProp(p));
      const cappedProps = props.slice(0, 10);
      mergedPicks = [...nonProps, ...cappedProps];
      fallbackPicksRef = mergedPicks;

      console.log(`Merging ${toAppend.length} new picks into existing ${existingPicks.length}; final size ${mergedPicks.length}`);

      // Use storeDailyPicks (service role key) to upsert merged picks
      const storeResult = await storeDailyPicks(currentDateString, mergedPicks);
      if (!storeResult.success) {
        throw new Error(`Failed to append picks: ${storeResult.error || 'unknown'}`);
      }

      console.log('✅ Successfully appended picks to existing daily_picks row');
      return { success: true, count: validPicks.length, mode: 'append' };
    } else {
      // No existing row: insert new
      // Cap total prop picks to 10 without changing existing filters
      const checkIsPropNew = (p) => (p?.type === 'prop' || p?.pickType === 'prop');
      const propOnly = validPicks.filter(checkIsPropNew);
      const nonProps = validPicks.filter(p => !checkIsPropNew(p));
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
            picks: finalPicks
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

// ==========================================
// WEEKLY NFL PICKS (persist all week)
// ==========================================

/**
 * Get the Monday of the current NFL week
 * NFL weeks run Tuesday-Monday
 */
function getNFLWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, etc.
  // Get previous Monday (or today if Monday)
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Get current NFL week number (approximate)
 * Dynamically calculates based on NFL season start (first week of September)
 */
function getNFLWeekNumber(date = new Date()) {
  // Calculate NFL season dynamically: Sep-Dec = current year, Jan-Aug = previous year
  const month = date.getMonth() + 1;
  const seasonYear = month >= 9 ? date.getFullYear() : date.getFullYear() - 1;
  // NFL season typically starts first Thursday after Labor Day (~Sep 5-11)
  // Use Sep 1 as approximation since exact date varies
  const seasonStart = new Date(`${seasonYear}-09-01`);
  const diffTime = date.getTime() - seasonStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.min(18, Math.ceil(diffDays / 7)));
}

/**
 * Store NFL picks in the weekly table (persists all week)
 */
async function storeWeeklyNFLPicks(picks) {
  if (!picks || !Array.isArray(picks) || picks.length === 0) {
    return { success: false, message: 'No NFL picks provided' };
  }
  
  await ensureValidSupabaseSession();
  
  const weekStart = getNFLWeekStart();
  const weekNumber = getNFLWeekNumber();
  
  // NFL Season Logic: Jan-July games belong to the season that started the previous year
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-indexed
  const season = currentMonth <= 7 ? now.getFullYear() - 1 : now.getFullYear();
  
  console.log(`🏈 Storing ${picks.length} NFL picks for Week ${weekNumber} (${weekStart}), Season ${season}`);
  
  try {
    // Check if we have existing picks for this week
    const { data: existingData, error: fetchError } = await supabase
      .from('weekly_nfl_picks')
      .select('picks')
      .eq('week_start', weekStart)
      .eq('season', season)
      .limit(1);
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching existing NFL picks:', fetchError);
      return { success: false, error: fetchError.message };
    }
    
    let existingPicks = existingData?.[0]?.picks || [];
    
    // Dedupe by game (homeTeam + awayTeam)
    const gameKey = (p) => `${p.homeTeam || ''}|${p.awayTeam || ''}`.toLowerCase();
    const existingGames = new Set(existingPicks.map(gameKey));
    
    const newPicks = picks.filter(p => !existingGames.has(gameKey(p)));
    
    if (newPicks.length === 0) {
      console.log('🏈 All NFL games already have picks for this week');
      return { success: true, message: 'No new picks to add', count: 0 };
    }
    
    const mergedPicks = [...existingPicks, ...newPicks];
    
    // Upsert the picks
    const { error: upsertError } = await supabase
      .from('weekly_nfl_picks')
      .upsert({
        week_start: weekStart,
        week_number: weekNumber,
        season: season,
        picks: mergedPicks,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'week_start,season'
      });
    
    if (upsertError) {
      console.error('Error storing NFL picks:', upsertError);
      return { success: false, error: upsertError.message };
    }
    
    console.log(`✅ Stored ${newPicks.length} new NFL picks (${mergedPicks.length} total for week)`);
    return { success: true, count: newPicks.length, total: mergedPicks.length };
    
  } catch (error) {
    console.error('Error in storeWeeklyNFLPicks:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch NFL picks for the current week
 */
async function getWeeklyNFLPicks(weekStart = null) {
  await ensureValidSupabaseSession();
  
  const targetWeek = weekStart || getNFLWeekStart();
  // NFL Season Logic: Jan-July games belong to the season that started the previous year
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-indexed
  const season = currentMonth <= 7 ? now.getFullYear() - 1 : now.getFullYear();
  
  try {
    const { data, error } = await supabase
      .from('weekly_nfl_picks')
      .select('picks, week_number, week_start')
      .eq('week_start', targetWeek)
      .eq('season', season)
      .limit(1);
    
    if (error) {
      console.error('Error fetching NFL picks:', error);
      return [];
    }
    
    return data?.[0]?.picks || [];
    
  } catch (error) {
    console.error('Error in getWeeklyNFLPicks:', error);
    return [];
  }
}

/**
 * Check if an NFL game already has a pick this week
 */
async function nflGameAlreadyHasPick(homeTeam, awayTeam) {
  const picks = await getWeeklyNFLPicks();
  const gameKey = `${homeTeam}|${awayTeam}`.toLowerCase();
  
  const existing = picks.find(p => {
    const pKey = `${p.homeTeam || ''}|${p.awayTeam || ''}`.toLowerCase();
    return pKey === gameKey;
  });
  
  if (existing) {
    return { exists: true, existingPick: existing.pick };
  }
  return { exists: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST PICKS STORAGE - Stores to test_daily_picks table (not displayed in app)
// ═══════════════════════════════════════════════════════════════════════════
async function storeTestPicks(picks, testName = null, testNotes = null) {
  if (!picks || !Array.isArray(picks) || picks.length === 0)
    return { success: false, message: 'No picks provided' };

  // Get current EST date
  const estDate = new Date().toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [month, day, year] = estDate.split('/');
  const currentDateString = `${year}-${month}-${day}`;

  await ensureValidSupabaseSession();
  
  try {
    // Check for existing test picks for today
    const { data: existingRows, error: selectError } = await supabase
      .from('test_daily_picks')
      .select('id, picks')
      .eq('date', currentDateString)
      .limit(1);

    if (selectError) {
      console.error('Error selecting existing test_daily_picks row:', selectError);
    }

    const existing = existingRows?.[0];
    
    if (existing) {
      // Append to existing test picks
      const existingPicks = Array.isArray(existing.picks) ? existing.picks : [];
      const mergedPicks = [...existingPicks, ...picks];
      
      const { error: updateError } = await supabase
        .from('test_daily_picks')
        .update({ 
          picks: mergedPicks,
          test_name: testName || existing.test_name,
          test_notes: testNotes || existing.test_notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (updateError) {
        throw new Error(`Failed to update test picks: ${updateError.message}`);
      }

      console.log(`✅ Successfully appended ${picks.length} picks to test_daily_picks (total: ${mergedPicks.length})`);
      return { success: true, count: picks.length, mode: 'append', total: mergedPicks.length };
    } else {
      // Insert new test picks row
      const { error: insertError } = await supabase
        .from('test_daily_picks')
        .insert({
          date: currentDateString,
          picks: picks,
          test_name: testName,
          test_notes: testNotes
        });

      if (insertError) {
        throw new Error(`Failed to insert test picks: ${insertError.message}`);
      }

      console.log(`✅ Successfully inserted ${picks.length} test picks for ${currentDateString}`);
      return { success: true, count: picks.length, mode: 'insert' };
    }
  } catch (error) {
    console.error('❌ Error storing test picks:', error.message);
    return { success: false, error: error.message };
  }
}

// Export both styles!
const picksService = {
  storeDailyPicksInDatabase,
  storeTestPicks,
  storeWeeklyNFLPicks,
  nflGameAlreadyHasPick,
  getNFLWeekStart,
  getNFLWeekNumber,
  ensureValidSupabaseSession,
};

export { processGameOnce, gameAlreadyHasPick, nflGameAlreadyHasPick };
export { picksService, storeWeeklyNFLPicks, storeTestPicks };
export default picksService;