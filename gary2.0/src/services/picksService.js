/**
 * Gary Picks Service - Fully Integrated
 * Handles NBA, NFL, NHL, NCAAF, NCAAB pick generation and storage
 */
import { supabase, supabaseAdmin } from '../supabaseClient.js';
import { ballDontLieService } from './ballDontLieService.js';
import { getESTDate, toESTDate } from '../utils/dateUtils.js';
import { withTransientRetry, isTransientDbError } from '../utils/transientRetry.js';

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
async function gameAlreadyHasPick(league, homeTeam, awayTeam, gameDate = null, gameId = null) {
  // Use game date if provided, otherwise today's EST date
  let currentDateString;
  if (gameDate) {
    currentDateString = gameDate;
  } else {
    const now = new Date();
    const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
    const estDate = new Intl.DateTimeFormat('en-US', options).format(now);
    const [month, day, year] = estDate.split('/');
    currentDateString = `${year}-${month}-${day}`;
  }

  await ensureValidSupabaseSession();
  // Check both the exact date AND any rows that contain this date (for combined date keys)
  const { data, error } = await supabase
    .from('daily_picks')
    .select('picks')
    .or(`date.eq.${currentDateString},date.like.%${currentDateString}%`)
    .limit(5);

  if (error || !data || data.length === 0) {
    return { exists: false, existingPick: null };
  }

  // Check ALL returned rows (may have multiple date keys)
  let allPicks = [];
  for (const row of data) {
    const rowPicks = Array.isArray(row.picks)
      ? row.picks
      : (() => { try { return JSON.parse(row.picks || '[]'); } catch { return []; } })();
    allPicks.push(...rowPicks);
  }

  // Normalize team names for comparison (lowercase, trim)
  const normalize = (str) => (str || '').toLowerCase().trim();
  const targetHome = normalize(homeTeam);
  const targetAway = normalize(awayTeam);
  const targetLeague = normalize(league);
  const targetGameId = gameId != null ? String(gameId) : null;

  // Find any existing pick for this game (non-prop picks only).
  // When a BDL game id is supplied, we require it to match — this lets MLB
  // doubleheaders coexist (same teams + date but different game IDs).
  const existingGamePick = allPicks.find(p => {
    if (p?.type === 'prop' || p?.pickType === 'prop') return false;
    const pickLeague = normalize(p?.league);
    const pickHome = normalize(p?.homeTeam);
    const pickAway = normalize(p?.awayTeam);
    if (pickLeague !== targetLeague || pickHome !== targetHome || pickAway !== targetAway) return false;
    if (targetGameId != null) {
      // Stored game picks stamp the id as bdl_game_id (run-agentic-picks);
      // accept game_id too for any rows written with the older field name.
      const rawId = p?.bdl_game_id ?? p?.game_id;
      const pickGameId = rawId != null ? String(rawId) : null;
      // If the existing pick has no game id, fall through to old teams+date match
      // (legacy picks). Once they're game-id-stamped, doubleheaders work cleanly.
      if (pickGameId != null && pickGameId !== targetGameId) return false;
    }
    return true;
  });

  if (existingGamePick) {
    console.log(`🚫 GAME ALREADY HAS PICK: ${league} ${awayTeam} @ ${homeTeam} → "${existingGamePick.pick}"`);
    return { exists: true, existingPick: existingGamePick.pick };
  }

  return { exists: false, existingPick: null };
}

/**
 * Cheap retry preflight keyed only by the provider game id.
 *
 * This is deliberately exact-ID-only: legacy rows without an id do not count,
 * and props never count as the game's published side. A read problem fails
 * open so the scheduler can continue into the normal generation/store guard
 * instead of suppressing a possibly missing pick.
 */
async function pickAlreadyStoredByGameId(league, gameDate, gameId) {
  const normalizedLeague = String(league || '').trim().toUpperCase();
  const normalizedGameId = gameId == null ? '' : String(gameId).trim();
  const rawDate = gameDate == null ? '' : String(gameDate).trim();
  let etDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;

  if (!etDate && gameDate != null) {
    const instant = new Date(gameDate);
    if (Number.isFinite(instant.getTime())) {
      etDate = instant.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    }
  }

  if (!normalizedLeague || !etDate || !normalizedGameId) {
    return {
      exists: false,
      existingPick: null,
      error: 'league, valid ET date, and game_id are required',
    };
  }

  try {
    const reader = supabaseAdmin || supabase;
    let query;
    let source;
    if (normalizedLeague === 'NFL') {
      // Noon UTC remains on the same ET civil date year-round, avoiding the
      // UTC-midnight shift when deriving the weekly ledger key.
      const [year, month, day] = etDate.split('-').map(Number);
      const anchor = new Date(Date.UTC(year, month - 1, day, 12));
      query = reader
        .from('weekly_nfl_picks')
        .select('picks')
        .eq('week_start', getNFLWeekStart(anchor))
        .eq('season', getNFLSeason(anchor))
        .limit(1);
      source = 'weekly_nfl_picks';
    } else {
      query = reader
        .from('daily_picks')
        .select('picks')
        .eq('date', etDate)
        .limit(1);
      source = 'daily_picks';
    }

    // SHORT RETRY (Aug 24 2026): on Aug 23 a Supabase outage made this read
    // fail open, so retry tiers re-ran the FULL research pipeline for games
    // whose picks were already durably stored — burning the sequential MLB
    // lane until later games' windows expired. Two quick retries ride out a
    // blip; a real outage still fails open (coverage beats cost).
    const { data, error } = await withTransientRetry(async () => {
      const res = await query;
      // Only infra errors throw (and therefore retry); contract errors
      // return as-is and keep today's fail-open shape.
      if (res.error?.message && isTransientDbError(res.error)) throw new Error(res.error.message);
      return res;
    }, { label: 'exact-ID pick preflight', delaysMs: [10_000, 20_000] }).catch((e) => ({ data: null, error: e }));
    if (error) {
      console.warn(`⚠️ Exact-ID pick preflight read failed (${source}): ${error.message || error.code || 'unknown'} — FAIL-OPEN: this game may re-run research even if its pick is already stored`);
      return { exists: false, existingPick: null, source, error: error.message || 'read failed' };
    }

    const rawPicks = data?.[0]?.picks;
    const picks = Array.isArray(rawPicks)
      ? rawPicks
      : (() => { try { return JSON.parse(rawPicks || '[]'); } catch { return []; } })();
    const existing = picks.find((pick) => {
      if (pick?.type === 'prop' || pick?.pickType === 'prop') return false;
      const pickLeague = String(pick?.league || pick?.sport || '').trim().toUpperCase();
      if (pickLeague !== normalizedLeague) return false;
      const storedId = pick?.bdl_game_id ?? pick?.game_id;
      return storedId != null && String(storedId).trim() === normalizedGameId;
    });

    if (!existing) return { exists: false, existingPick: null, source };
    return {
      exists: true,
      existingPick: existing.pick || null,
      storedPick: existing,
      source,
    };
  } catch (error) {
    console.warn(`⚠️ Exact-ID pick preflight failed open: ${error.message}`);
    return { exists: false, existingPick: null, error: error.message };
  }
}

// Helper: Store picks in database
async function storeDailyPicksInDatabase(picks, overrideDate = null, options = {}) {
  if (!picks || !Array.isArray(picks) || picks.length === 0)
    return { success: false, message: 'No picks provided' };

  // Prevent multiple simultaneous storage operations
  if (isStoringPicks) {
    console.log('🛑 Picks are already being stored, skipping duplicate storage operation');
    return { success: false, message: 'Storage already in progress' };
  }

  isStoringPicks = true;
  console.log(`🗄️ Starting storage operation for ${picks.length} picks`);

  // Use override date if provided (e.g., --date 2026-03-19 for advance picks), otherwise today EST
  let currentDateString;
  if (overrideDate) {
    currentDateString = overrideDate;
  } else {
    const now = new Date();
    const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
    const estDate = new Intl.DateTimeFormat('en-US', options).format(now);
    const [month, day, year] = estDate.split('/');
    currentDateString = `${year}-${month}-${day}`;
  }

  console.log(`Storing picks for date: ${currentDateString}`);

  // (parseConfidenceValue deleted Sep 1 2026 — an uncalled helper whose
  // null→0 coercion was the exact fabricated-conviction class the Jul 30
  // ruling banned.)

  // ONE mapper (Aug 24 2026): the old `rawGeminiOutput` extraction branch
  // that sat here was a reader for a shape NOTHING has produced since the
  // orchestrator era began — `rawAnalysis` is a string, so the branch could
  // never fire and every pick always flowed through the mapper below. Dead
  // branch deleted with the vendor; this is the pick's one road to the DB.
  const validPicks = picks.map((pick, index) => {
    
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
      // NEVER coerce a missing conviction to a number (founder, Jul 30): the
      // old `|| 0` here silently defeated the runner's honest null — a stored
      // 0 reads as a STATED zero conviction. Null stays null.
      confidence: pick.confidence ?? null,
      superstition: false,
      sport: pick.sport,
      // Include agentic system fields
      statsUsed: pick.statsUsed || [],
      statsData: pick.statsData || [], // Full stat values for Tale of the Tape
      injuries: pick.injuries || null, // Structured injury data from BDL
      commence_time: pick.commence_time || null,
      gameTime: pick.gameTime || null,
      // Agentic NCAAF picks take this fallback mapping branch. Keep the sealed
      // same-book receipt without adding any keys to MLB/NBA rows.
      ...(pick.published_at ? { published_at: pick.published_at } : {}),
      ...(pick.published_market ? { published_market: pick.published_market } : {}),
      ...(pick.season_type != null ? { season_type: pick.season_type } : {}),
      ...(pick.homeTeamAbbreviation ? { homeTeamAbbreviation: pick.homeTeamAbbreviation } : {}),
      ...(pick.awayTeamAbbreviation ? { awayTeamAbbreviation: pick.awayTeamAbbreviation } : {}),
      // BDL game id — disambiguates doubleheaders for dedupe
      game_id: pick.bdl_game_id ?? pick.game_id ?? null,
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
      // Odds data (spread, moneyline, total)
      spread: pick.spread ?? null,
      spreadOdds: pick.spreadOdds ?? null,
      bestLineBook: pick.bestLineBook || null,
      moneylineHome: pick.moneylineHome ?? null,
      moneylineAway: pick.moneylineAway ?? null,
      total: pick.total ?? null,
      // Soccer (World Cup) fields
      soccer_match_id: pick.soccer_match_id ?? null,
      soccer_three_way_ml: pick.soccer_three_way_ml ?? null,
      soccer_competition: pick.soccer_competition || null,
      soccer_stage: pick.soccer_stage || null,
      soccer_round: pick.soccer_round || null,
      soccer_group: pick.soccer_group || null,
      goal_line: pick.goal_line ?? null,
      handicap: pick.handicap ?? null,
      // Multi-book sportsbook odds comparison (for iOS app display)
      sportsbook_odds: pick.sportsbook_odds || null,
      // World Cup side/total tag — carry it through (was being dropped → null).
      pick_category: pick.pick_category ?? null,
      // (rationale_plain REMOVED — founder ruling, Aug 12: one organic
      // rationale, no middleman.)
      // Contract-era hash. (Historical: a dead twin branch above this mapper
      // ate field additions three times — sha, blind-split, winners — before
      // it was excised Aug 24. There is ONE mapper now; new fields go here.)
      prompt_sha: pick.prompt_sha || null,
      // THE BLIND SPLIT read (Aug 5): the whitelist ate both fields on day
      // one (Cubs/Astros stored readless) — the trap's third catch.
      read_winner: pick.read_winner ?? null,
      game_read: pick.game_read ?? null,
      // THE BLIND REPORT (Aug 12): both win paths.
      path_away: pick.path_away ?? null,
      path_home: pick.path_home ?? null,
      // THE CASE ORDER (Sep 2 2026): which case was written last.
      case_last: pick.case_last ?? null,
      // Historical diagnostics only; exact-ticket admission lives in
      // winners_board. These fields never qualify a ticket.
      winners_class: pick.winners_class ?? null,
      winners_score: pick.winners_score ?? null,
      // Which brain produced this pick — fields absent from this object never reach the DB.
      model: pick.model || null
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

  // Independent scheduler children are separate processes, so an in-memory
  // mutex and a JavaScript read/merge/upsert cannot protect this shared JSON
  // row. Every daily sport uses the same Postgres transaction instead. This
  // keeps MLB/NBA behavior intact while allowing NCAAF games to finish in
  // parallel without replacing each other (or a simultaneous MLB pick).
  try {
    const sanitizedPicks = JSON.parse(JSON.stringify(validPicks));
    const missingNcaafGameId = sanitizedPicks.find((pick) => {
      const league = String(pick?.league || pick?.sport || '').trim().toUpperCase();
      const isProp = pick?.type === 'prop' || pick?.pickType === 'prop';
      const isSoccer = pick?.soccer_match_id != null && String(pick.soccer_match_id).trim() !== '';
      const gameId = pick?.bdl_game_id ?? pick?.game_id;
      return league === 'NCAAF' && !isProp && !isSoccer
        && (gameId == null || String(gameId).trim() === '');
    });
    if (missingNcaafGameId) {
      return {
        success: false,
        error: `NCAAF atomic storage requires bdl_game_id or game_id (${missingNcaafGameId.awayTeam || '?'} @ ${missingNcaafGameId.homeTeam || '?'})`,
      };
    }

    // TRANSIENT RETRY (Aug 24 2026, Aug 23 outage post-mortem): the pick in
    // hand cost ~$0.30 and 5–9 minutes of research; this RPC is one idempotent
    // HTTP call. A Cloudflare 525 / gateway timeout / statement timeout gets
    // ~4 more attempts over ~3 minutes before we declare failure — the session
    // is re-validated per attempt in case the token expired mid-outage.
    // There is intentionally no direct-table fallback. Any client-side
    // read/merge/upsert can lose a concurrent sport's write, which is worse
    // than failing this run loudly and retrying it.
    const data = await withTransientRetry(async () => {
      await ensureValidSupabaseSession();
      const writer = supabaseAdmin || supabase;
      const { data: rpcData, error } = await writer.rpc('append_daily_picks_atomic', {
        p_date: currentDateString,
        p_new_picks: sanitizedPicks,
      });
      if (error) throw new Error(error.message || 'Atomic daily-picks RPC failed');
      return rpcData;
    }, { label: 'daily-picks atomic RPC', beforeRetry: options.beforeRetry || null });

    const added = Number(data?.added ?? 0);
    const skipped = Number(data?.skipped ?? 0);
    const total = Number(data?.total ?? added);
    const mode = data?.mode || 'append';
    const gameIds = Array.isArray(data?.game_ids) ? data.game_ids.map(String) : [];

    console.log(`✅ Atomically stored ${added} new daily pick(s) (${total} total; ${skipped} guard-skipped)`);
    return {
      success: true,
      count: added,
      added,
      skipped,
      total,
      game_ids: gameIds,
      mode,
    };
  } catch (error) {
    console.error('❌ Error atomically storing daily picks:', error);
    return { success: false, error: error.message };
  } finally {
    isStoringPicks = false;
    console.log('🔓 Storage lock released');
  }
}

// ==========================================
// WEEKLY NFL PICKS (persist all week)
// ==========================================

/** Get the Tuesday start of the current NFL publication week (Tue–Mon, ET). */
function getNFLWeekStart(date = new Date()) {
  const instant = new Date(date);
  const etDate = instant.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [year, month, dayOfMonth] = etDate.split('-').map(Number);
  const civil = new Date(Date.UTC(year, month - 1, dayOfMonth));
  const weekday = civil.getUTCDay(); // 0=Sun, 1=Mon, 2=Tue, etc.
  const daysSinceTuesday = (weekday - 2 + 7) % 7;
  civil.setUTCDate(civil.getUTCDate() - daysSinceTuesday);
  return civil.toISOString().slice(0, 10);
}

function getNFLSeason(date = new Date()) {
  const instant = new Date(date);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: 'numeric',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  // Preseason begins in August. Jan-Jul belongs to the season that began the
  // prior calendar year.
  return values.month >= 8 ? values.year : values.year - 1;
}

/**
 * Date-derived NFL week fallback. Provider `game.week` is authoritative and is
 * persisted whenever BDL supplies it; this is only for legacy/frozen-slate
 * rows that lack the field. August is preseason (week 1 starts on the first
 * Monday of August). Regular week 1 starts on the Thursday after Labor Day.
 */
function getNFLWeekNumber(date = new Date()) {
  const instant = new Date(date);
  const etDate = instant.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [year, month, day] = etDate.split('-').map(Number);
  const civil = new Date(Date.UTC(year, month - 1, day));
  const seasonYear = getNFLSeason(instant);

  if (year === seasonYear && month === 8) {
    const augustFirst = new Date(Date.UTC(seasonYear, 7, 1));
    const daysToMonday = (8 - augustFirst.getUTCDay()) % 7;
    const preseasonStart = new Date(augustFirst);
    preseasonStart.setUTCDate(preseasonStart.getUTCDate() + daysToMonday);
    const elapsed = Math.floor((civil.getTime() - preseasonStart.getTime()) / 86400000);
    return Math.max(1, Math.min(4, Math.floor(elapsed / 7) + 1));
  }

  const septemberFirst = new Date(Date.UTC(seasonYear, 8, 1));
  const daysToLaborDay = (8 - septemberFirst.getUTCDay()) % 7;
  const regularStart = new Date(septemberFirst);
  regularStart.setUTCDate(regularStart.getUTCDate() + daysToLaborDay + 3);
  const elapsed = Math.floor((civil.getTime() - regularStart.getTime()) / 86400000);
  return Math.max(1, Math.min(18, Math.floor(elapsed / 7) + 1));
}

/**
 * Store NFL picks in the weekly table (persists all week)
 */
async function storeWeeklyNFLPicks(picks) {
  if (!picks || !Array.isArray(picks) || picks.length === 0) {
    return { success: false, message: 'No NFL picks provided' };
  }
  
  const writer = supabaseAdmin || supabase;
  const anchorDate = new Date(picks[0]?.commence_time || Date.now());
  const weekStart = getNFLWeekStart(anchorDate);
  const weekNumber = Number(picks[0]?.week ?? getNFLWeekNumber(anchorDate));
  const season = Number(picks[0]?.season ?? getNFLSeason(anchorDate));
  
  console.log(`🏈 Storing ${picks.length} NFL picks for Week ${weekNumber} (${weekStart}), Season ${season}`);
  
  try {
    // Separate scheduler children are separate Node processes, so an in-memory
    // mutex cannot protect this shared JSON row. Let Postgres serialize the
    // append in one transaction; the RPC is service-role-only and implements
    // the same first-writer-wins publication rule by exact provider game id.
    const sanitizedPicks = JSON.parse(JSON.stringify(picks));
    const missingGameId = sanitizedPicks.find((pick) => {
      const gameId = pick?.bdl_game_id ?? pick?.game_id;
      return gameId == null || String(gameId).trim() === '';
    });
    if (missingGameId) {
      return {
        success: false,
        error: `NFL atomic storage requires bdl_game_id or game_id (${missingGameId.awayTeam || '?'} @ ${missingGameId.homeTeam || '?'})`,
      };
    }

    // TRANSIENT RETRY (Aug 24 2026): same outage armor as the daily writer —
    // a generated NFL pick never dies on one failed HTTP call.
    const data = await withTransientRetry(async () => {
      const { data: rpcData, error } = await writer.rpc('append_weekly_nfl_picks_atomic', {
        p_week_start: weekStart,
        p_week_number: weekNumber,
        p_season: season,
        p_new_picks: sanitizedPicks,
      });
      if (error) throw new Error(error.message || 'Atomic weekly-NFL RPC failed');
      return rpcData;
    }, { label: 'weekly-NFL atomic RPC' });

    const added = Number(data?.added ?? 0);
    const skipped = Number(data?.skipped ?? 0);
    const total = Number(data?.total ?? added);
    if (added === 0) {
      console.log(`🏈 All ${skipped || sanitizedPicks.length} NFL game pick(s) were already stored for this week`);
    } else {
      console.log(`✅ Atomically stored ${added} new NFL pick(s) (${total} total for week; ${skipped} guard-skipped)`);
    }
    return {
      success: true,
      count: added,
      total,
      skipped,
      game_ids: Array.isArray(data?.game_ids) ? data.game_ids.map(String) : [],
      mode: data?.mode || 'append',
    };
    
  } catch (error) {
    console.error('Error in storeWeeklyNFLPicks:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch NFL picks for the current week
 */
async function getWeeklyNFLPicks(weekStart = null, seasonOverride = null) {
  await ensureValidSupabaseSession();
  
  const targetWeek = weekStart || getNFLWeekStart();
  // NFL Season Logic: Jan-July games belong to the season that started the previous year
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-indexed
  const season = seasonOverride ?? (currentMonth <= 7 ? now.getFullYear() - 1 : now.getFullYear());
  
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
async function nflGameAlreadyHasPick(homeTeam, awayTeam, gameDate = null, gameId = null) {
  const anchor = new Date(gameDate || Date.now());
  const picks = await getWeeklyNFLPicks(getNFLWeekStart(anchor), getNFLSeason(anchor));
  const gameKey = `${homeTeam}|${awayTeam}`.toLowerCase();
  const targetId = gameId != null ? String(gameId) : null;
  
  const existing = picks.find(p => {
    const rawId = p?.bdl_game_id ?? p?.game_id;
    if (targetId != null && rawId != null) return String(rawId) === targetId;
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

/**
 * THE DESK snapshot (spec 2026-07-26): persist exactly what Gary read for one
 * pick. Non-blocking by contract — a snapshot failure logs and never touches
 * the pick flow.
 */
async function storeDeskSnapshot({ game_date, matchup, pick, desk, research_briefing = null, decision_evidence = null }) {
  try {
    if (!game_date || !matchup || !desk) return { success: false, error: 'missing fields' };
    // pick_desks is RLS-locked with no anon policies (service writes only) —
    // the anon client failed silently here for all of Jul 26.
    // The research briefing rides along (Sep 3 2026) so the notebook shadow
    // re-reads the same research instead of paying the researcher twice.
    const { error } = await (supabaseAdmin || supabase)
      .from('pick_desks')
      .upsert({ game_date, matchup, pick: pick || null, desk, research_briefing: research_briefing || null,
        decision_evidence }, { onConflict: 'game_date,matchup' });
    if (error) throw error;
    return { success: true };
  } catch (e) {
    console.warn(`   [Desk snapshot] not stored (${e.message}) — pick unaffected`);
    return { success: false, error: e.message };
  }
}

/** THE BIG GAME from the whole slate (Sep 3 2026): one row per league per day. */
async function storeWinnersBigGame(row) {
  try {
    if (!row?.game_date || !row?.league || row?.game_id == null) return { success: false, error: 'missing keys' };
    const { error } = await (supabaseAdmin || supabase)
      .from('winners_big_games')
      .upsert({ ...row, game_id: String(row.game_id), decided_at: new Date().toISOString() }, { onConflict: 'game_date,league' });
    if (error) throw error;
    return { success: true };
  } catch (e) {
    console.warn(`   [Winners] big game not stored (${e.message})`);
    return { success: false, error: e.message };
  }
}

/** The day's big game for a league, or null. Read-only; null on any failure. */
async function getWinnersBigGame(gameDate, league) {
  try {
    const { data, error } = await (supabaseAdmin || supabase)
      .from('winners_big_games')
      .select('game_id, matchup, reason')
      .eq('game_date', String(gameDate))
      .eq('league', String(league || '').toUpperCase())
      .limit(1);
    if (error || !data?.length) return null;
    return data[0];
  } catch {
    return null;
  }
}

// Export both styles!
const picksService = {
  storeDailyPicksInDatabase,
  storeTestPicks,
  storeWeeklyNFLPicks,
  storeDeskSnapshot,
  storeWinnersBigGame,
  getWinnersBigGame,
  nflGameAlreadyHasPick,
  getNFLWeekStart,
  getNFLWeekNumber,
  getNFLSeason,
  ensureValidSupabaseSession,
  pickAlreadyStoredByGameId,
};

export { processGameOnce, gameAlreadyHasPick, nflGameAlreadyHasPick, pickAlreadyStoredByGameId };
export { picksService, storeWeeklyNFLPicks, storeTestPicks, getNFLWeekStart, getNFLWeekNumber, getNFLSeason };

export default picksService;
