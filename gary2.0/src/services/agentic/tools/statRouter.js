/**
 * Stat Router
 * 
 * Maps stat tokens to actual Ball Don't Lie API calls.
 * Uses BDL Season Averages (Advanced) for NBA efficiency stats.
 * Uses Gemini Grounding for live context (QB weather history, etc.)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🚨 CORE PRINCIPLES: DATA INTEGRITY & SOURCE HIERARCHY 🚨
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * RULE 1: NO FAKE ALIASES
 *   - Every stat token MUST return data that matches what the token name implies
 *   - NEVER alias a token to an unrelated fetcher
 * 
 * RULE 2: ALIASES MUST BE SEMANTICALLY EQUIVALENT
 *   - Aliases are ONLY allowed when two tokens mean the SAME thing
 * 
 * RULE 3: TRANSPARENCY OVER CONVENIENCE
 *   - Better to return "Data unavailable" than wrong data
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🏆 RULE 4: EXPLICIT DATA SOURCE MAPPING (ENGINEERED, NOT HOPED)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * We KNOW what BDL has vs doesn't have. This is ENGINEERED, not a guideline.
 * Docs: https://www.balldontlie.io/docs/
 * 
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ NBA - BDL HAS MOST STATS                                                   │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ BDL (Primary):                                                             │
 * │   - Teams, Players, Games, Standings, Box Scores, Play-by-Play            │
 * │   - Season Averages (including advanced: ORtg, DRtg, NetRtg, TS%, eFG%)   │
 * │   - Player Stats, Team Stats, Injuries                                     │
 * │                                                                             │
 * │ BDL (Scoring Type - real zone data):                                       │
 * │   - PAINT_SCORING (pct_paint, pct_midrange, pct_3pt, pct_fastbreak)      │
 * │   - MIDRANGE (same scoring type breakdown)                                │
 * │ BDL (Opponent Stats - type=opponent):                                     │
 * │   - OPP_EFG_PCT (real opponent eFG%, FG%, 3PT%)                          │
 * │   - OPP_TOV_RATE (real opponent TOV rate + TOV/game)                     │
 * │   - THREE_PT_DEFENSE (real opponent 3PT% + volume)                       │
 * │   - OPP_FT_RATE (real opponent FT rate + FTA/game)                       │
 * │   - DREB_RATE (real DREB% from advanced + opponent OREB)                 │
 * │ BDL (Defense Stats - type=defense):                                       │
 * │   - PAINT_DEFENSE (opp_pts_paint, opp_pts_fb + DRtg + blocks)           │
 * │ Gemini Grounding (no BDL source):                                        │
 * │   - LINEUP_NET_RATINGS (5-man lineup data)                               │
 * │ BDL (Player Season Averages):                                            │
 * │   - MINUTES_TREND (top 5 MPG per team from BDL season averages)         │
 * │ BDL (Defense Stats - type=defense):                                       │
 * │   - TRANSITION_DEFENSE (opp_pts_fb, opp_pts_off_tov — fast break/TOV pts)│
 * │                                                                             │
 * │ Calculated from BDL:                                                       │
 * │   - SCHEDULE_STRENGTH (from opponent records)                             │
 * │   - EFFICIENCY_TREND (L5 vs season point differential, NOT pace-adjusted) │
 * │   - BLOWOUT_TENDENCY (from game margins)                                  │
 * │   - TRAVEL_SITUATION (from team locations)                                │
 * │   - REST_SITUATION (from game dates)                                      │
 * │   - USAGE_RATES (from BDL advanced stats - usage concentration + top)     │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ NHL - BDL HAS BASICS, GEMINI FOR ADVANCED                                  │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ BDL (Primary):                                                             │
 * │   - Teams, Games, Standings, Box Scores                                   │
 * │   - Goals, Assists, Points, Plus/Minus, Shots                             │
 * │   - Power Play/Penalty Kill stats                                         │
 * │   - Goalie stats (GAA, SV%)                                               │
 * │                                                                             │
 * │ Gemini (site:naturalstattrick.com, site:moneypuck.com):                   │
 * │   - CORSI_FOR_PCT (possession - NST)                                      │
 * │   - EXPECTED_GOALS (xG - MoneyPuck/NST)                                   │
 * │   - PDO (luck indicator - NST)                                            │
 * │   - HIGH_DANGER_CHANCES (scoring chances - NST)                           │
 * │   - LUCK_INDICATORS (regression analysis)                                 │
 * │                                                                             │
 * │ Gemini (site:dailyfaceoff.com, site:leftwinglock.com):                    │
 * │   - LINE_COMBINATIONS (projected lines)                                   │
 * │                                                                             │
 * │ Calculated from BDL:                                                       │
 * │   - OVERTIME_RECORD (from game data)                                      │
 * │   - SCORING_FIRST (from period scores)                                    │
 * │   - REST_SITUATION (from game dates)                                      │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * 
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ NFL - BDL HAS TEAM STATS, GEMINI FOR ADVANCED                              │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ BDL (Primary):                                                             │
 * │   - Teams, Games, Standings                                               │
 * │   - Team Season Stats (passing/rushing yards, TDs, turnovers)            │
 * │   - Offensive EPA, Defensive EPA (basic efficiency)                       │
 * │   - Red Zone stats, Success Rate                                          │
 * │                                                                             │
 * │ Gemini (site:pff.com, site:footballoutsiders.com):                        │
 * │   - OL_RANKINGS (line grades - PFF)                                       │
 * │   - DL_RANKINGS (pass rush grades - PFF/FO)                               │
 * │   - FIELD_POSITION (DVOA - FO)                                            │
 * │                                                                             │
 * │ Gemini (site:pro-football-reference.com, site:nfl.com/stats):             │
 * │   - TIME_TO_THROW (Next Gen Stats)                                        │
 * │   - GOAL_LINE (short yardage efficiency)                                  │
 * │   - TWO_MINUTE_DRILL (end of half efficiency)                             │
 * │   - KICKING (FG% by distance)                                             │
 * │   - PRIMETIME_RECORD (historical splits)                                  │
 * │                                                                             │
 * │ Calculated from BDL:                                                       │
 * │   - TURNOVER_LUCK (from INT/fumble data)                                  │
 * │   - DIVISION_RECORD (from standings)                                      │
 * │   - REST_SITUATION (from game dates)                                      │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * 
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ NCAAB - BDL HAS BASICS, GEMINI FOR KENPOM/NET                              │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ BDL (Primary):                                                             │
 * │   - Teams, Games, Standings, Rankings (AP, Coaches)                       │
 * │   - Basic stats (FG%, 3PT%, rebounds, assists)                            │
 * │                                                                             │
 * │ Barttorvik API:                                                           │
 * │   - NCAAB_BARTTORVIK_RATINGS (AdjEM, AdjO, AdjD, Tempo)                       │
 * │   - NCAAB_CONFERENCE_STRENGTH (conference context via T-Rank)              │
 * │                                                                             │
 * │ Gemini (site:barttorvik.com):                                             │
 * │   - T-Rank, efficiency ratings                                            │
 * │                                                                             │
 * │ Gemini (site:ncaa.com):                                                   │
 * │   - NCAAB_NET_RANKING (NCAA NET)                                          │
 * │   - NCAAB_QUAD_RECORD (Quad 1-4 records)                                  │
 * │   - NCAAB_STRENGTH_OF_SCHEDULE                                            │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * 
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ NCAAF - BDL HAS BASICS, GEMINI FOR SP+/FPI                                 │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ BDL (Primary):                                                             │
 * │   - Teams, Games, Standings, Rankings                                     │
 * │   - Team Season Stats (passing/rushing yards, TDs)                        │
 * │                                                                             │
 * │ Gemini (site:espn.com):                                                   │
 * │   - NCAAF_FPI_RATINGS (ESPN FPI)                                          │
 * │   - NCAAF_SP_PLUS_RATINGS (SP+ rankings)                                  │
 * │                                                                             │
 * │ Gemini (site:footballoutsiders.com):                                      │
 * │   - Conference strength, opponent-adjusted stats                          │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * 
 * WHY THIS EXPLICIT MAPPING MATTERS:
 *   - No guessing - we KNOW the source for every stat
 *   - BDL is always preferred when available (structured, fast, reliable)
 *   - Gemini only used for stats BDL doesn't have
 *   - Gemini always uses site: restrictions to authoritative sources
 *   - Sharp bettors use these exact sources - so does Gary
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { ballDontLieService } from '../../ballDontLieService.js';
import { geminiGroundingSearch, getGroundedWeather } from '../scoutReport/scoutReportBuilder.js';
import { isGameCompleted, formatStatValue, safeStatValue } from '../sharedUtils.js';
// Highlightly stripped to venue-only — H2H now uses BDL directly
import { getNcaabVenue } from '../../highlightlyService.js';
import { nbaSeason, nhlSeason, nflSeason, ncaabSeason } from '../../../utils/dateUtils.js';
import { getTeamRatings as getBarttovikRatings } from '../../barttovikService.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXPLICIT DATA SOURCE MAPPING - What comes from where (ENGINEERED)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * These constants define EXACTLY which stats use Gemini Grounding.
 * If a token is NOT in these lists, it uses BDL (our default/preferred source).
 */

// NBA: Stats that require Gemini (BDL doesn't have zone/lineup data)
// NOTE: OPP_EFG_PCT, OPP_TOV_RATE, THREE_PT_DEFENSE, PAINT_SCORING, PAINT_DEFENSE, OPP_FT_RATE
// removed — now use real BDL opponent/defense stats (type=opponent, type=defense).
const NBA_GEMINI_TOKENS = [
  'MIDRANGE',             // Shot location data
  'LINEUP_NET_RATINGS',   // 5-man lineup performance
  // MINUTES_TREND removed — now uses real BDL player season averages (MPG)
  // TRANSITION_DEFENSE removed — now uses real BDL defense stats (type=defense: opp_pts_fb, opp_pts_off_tov)
];

// NHL: Stats that require Gemini (BDL doesn't have advanced analytics)
const NHL_GEMINI_TOKENS = [
  'CORSI_FOR_PCT',        // Possession - site:naturalstattrick.com
  'EXPECTED_GOALS',       // xG - site:moneypuck.com
  'PDO',                  // Luck indicator - site:naturalstattrick.com
  'HIGH_DANGER_CHANCES',  // Scoring chances - site:naturalstattrick.com
  'LINE_COMBINATIONS',    // Projected lines - site:dailyfaceoff.com
  'LUCK_INDICATORS',      // Regression analysis
  'SCORING_FIRST',        // First goal stats - site:hockey-reference.com
];

// NFL: Stats that require Gemini (BDL doesn't have PFF/FO/NGS grades)
const NFL_GEMINI_TOKENS = [
  'OL_RANKINGS',          // Pass block win rate - site:nextgenstats.nfl.com, site:pff.com
  'DL_RANKINGS',          // Pass rush win rate - site:nextgenstats.nfl.com, site:pff.com
  'TIME_TO_THROW',        // QB release time - site:nextgenstats.nfl.com
  'GOAL_LINE',            // Short yardage - site:pro-football-reference.com
  'TWO_MINUTE_DRILL',     // End of half - site:pro-football-reference.com
  'KICKING',              // FG% by distance - site:pro-football-reference.com
  'FIELD_POSITION',       // Return game - site:footballoutsiders.com
  'PRIMETIME_RECORD',     // Historical splits - site:pro-football-reference.com
  'FOURTH_DOWN_TENDENCY', // 4th down decisions - site:nextgenstats.nfl.com, site:pro-football-reference.com
  'SCHEDULE_CONTEXT',     // Upcoming schedule - site:nfl.com
];

// NCAAB: Stats that require Gemini (BDL doesn't have KenPom/NET)
const NCAAB_GEMINI_TOKENS = [
  // These tokens NOW use Barttorvik API (no Grounding needed):
  // NCAAB_BARTTORVIK_RATINGS, NCAAB_BARTTORVIK, NCAAB_STRENGTH_OF_SCHEDULE, NCAAB_OPPONENT_QUALITY
  // NCAAB_OFFENSIVE_RATING, NCAAB_DEFENSIVE_RATING, NCAAB_TEMPO, NET_RATING (NCAAB branch)
  'NCAAB_NET_RANKING',    // NCAA NET - site:ncaa.com (still Grounding)
  'NCAAB_QUAD_RECORD',    // Quad 1-4 records - site:ncaa.com (still Grounding)
  // NCAAB_CONFERENCE_STRENGTH — now uses Barttorvik API (no Grounding needed)
  'NCAAB_HOME_COURT_ADVANTAGE', // Home court advantage data by venue (now BDL games-based, not Grounding)
];

// NCAAF: Stats that require Gemini (BDL doesn't have SP+/FPI)
const NCAAF_GEMINI_TOKENS = [
  'NCAAF_SP_PLUS_RATINGS',    // SP+ - site:espn.com
  'NCAAF_FPI_RATINGS',        // FPI - site:espn.com
  'NCAAF_OPPONENT_ADJUSTED',  // Opponent-adjusted stats
  'NCAAF_CONFERENCE_STRENGTH', // Conference analysis
];

// Combined list for quick lookup
const ALL_GEMINI_TOKENS = new Set([
  ...NBA_GEMINI_TOKENS,
  ...NHL_GEMINI_TOKENS,
  ...NFL_GEMINI_TOKENS,
  ...NCAAB_GEMINI_TOKENS,
  ...NCAAF_GEMINI_TOKENS,
]);

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SPORT-SPECIFIC ROUTING (Same token, different source per sport)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Some tokens exist in multiple sports but use different sources:
 * 
 * RED_ZONE_OFFENSE:
 *   - NFL → BDL (has red zone data in team_season_stats)
 *   - NCAAF → Gemini (BDL doesn't have NCAAF red zone)
 * 
 * RECENT_FORM:
 *   - All sports → BDL (calculated from game results)
 * 
 * HOME_AWAY_SPLITS:
 *   - All sports → BDL (calculated from home/away game results)
 * 
 * This is NOT a fallback - it's deterministic per sport.
 * The fetcher checks the sport and routes to the correct source.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
const SPORT_SPECIFIC_ROUTING = {
  // Token: { sport: 'source' }
  RED_ZONE_OFFENSE: {
    'americanfootball_nfl': 'BDL',
    'americanfootball_ncaaf': 'GEMINI'
  },
  RED_ZONE_DEFENSE: {
    'americanfootball_nfl': 'BDL',
    'americanfootball_ncaaf': 'GEMINI'
  }
};

/**
 * Check if a token requires Gemini Grounding (not in BDL)
 * @param {string} token - The stat token
 * @returns {boolean} - True if this token uses Gemini
 */
export function isGeminiToken(token) {
  return ALL_GEMINI_TOKENS.has(token);
}

/**
 * Get the authoritative source for a Gemini token
 * @param {string} token - The stat token
 * @returns {string} - The site: restriction to use
 */
export function getAuthoritativeSource(token) {
  // NBA sources
  if (['MIDRANGE', 'LINEUP_NET_RATINGS'].includes(token)) {
    return 'site:nba.com/stats OR site:basketball-reference.com';
  }
  // MINUTES_TREND removed — now uses real BDL player season averages (MPG)
  // TRANSITION_DEFENSE now uses BDL defense stats directly — no grounding needed
  
  // NHL sources
  if (['CORSI_FOR_PCT', 'PDO', 'HIGH_DANGER_CHANCES', 'NHL_HIGH_DANGER_SV_PCT'].includes(token)) {
    return 'site:naturalstattrick.com OR site:hockey-reference.com';
  }
  if (['EXPECTED_GOALS', 'LUCK_INDICATORS', 'NHL_GSAX', 'NHL_GOALIE_RECENT_FORM'].includes(token)) {
    return 'site:moneypuck.com OR site:naturalstattrick.com';
  }
  if (token === 'LINE_COMBINATIONS') {
    return 'site:dailyfaceoff.com OR site:leftwinglock.com';
  }
  if (token === 'SCORING_FIRST') {
    return 'site:hockey-reference.com OR site:nhl.com';
  }
  
  // NFL sources
  if (['OL_RANKINGS', 'DL_RANKINGS'].includes(token)) {
    return 'site:pff.com OR site:footballoutsiders.com';
  }
  if (['TIME_TO_THROW'].includes(token)) {
    return 'site:nfl.com/stats OR site:nextgenstats.nfl.com';
  }
  if (['GOAL_LINE', 'TWO_MINUTE_DRILL', 'KICKING', 'PRIMETIME_RECORD'].includes(token)) {
    return 'site:pro-football-reference.com OR site:espn.com';
  }
  if (token === 'FIELD_POSITION') {
    return 'site:footballoutsiders.com OR site:pro-football-reference.com';
  }
  
  // NCAAB sources — tokens still using Gemini Grounding
  // (NCAAB_BARTTORVIK_RATINGS, NCAAB_BARTTORVIK, NCAAB_STRENGTH_OF_SCHEDULE, NCAAB_OPPONENT_QUALITY
  //  now use Barttorvik API directly — no Grounding needed)
  if (['NCAAB_NET_RANKING', 'NCAAB_QUAD_RECORD'].includes(token)) {
    return 'site:ncaa.com';
  }
  // NCAAB_CONFERENCE_STRENGTH — now uses Barttorvik API directly (no Grounding)
  
  // NCAAF sources
  if (['NCAAF_SP_PLUS_RATINGS', 'NCAAF_FPI_RATINGS'].includes(token)) {
    return 'site:espn.com';
  }
  if (['NCAAF_OPPONENT_ADJUSTED', 'NCAAF_CONFERENCE_STRENGTH'].includes(token)) {
    return 'site:footballoutsiders.com OR site:espn.com';
  }
  
  // Default - should not happen if token is in ALL_GEMINI_TOKENS
  return '';
}

/**
 * Generate dynamic season string for Gemini Grounding queries
 * Returns format like "2025-26" for academic year sports (college, NBA, NHL)
 * @returns {string} - Season string like "2025-26"
 */
function getCurrentSeasonString() {
  const month = new Date().getMonth() + 1; // 1-indexed
  const year = new Date().getFullYear();
  // Academic year: Aug-Dec = year-(year+1), Jan-Jul = (year-1)-year
  const startYear = month >= 8 ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear}-${String(endYear).slice(-2)}`;
}

// BDL API key for direct calls
const BDL_API_KEY = process.env.BALLDONTLIE_API_KEY;

/**
 * Main router function - fetches stats based on token
 */
// Tokens that should return N/A immediately (deprecated)
// Gemini Grounding in Scout Report provides this context instead
const DEPRECATED_TOKENS = [
  // NCAAF tokens - use Gemini Grounding instead
  'NCAAF_SP_PLUS', 'NCAAF_FPI', 'NCAAF_EPA_ADVANCED', 'NCAAF_HAVOC_RATE',
  'NCAAF_EXPLOSIVENESS', 'NCAAF_RUSHING_EFFICIENCY', 'NCAAF_PASSING_EFFICIENCY',
  'NCAAF_RED_ZONE', 'NCAAF_STRENGTH_OF_SCHEDULE', 'NCAAF_CONFERENCE_STRENGTH',
  'NCAAF_VS_POWER_OPPONENTS', 'NCAAF_TRAVEL_FATIGUE', 'NCAAF_OPPONENT_ADJUSTED'
];

export async function fetchStats(sport, token, homeTeam, awayTeam, options = {}) {
  const bdlSport = sportToBdlKey(sport);
  // Calculate current season using centralized dateUtils functions
  const normalizedSportForSeason = (sport || '').toLowerCase();
  let defaultSeason;
  if (normalizedSportForSeason.includes('nba')) {
    defaultSeason = nbaSeason();
  } else if (normalizedSportForSeason.includes('ncaab')) {
    defaultSeason = ncaabSeason();
  } else if (normalizedSportForSeason.includes('nhl')) {
    defaultSeason = nhlSeason();
  } else if (normalizedSportForSeason.includes('nfl') || normalizedSportForSeason.includes('ncaaf')) {
    defaultSeason = nflSeason();
  } else {
    // Default fallback - use NBA season logic
    defaultSeason = nbaSeason();
  }
  const season = options.season || defaultSeason;
  const normalizedSport = normalizeSportName(sport);
  
  console.log(`[Stat Router] Fetching ${token} for ${awayTeam} @ ${homeTeam} (${sport})`);
  
  // Check for deprecated tokens - return N/A immediately
  // Gemini Grounding in Scout Report provides this context instead
  const sportSpecificToken = `${normalizedSport}_${token}`;
  if (DEPRECATED_TOKENS.includes(token) || DEPRECATED_TOKENS.includes(sportSpecificToken)) {
    console.log(`[Stat Router] Skipping ${token} - deprecated token, using Gemini Grounding context instead`);
    return { 
      token, 
      sport, 
      homeValue: 'N/A (use Gemini Grounding context)', 
      awayValue: 'N/A (use Gemini Grounding context)',
      note: 'Advanced analytics provided via Gemini Grounding in Scout Report'
    };
  }
  
  try {
    // Check for sport-specific fetcher first
    let fetcher = null;
    if (FETCHERS[sportSpecificToken]) {
      fetcher = FETCHERS[sportSpecificToken];
      console.log(`[Stat Router] Using sport-specific fetcher: ${sportSpecificToken}`);
    } else {
      fetcher = FETCHERS[token];
    }
    
    if (!fetcher) {
      return { error: `Unknown stat token: ${token}`, token };
    }
    
    // Standard flow: Get team IDs from BDL first
    const teams = await ballDontLieService.getTeams(bdlSport);
    const home = findTeam(teams, homeTeam);
    const away = findTeam(teams, awayTeam);
    
    if (!home || !away) {
      return { error: `Could not find teams: ${homeTeam} or ${awayTeam}`, token };
    }
    
    const result = await fetcher(bdlSport, home, away, season, options);
    return { token, sport, ...result };
    
  } catch (error) {
    console.error(`[Stat Router] Error fetching ${token}:`, error.message);
    return { error: error.message, token };
  }
}

/**
 * Convert sport to BDL API key
 */
function sportToBdlKey(sport) {
  const mapping = {
    'NBA': 'basketball_nba',
    'NFL': 'americanfootball_nfl',
    'NCAAB': 'basketball_ncaab',
    'NCAAF': 'americanfootball_ncaaf',
    'NHL': 'icehockey_nhl'
  };
  return mapping[sport] || sport;
}

/**
 * Normalize sport name for display
 */
function normalizeSportName(sport) {
  const mapping = {
    'basketball_nba': 'NBA',
    'americanfootball_nfl': 'NFL',
    'basketball_ncaab': 'NCAAB',
    'americanfootball_ncaaf': 'NCAAF',
    'icehockey_nhl': 'NHL',
    'NBA': 'NBA',
    'NFL': 'NFL',
    'NCAAB': 'NCAAB',
    'NCAAF': 'NCAAF',
    'NHL': 'NHL'
  };
  return mapping[sport] || sport;
}

// ═══ Session-level caches: prevent duplicate BDL calls within a single game analysis ═══
// Each game analysis calls the same team stats 6-12 times via different tokens.
// These caches ensure each team's data is fetched ONCE and reused.
const _nbaBaseStatsCache = new Map();
const _nbaAdvancedStatsCache = new Map();
const _nbaOpponentStatsCache = new Map();
const _nbaDefenseStatsCache = new Map();
const _nbaTeamScoringStatsCache = new Map();

/** Clear stat caches between games */
export function clearStatRouterCache() {
  _nbaBaseStatsCache.clear();
  _nbaAdvancedStatsCache.clear();
  _nbaOpponentStatsCache.clear();
  _nbaDefenseStatsCache.clear();
  _nbaTeamScoringStatsCache.clear();
}

/**
 * Fetch NBA team SCORING stats via BDL team_season_averages (type=scoring).
 * Returns: { pct_pts_paint, pct_pts_3pt, pct_pts_fb, pct_pts_mid_range_2, pct_fga_2pt, pct_fga_3pt, ... }
 * Session-cached to avoid duplicate BDL calls within a single game analysis.
 */
async function fetchNBATeamScoringStats(teamId, season = null) {
  if (!season) {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    season = month >= 10 ? year : year - 1;
  }
  const cacheKey = `${teamId}_${season}`;
  if (_nbaTeamScoringStatsCache.has(cacheKey)) {
    return _nbaTeamScoringStatsCache.get(cacheKey);
  }

  try {
    const stats = await ballDontLieService.getTeamScoringStats(teamId, season);
    if (!stats) {
      console.warn(`[Stat Router] No team scoring stats found for team ${teamId}`);
      _nbaTeamScoringStatsCache.set(cacheKey, null);
      return null;
    }

    // BDL returns decimals (0.0-1.0); convert to display percentages
    const result = {
      pct_paint: stats.pct_pts_paint != null ? (stats.pct_pts_paint * 100).toFixed(1) + '%' : 'N/A',
      pct_midrange: stats.pct_pts_mid_range_2 != null ? (stats.pct_pts_mid_range_2 * 100).toFixed(1) + '%' : 'N/A',
      pct_3pt: stats.pct_pts_3pt != null ? (stats.pct_pts_3pt * 100).toFixed(1) + '%' : 'N/A',
      pct_fastbreak: stats.pct_pts_fb != null ? (stats.pct_pts_fb * 100).toFixed(1) + '%' : 'N/A',
      pct_ft: stats.pct_pts_ft != null ? (stats.pct_pts_ft * 100).toFixed(1) + '%' : 'N/A',
      pct_fga_2pt: stats.pct_fga_2pt != null ? (stats.pct_fga_2pt * 100).toFixed(1) + '%' : 'N/A',
      pct_fga_3pt: stats.pct_fga_3pt != null ? (stats.pct_fga_3pt * 100).toFixed(1) + '%' : 'N/A',
      pct_ast_fgm: stats.pct_ast_fgm != null ? (stats.pct_ast_fgm * 100).toFixed(1) + '%' : 'N/A',
      pct_uast_fgm: stats.pct_uast_fgm != null ? (stats.pct_uast_fgm * 100).toFixed(1) + '%' : 'N/A',
      games_played: stats.gp || 0
    };

    _nbaTeamScoringStatsCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn('[Stat Router] BDL NBA team scoring stats fetch failed:', error.message);
    // Do NOT cache errors — transient API failures should be retryable on next request
    return null;
  }
}

/**
 * Fetch NBA team advanced stats via BDL Season Averages endpoint.
 * Uses REAL team-level advanced + scoring stats from BDL.
 * Player-level data only for usage concentration analysis.
 */
async function fetchNBATeamAdvancedStats(teamId, season = null) {
  // Calculate dynamic default season: NBA starts in October
  if (!season) {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    season = month >= 10 ? year : year - 1;
  }
  // Check session cache first (same team+season fetched by multiple tokens)
  const cacheKey = `${teamId}_${season}`;
  if (_nbaAdvancedStatsCache.has(cacheKey)) {
    return _nbaAdvancedStatsCache.get(cacheKey);
  }

  try {
    // Get active players for usage concentration (player-level data)
    const playersUrl = `https://api.balldontlie.io/v1/players/active?team_ids[]=${teamId}&per_page=15`;
    const playersResp = await fetch(playersUrl, { headers: { Authorization: BDL_API_KEY } });

    if (!playersResp.ok) {
      console.warn(`[Stat Router] Failed to fetch players for team ${teamId}: ${playersResp.status}`);
      return null;
    }

    const playersJson = await playersResp.json();
    const players = playersJson.data || [];

    // Fetch REAL team-level stats + team-level scoring + player-level usage in parallel
    const topPlayerIds = players.slice(0, 10).map(p => p.id);
    const playerIdParams = topPlayerIds.map(id => `player_ids[]=${id}`).join('&');

    let teamStats = null;
    let teamScoringStats = null;
    let usageStats = [];

    try {
      const [teamResp, scoringResp, usageResp] = await Promise.all([
        // TEAM-LEVEL advanced stats (real ORtg/DRtg/NetRtg — NOT player-averaged)
        ballDontLieService.getTeamSeasonAdvanced(teamId, season),
        // TEAM-LEVEL scoring profile (real — NOT player weight-averaged)
        fetchNBATeamScoringStats(teamId, season),
        // Player-level usage (for usage concentration analysis)
        fetch(`https://api.balldontlie.io/v1/season_averages/general?season=${season}&season_type=regular&type=usage&${playerIdParams}`,
          { headers: { Authorization: BDL_API_KEY } })
      ]);

      teamStats = teamResp; // Already parsed by ballDontLieService
      teamScoringStats = scoringResp; // Already parsed by fetchNBATeamScoringStats
      if (usageResp.ok) {
        const usageJson = await usageResp.json();
        usageStats = usageJson.data || [];
      }
    } catch (err) {
      console.warn(`[Stat Router] BDL team/player stats fetch failed: ${err.message}`);
    }

    if (!teamStats) {
      console.warn(`[Stat Router] No team season averages found for team ${teamId}`);
      return null;
    }

    // Build player usage concentration from player-level data
    const playerUsages = [];

    for (const u of usageStats) {
      const usgPct = u.usg_pct || u.usage_pct || 0;
      playerUsages.push({
        name: `${u.player?.first_name || ''} ${u.player?.last_name || ''}`.trim(),
        usage: usgPct * 100,
        mins: u.min || 0
      });
    }

    // Calculate usage concentration (star-heavy vs balanced)
    playerUsages.sort((a, b) => b.usage - a.usage);
    const top2Usage = playerUsages.slice(0, 2).reduce((sum, p) => sum + p.usage, 0);
    const top3Usage = playerUsages.slice(0, 3).reduce((sum, p) => sum + p.usage, 0);

    let teamStructure = 'balanced';
    let structureNote = '';
    if (top2Usage >= 55) {
      teamStructure = 'star-heavy';
      structureNote = `Top 2 players control ${top2Usage.toFixed(0)}% of usage - offense concentrated`;
    } else if (top3Usage >= 70) {
      teamStructure = 'top-heavy';
      structureNote = `Top 3 players control ${top3Usage.toFixed(0)}% of usage`;
    } else {
      structureNote = `Balanced attack - top 3 at ${top3Usage.toFixed(0)}% combined usage`;
    }

    // Scoring profile from REAL team-level BDL endpoint (NOT player weight-averaging)
    const scoringProfile = teamScoringStats ? {
      pct_paint: teamScoringStats.pct_paint,
      pct_midrange: teamScoringStats.pct_midrange,
      pct_3pt: teamScoringStats.pct_3pt,
      pct_fastbreak: teamScoringStats.pct_fastbreak
    } : null;

    // Use REAL team-level stats from BDL team_season_averages endpoint
    const result = {
      offensive_rating: teamStats.off_rating?.toFixed?.(1) || String(teamStats.off_rating),
      defensive_rating: teamStats.def_rating?.toFixed?.(1) || String(teamStats.def_rating),
      net_rating: teamStats.net_rating?.toFixed?.(1) || String(teamStats.net_rating),
      efg_pct: teamStats.efg_pct ? (teamStats.efg_pct * 100).toFixed(1) : 'N/A',
      pace: teamStats.pace?.toFixed?.(1) || String(teamStats.pace),
      true_shooting_pct: teamStats.ts_pct ? (teamStats.ts_pct * 100).toFixed(1) : 'N/A',
      dreb_pct: teamStats.dreb_pct ? (teamStats.dreb_pct * 100).toFixed(1) : 'N/A',
      oreb_pct: teamStats.oreb_pct ? (teamStats.oreb_pct * 100).toFixed(1) : 'N/A',
      tm_tov_pct: teamStats.tm_tov_pct ? (teamStats.tm_tov_pct * 100).toFixed(1) : 'N/A',
      games_played: teamStats.gp || 0,
      players_sampled: usageStats.length,
      // Player-level: usage concentration
      usage_concentration: {
        structure: teamStructure,
        top_2_usage: top2Usage.toFixed(1) + '%',
        top_3_usage: top3Usage.toFixed(1) + '%',
        note: structureNote
      },
      // TEAM-LEVEL scoring profile from BDL (type=scoring)
      scoring_profile: scoringProfile,
      top_players: playerUsages.slice(0, 3).map(p => ({
        name: p.name,
        usage: p.usage.toFixed(1) + '%',
        mins: p.mins.toFixed(1)
      }))
    };
    _nbaAdvancedStatsCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn('[Stat Router] BDL NBA advanced stats fetch failed:', error.message);
    return null;
  }
}

/**
 * Fetch NBA Leaders for a stat type
 */
async function fetchNBALeaders(statType, season = null) {
  // Calculate dynamic default season: NBA starts in October
  if (!season) {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    // Oct(10)-Dec = currentYear, Jan-Sep = previousYear
    season = month >= 10 ? year : year - 1;
  }
  try {
    const url = `https://api.balldontlie.io/v1/leaders?stat_type=${statType}&season=${season}`;
    const resp = await fetch(url, { headers: { Authorization: BDL_API_KEY } });
    const json = await resp.json();
    return json.data || [];
  } catch (error) {
    console.warn(`[Stat Router] BDL Leaders fetch failed for ${statType}:`, error.message);
    return [];
  }
}

/**
 * Fetch NBA team BASE stats via BDL team_season_averages (type=base) endpoint.
 * Uses REAL team-level data from BDL — NOT player aggregation.
 * Also fetches player-level data for top_players list only.
 *
 * For tov_rate, uses tm_tov_pct from advanced stats (already cached) instead of
 * estimating from player aggregation.
 *
 * BDL team_season_averages types:
 * - general/base: pts, reb, ast, fgm, fga, fg_pct, fg3m, fg3a, fg3_pct, ftm, fta, ft_pct, oreb, dreb, tov
 * - general/advanced: off_rating, def_rating, net_rating, efg_pct, pace, ts_pct, tm_tov_pct, oreb_pct
 */
async function fetchNBATeamBaseStats(teamId, season = null) {
  // Calculate dynamic default season: NBA starts in October
  if (!season) {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    // Oct(10)-Dec = currentYear, Jan-Sep = previousYear
    season = month >= 10 ? year : year - 1;
  }
  // Check session cache first (same team+season fetched by multiple tokens)
  const cacheKey = `${teamId}_${season}`;
  if (_nbaBaseStatsCache.has(cacheKey)) {
    return _nbaBaseStatsCache.get(cacheKey);
  }
  try {
    // Fetch REAL team-level base stats + player-level for top_players in parallel
    const [teamBaseStats, advancedStats] = await Promise.all([
      ballDontLieService.getTeamBaseStats(teamId, season),
      // Advanced stats already cached by fetchNBATeamAdvancedStats — free call
      ballDontLieService.getTeamSeasonAdvanced(teamId, season)
    ]);

    if (!teamBaseStats) {
      console.warn(`[NBA Base Stats] No team base stats found for team ${teamId}`);
      return null;
    }

    const s = teamBaseStats;

    // Use real team-level percentages from BDL (already in decimal 0.0-1.0)
    // Use ?? null so missing data shows as N/A rather than fake 0%
    const fg_pct = s.fg_pct ?? null;
    const fg3_pct = s.fg3_pct ?? null;
    const ft_pct = s.ft_pct ?? null;
    const ft_rate = s.fga > 0 ? (s.fta / s.fga) : 0;

    // Use real tm_tov_pct from advanced stats (NOT estimated from player aggregation)
    const tov_rate = advancedStats?.tm_tov_pct ?? null;

    // OREB share of total rebounds
    const oreb_pct_of_total_reb = (s.oreb + s.dreb) > 0 ? (s.oreb / (s.oreb + s.dreb)) : 0;

    console.log(`[NBA Base Stats] Team ${teamId} (DIRECT): FG3%=${fg3_pct != null ? (fg3_pct*100).toFixed(1) : 'N/A'}%, FT%=${ft_pct != null ? (ft_pct*100).toFixed(1) : 'N/A'}%, FT_RATE=${ft_rate.toFixed(3)}, TOV_RATE=${tov_rate != null ? (tov_rate*100).toFixed(1) : 'N/A'}%`);

    // Fetch player-level data for top_players ONLY
    let topPlayers = [];
    try {
      const playersUrl = `https://api.balldontlie.io/v1/players/active?team_ids[]=${teamId}&per_page=15`;
      const playersResp = await fetch(playersUrl, { headers: { Authorization: BDL_API_KEY } });
      const playersJson = await playersResp.json();
      const players = playersJson.data || [];
      if (players.length > 0) {
        const topPlayerIds = players.slice(0, 10).map(p => p.id);
        const playerIdParams = topPlayerIds.map(id => `player_ids[]=${id}`).join('&');
        const seasonAvgUrl = `https://api.balldontlie.io/v1/season_averages/general?season=${season}&season_type=regular&type=base&${playerIdParams}`;
        const resp = await fetch(seasonAvgUrl, { headers: { Authorization: BDL_API_KEY } });
        const json = await resp.json();
        const playerStats = json.data || [];
        topPlayers = playerStats.slice(0, 5).map(ps => ({
          name: `${ps.player?.first_name || ''} ${ps.player?.last_name || ''}`.trim(),
          ppg: (ps.stats?.pts || 0).toFixed(1),
          rpg: (ps.stats?.reb || 0).toFixed(1),
          apg: (ps.stats?.ast || 0).toFixed(1),
          fg3_pct: ps.stats?.fg3_pct ? (ps.stats.fg3_pct * 100).toFixed(1) : 'N/A'
        }));
      }
    } catch (playerErr) {
      console.warn(`[NBA Base Stats] Player fetch for top_players failed: ${playerErr.message}`);
    }

    const result = {
      games_played: s.gp || 0,
      // Shooting — real team-level from BDL (N/A if missing rather than fake 0%)
      fg_pct: fg_pct != null ? (fg_pct * 100).toFixed(1) : 'N/A',
      fg3_pct: fg3_pct != null ? (fg3_pct * 100).toFixed(1) : 'N/A',
      fg3m_per_game: (s.fg3m || 0).toFixed(1),
      fg3a_per_game: (s.fg3a || 0).toFixed(1),
      // Free throws — real team-level from BDL
      ft_pct: ft_pct != null ? (ft_pct * 100).toFixed(1) : 'N/A',
      ft_rate: ft_rate.toFixed(3),
      ftm_per_game: (s.ftm || 0).toFixed(1),
      fta_per_game: (s.fta || 0).toFixed(1),
      // Rebounds — real team-level from BDL
      oreb_per_game: (s.oreb || 0).toFixed(1),
      dreb_per_game: (s.dreb || 0).toFixed(1),
      reb_per_game: (s.reb || 0).toFixed(1),
      oreb_pct_of_total_reb: (oreb_pct_of_total_reb * 100).toFixed(1),
      // Turnovers — tov_rate from real advanced stats (tm_tov_pct)
      tov_per_game: (s.tov || 0).toFixed(1),
      tov_rate: tov_rate != null ? (tov_rate * 100).toFixed(1) : 'N/A',
      // Other — real team-level from BDL
      pts_per_game: (s.pts || 0).toFixed(1),
      ast_per_game: (s.ast || 0).toFixed(1),
      blk_per_game: (s.blk || 0).toFixed(1),
      stl_per_game: (s.stl || 0).toFixed(1),
      // Top scorers — player-level data for TOP_PLAYERS token
      top_players: topPlayers
    };
    _nbaBaseStatsCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn('[Stat Router] BDL NBA base stats fetch failed:', error.message);
    return null;
  }
}

/**
 * Fetch NBA team OPPONENT stats via BDL team_season_averages (type=opponent).
 * Returns computed opponent efficiency metrics: opp_efg_pct, opp_tov_rate, opp_fg3_pct, etc.
 * Session-cached to avoid duplicate BDL calls within a single game analysis.
 */
async function fetchNBATeamOpponentStats(teamId, season = null) {
  if (!season) {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    season = month >= 10 ? year : year - 1;
  }
  const cacheKey = `${teamId}_${season}`;
  if (_nbaOpponentStatsCache.has(cacheKey)) {
    return _nbaOpponentStatsCache.get(cacheKey);
  }

  try {
    const stats = await ballDontLieService.getTeamOpponentStats(teamId, season);
    if (!stats) {
      console.warn(`[Stat Router] No opponent stats found for team ${teamId}`);
      _nbaOpponentStatsCache.set(cacheKey, null);
      return null;
    }

    // Compute derived metrics from raw opponent stats
    const opp_fgm = stats.opp_fgm || 0;
    const opp_fga = stats.opp_fga || 0;
    const opp_fg3m = stats.opp_fg3m || 0;
    const opp_fg3a = stats.opp_fg3a || 0;
    const opp_fta = stats.opp_fta || 0;
    const opp_ftm = stats.opp_ftm || 0;
    const opp_tov = stats.opp_tov || 0;

    const result = {
      // Opponent eFG%: (FGM + 0.5 * 3PM) / FGA
      opp_efg_pct: opp_fga > 0 ? ((opp_fgm + 0.5 * opp_fg3m) / opp_fga * 100).toFixed(1) : 'N/A',
      // Opponent FG%
      opp_fg_pct: stats.opp_fg_pct != null ? (stats.opp_fg_pct * 100).toFixed(1) : 'N/A',
      // Opponent 3PT%
      opp_fg3_pct: stats.opp_fg3_pct != null ? (stats.opp_fg3_pct * 100).toFixed(1) : 'N/A',
      // Opponent TOV rate: TOV / (FGA + 0.44*FTA + TOV)
      opp_tov_rate: (opp_fga + 0.44 * opp_fta + opp_tov) > 0
        ? (opp_tov / (opp_fga + 0.44 * opp_fta + opp_tov) * 100).toFixed(1)
        : 'N/A',
      // Opponent FT rate: FTA / FGA
      opp_ft_rate: opp_fga > 0 ? (opp_fta / opp_fga * 100).toFixed(1) : 'N/A',
      // Raw per-game opponent stats
      opp_pts: stats.opp_pts != null ? stats.opp_pts.toFixed(1) : 'N/A',
      opp_reb: stats.opp_reb != null ? stats.opp_reb.toFixed(1) : 'N/A',
      opp_oreb: stats.opp_oreb != null ? stats.opp_oreb.toFixed(1) : 'N/A',
      opp_dreb: stats.opp_dreb != null ? stats.opp_dreb.toFixed(1) : 'N/A',
      opp_tov_per_game: stats.opp_tov != null ? stats.opp_tov.toFixed(1) : 'N/A',
      opp_fg3a_per_game: stats.opp_fg3a != null ? stats.opp_fg3a.toFixed(1) : 'N/A',
      opp_fg3m_per_game: stats.opp_fg3m != null ? stats.opp_fg3m.toFixed(1) : 'N/A',
      opp_fta_per_game: stats.opp_fta != null ? stats.opp_fta.toFixed(1) : 'N/A',
      opp_ftm_per_game: stats.opp_ftm != null ? stats.opp_ftm.toFixed(1) : 'N/A',
      games_played: stats.gp || 0
    };

    _nbaOpponentStatsCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn('[Stat Router] BDL NBA opponent stats fetch failed:', error.message);
    // Do NOT cache errors — transient API failures should be retryable on next request
    return null;
  }
}

/**
 * Fetch NBA team DEFENSE stats via BDL team_season_averages (type=defense).
 * Returns: opp_pts_paint, opp_pts_fb, opp_pts_off_tov, opp_pts_2nd_chance, etc.
 * Session-cached to avoid duplicate BDL calls within a single game analysis.
 */
async function fetchNBATeamDefenseStats(teamId, season = null) {
  if (!season) {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    season = month >= 10 ? year : year - 1;
  }
  const cacheKey = `${teamId}_${season}`;
  if (_nbaDefenseStatsCache.has(cacheKey)) {
    return _nbaDefenseStatsCache.get(cacheKey);
  }

  try {
    const stats = await ballDontLieService.getTeamDefenseStats(teamId, season);
    if (!stats) {
      console.warn(`[Stat Router] No defense stats found for team ${teamId}`);
      _nbaDefenseStatsCache.set(cacheKey, null);
      return null;
    }

    const result = {
      opp_pts_paint: stats.opp_pts_paint != null ? stats.opp_pts_paint.toFixed(1) : 'N/A',
      opp_pts_fb: stats.opp_pts_fb != null ? stats.opp_pts_fb.toFixed(1) : 'N/A',
      opp_pts_off_tov: stats.opp_pts_off_tov != null ? stats.opp_pts_off_tov.toFixed(1) : 'N/A',
      opp_pts_2nd_chance: stats.opp_pts_2nd_chance != null ? stats.opp_pts_2nd_chance.toFixed(1) : 'N/A',
      games_played: stats.gp || 0
    };

    _nbaDefenseStatsCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn('[Stat Router] BDL NBA defense stats fetch failed:', error.message);
    // Do NOT cache errors — transient API failures should be retryable on next request
    return null;
  }
}

/**
 * Find team by name - STRICT matching to avoid mascot collisions
 * e.g., "Montana State Bobcats" should NOT match "Ohio Bobcats"
 */
function findTeam(teams, teamName) {
  if (!teams || !teamName) return null;
  const normalized = teamName.toLowerCase().trim();
  
  // 1. Try exact full_name match first (best)
  let match = teams.find(t => t.full_name?.toLowerCase() === normalized);
  if (match) return match;
  
  // 2. Try full_name contains the search term (e.g., "Duke Blue Devils" contains "duke")
  match = teams.find(t => t.full_name?.toLowerCase().includes(normalized));
  if (match) return match;
  
  // 3. Try search term contains full_name (e.g., searching "Duke Blue Devils NCAA" contains "Duke Blue Devils")
  match = teams.find(t => normalized.includes(t.full_name?.toLowerCase()));
  if (match) return match;
  
  // 4. For college sports: Try matching on college + mascot (e.g., "Montana State" + "Bobcats")
  // Split the search into parts
  const searchParts = normalized.split(/\s+/);
  if (searchParts.length >= 2) {
    // Try to find team where college/city matches AND mascot matches
    match = teams.find(t => {
      const fullName = t.full_name?.toLowerCase() || '';
      const college = t.college?.toLowerCase() || '';
      const mascot = t.name?.toLowerCase() || '';
      
      // Check if the search contains BOTH the college/city AND the mascot
      const collegeMatch = normalized.includes(college) || college.split(/\s+/).every(p => normalized.includes(p));
      const mascotMatch = normalized.includes(mascot);
      
      return collegeMatch && mascotMatch;
    });
    if (match) return match;
  }
  
  // 5. Try abbreviation match (e.g., "MSU" for Michigan State)
  match = teams.find(t => t.abbreviation?.toLowerCase() === normalized);
  if (match) return match;
  
  // 6. Last resort: partial match on full_name only (NOT on mascot alone)
  // This prevents "Bobcats" from matching "Ohio Bobcats" when searching for "Montana State Bobcats"
  match = teams.find(t => {
    const fullName = t.full_name?.toLowerCase() || '';
    // Only match if search term shares significant portion with full_name
    const searchWords = normalized.split(/\s+/).filter(w => w.length > 2);
    const matchCount = searchWords.filter(w => fullName.includes(w)).length;
    return matchCount >= Math.ceil(searchWords.length * 0.6); // At least 60% of words must match
  });
  
  return match || null;
}

/**
 * Format number helper
 */
function fmtNum(val, decimals = 1) {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  return Number(val).toFixed(decimals);
}

/**
 * Format percentage helper
 */
function fmtPct(val) {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  const pct = val <= 1 ? val * 100 : val;
  return `${pct.toFixed(1)}%`;
}


// =============================================================================
// FETCHERS - Each function fetches a specific stat category
// =============================================================================

async function fetchBothTeamSeasonStats(bdlSport, home, away, season) {
  const [homeStats, awayStats] = await Promise.all([
    ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
    ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
  ]);
  return {
    homeData: Array.isArray(homeStats) ? homeStats[0] : homeStats,
    awayData: Array.isArray(awayStats) ? awayStats[0] : awayStats
  };
}

const FETCHERS = {
  // ===== PACE & TEMPO =====
  PACE: async (bdlSport, home, away, season) => {
    // For NBA, use BDL Season Averages (Advanced) which includes pace
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);
      
      const homePace = homeStats?.pace ? parseFloat(homeStats.pace) : 0;
      const awayPace = awayStats?.pace ? parseFloat(awayStats.pace) : 0;
      const avgPace = (homePace + awayPace) / 2;
      
      return {
        category: 'Pace & Tempo (BDL Advanced)',

        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          pace: homeStats?.pace || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          pace: awayStats?.pace || 'N/A'
        },
        projected_pace: avgPace > 0 ? avgPace.toFixed(1) : 'N/A',
        analysis: `${home.name} pace: ${homePace.toFixed(1)}, ${away.name} pace: ${awayPace.toFixed(1)}, projected: ${avgPace > 0 ? avgPace.toFixed(1) : 'N/A'}`,
        INVESTIGATE: `How does pace affect this matchup?`
      };
    }
    
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Pace & Tempo',
      home: {
        team: home.full_name || home.name,
        pace: fmtNum(homeData?.pace),
        possessions_per_game: fmtNum(homeData?.possessions_per_game)
      },
      away: {
        team: away.full_name || away.name,
        pace: fmtNum(awayData?.pace),
        possessions_per_game: fmtNum(awayData?.possessions_per_game)
      },
      analysis: buildPaceAnalysis(homeData, awayData)
    };
  },
  
  TEMPO: async (bdlSport, home, away, season) => {
    // Alias for PACE in college
    return FETCHERS.PACE(bdlSport, home, away, season);
  },

  // ===== EFFICIENCY =====
  OFFENSIVE_RATING: async (bdlSport, home, away, season) => {
    // For NBA, use BDL Season Averages (Advanced) - requires GOAT tier
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);
      
      return {
        category: 'Offensive Efficiency (BDL Advanced)',

        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          offensive_rating: homeStats?.offensive_rating || 'N/A',
          true_shooting_pct: homeStats?.true_shooting_pct ? `${homeStats.true_shooting_pct}%` : 'N/A',
          games_played: homeStats?.games_played || 0,
          top_players: homeStats?.top_players || []
        },
        away: {
          team: away.full_name || away.name,
          offensive_rating: awayStats?.offensive_rating || 'N/A',
          true_shooting_pct: awayStats?.true_shooting_pct ? `${awayStats.true_shooting_pct}%` : 'N/A',
          games_played: awayStats?.games_played || 0,
          top_players: awayStats?.top_players || []
        },
        INVESTIGATE: `What does the offensive efficiency data reveal about this matchup?`
      };
    }
    
    // For other sports, try BDL team season stats
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Offensive Efficiency',
      home: {
        team: home.full_name || home.name,
        offensive_rating: fmtNum(homeData?.offensive_rating),
        points_per_game: fmtNum(homeData?.points_per_game || homeData?.total_points_per_game)
      },
      away: {
        team: away.full_name || away.name,
        offensive_rating: fmtNum(awayData?.offensive_rating),
        points_per_game: fmtNum(awayData?.points_per_game || awayData?.total_points_per_game)
      }
    };
  },
  
  DEFENSIVE_RATING: async (bdlSport, home, away, season) => {
    // For NBA, use BDL Season Averages (Advanced)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);
      
      return {
        category: 'Defensive Efficiency (BDL Advanced)',

        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          defensive_rating: homeStats?.defensive_rating || 'N/A',
          games_played: homeStats?.games_played || 0
        },
        away: {
          team: away.full_name || away.name,
          defensive_rating: awayStats?.defensive_rating || 'N/A',
          games_played: awayStats?.games_played || 0
        },
        INVESTIGATE: `What does the defensive efficiency data reveal about this matchup?`
      };
    }
    
    // For other sports
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Defensive Efficiency',
      home: {
        team: home.full_name || home.name,
        defensive_rating: fmtNum(homeData?.defensive_rating),
        opp_points_per_game: fmtNum(homeData?.opp_points_per_game || homeData?.opp_total_points_per_game)
      },
      away: {
        team: away.full_name || away.name,
        defensive_rating: fmtNum(awayData?.defensive_rating),
        opp_points_per_game: fmtNum(awayData?.opp_points_per_game || awayData?.opp_total_points_per_game)
      }
    };
  },
  
  NET_RATING: async (bdlSport, home, away, season) => {
    // For NBA, use BDL Season Averages (Advanced) with BDL v2 usage/scoring data
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);

      const homeNet = homeStats?.net_rating ? parseFloat(homeStats.net_rating) : 0;
      const awayNet = awayStats?.net_rating ? parseFloat(awayStats.net_rating) : 0;
      const gap = (homeNet - awayNet).toFixed(1);

      return {
        category: 'Net Rating Comparison (BDL Advanced)',

        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          net_rating: homeStats?.net_rating || 'N/A',
          offensive_rating: homeStats?.offensive_rating || 'N/A',
          defensive_rating: homeStats?.defensive_rating || 'N/A',
          // BDL v2: Usage concentration
          usage_concentration: homeStats?.usage_concentration || null,
          // BDL v2: Scoring profile (where they score)
          scoring_profile: homeStats?.scoring_profile || null,
          top_players: homeStats?.top_players || []
        },
        away: {
          team: away.full_name || away.name,
          net_rating: awayStats?.net_rating || 'N/A',
          offensive_rating: awayStats?.offensive_rating || 'N/A',
          defensive_rating: awayStats?.defensive_rating || 'N/A',
          usage_concentration: awayStats?.usage_concentration || null,
          scoring_profile: awayStats?.scoring_profile || null,
          top_players: awayStats?.top_players || []
        },
        gap: gap,
        INVESTIGATE: `What does the net rating data reveal about this matchup?`
      };
    }
    
    // For NCAAB: use Barttorvik AdjEM (AdjOE - AdjDE) — real adjusted net rating
    if (bdlSport === 'basketball_ncaab') {
      const [homeBartt, awayBartt] = await Promise.all([
        getBarttovikRatings(home.full_name || home.name),
        getBarttovikRatings(away.full_name || away.name)
      ]);

      const homeNet = homeBartt?.adjEM ?? 0;
      const awayNet = awayBartt?.adjEM ?? 0;

      return {
        category: 'Net Rating (Barttorvik AdjEM = AdjOE - AdjDE)',
        source: 'barttorvik.com',
        home: {
          team: home.full_name || home.name,
          net_rating: fmtNum(homeNet),
          offensive_rating: homeBartt?.adjOE ?? 'N/A',
          defensive_rating: homeBartt?.adjDE ?? 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          net_rating: fmtNum(awayNet),
          offensive_rating: awayBartt?.adjOE ?? 'N/A',
          defensive_rating: awayBartt?.adjDE ?? 'N/A'
        },
        gap: fmtNum(homeNet - awayNet),
        INVESTIGATE: 'What does the AdjEM/Net Rating gap reveal about this matchup compared to the spread?'
      };
    }

    // For other sports (NHL, NFL, NCAAF)
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);

    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;

    const homeNet = (homeData?.offensive_rating || 0) - (homeData?.defensive_rating || 0);
    const awayNet = (awayData?.offensive_rating || 0) - (awayData?.defensive_rating || 0);

    return {
      category: 'Net Rating',
      home: {
        team: home.full_name || home.name,
        net_rating: fmtNum(homeNet),
        offensive_rating: fmtNum(homeData?.offensive_rating),
        defensive_rating: fmtNum(homeData?.defensive_rating)
      },
      away: {
        team: away.full_name || away.name,
        net_rating: fmtNum(awayNet),
        offensive_rating: fmtNum(awayData?.offensive_rating),
        defensive_rating: fmtNum(awayData?.defensive_rating)
      },
      gap: fmtNum(homeNet - awayNet)
    };
  },
  
  ADJ_OFFENSIVE_EFF: async (bdlSport, home, away, season) => {
    return FETCHERS.OFFENSIVE_RATING(bdlSport, home, away, season);
  },
  
  ADJ_DEFENSIVE_EFF: async (bdlSport, home, away, season) => {
    return FETCHERS.DEFENSIVE_RATING(bdlSport, home, away, season);
  },
  
  ADJ_EFFICIENCY_MARGIN: async (bdlSport, home, away, season) => {
    return FETCHERS.NET_RATING(bdlSport, home, away, season);
  },

  // ===== FOUR FACTORS =====
  EFG_PCT: async (bdlSport, home, away, season) => {
    // For NBA, use BDL Season Averages (Advanced + Opponent)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats, homeOpp, awayOpp] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season),
        fetchNBATeamOpponentStats(home.id, season),
        fetchNBATeamOpponentStats(away.id, season)
      ]);

      return {
        category: 'Shooting Efficiency (BDL Advanced + Opponent)',
        source: 'Ball Don\'t Lie API (Advanced + Opponent)',
        home: {
          team: home.full_name || home.name,
          efg_pct: homeStats?.efg_pct ? `${homeStats.efg_pct}%` : 'N/A',
          true_shooting_pct: homeStats?.true_shooting_pct ? `${homeStats.true_shooting_pct}%` : 'N/A',
          opp_efg_pct_allowed: homeOpp?.opp_efg_pct ? `${homeOpp.opp_efg_pct}%` : 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          efg_pct: awayStats?.efg_pct ? `${awayStats.efg_pct}%` : 'N/A',
          true_shooting_pct: awayStats?.true_shooting_pct ? `${awayStats.true_shooting_pct}%` : 'N/A',
          opp_efg_pct_allowed: awayOpp?.opp_efg_pct ? `${awayOpp.opp_efg_pct}%` : 'N/A'
        },
        comparison: homeStats && awayStats ?
          `eFG% gap: ${(parseFloat(homeStats.efg_pct) - parseFloat(awayStats.efg_pct)).toFixed(1)}% (${home.name} ${homeStats.efg_pct}% vs ${away.name} ${awayStats.efg_pct}%)` :
          'Comparison unavailable',
        INVESTIGATE: 'How do these offensive and defensive shooting profiles compare?',
      };
    }
    
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    // Calculate eFG% if not provided: eFG% = (FGM + 0.5 * FG3M) / FGA
    const calcEfg = (d) => {
      if (d?.efg_pct || d?.effective_fg_pct) return d.efg_pct || d.effective_fg_pct;
      const fgm = d?.fgm || 0;
      const fg3m = d?.fg3m || 0;
      const fga = d?.fga || 1;
      return ((fgm + 0.5 * fg3m) / fga) * 100;
    };
    
    return {
      category: 'Effective Field Goal %',
      home: {
        team: home.full_name || home.name,
        efg_pct: fmtPct(calcEfg(homeData)),
        fg_pct: fmtPct(homeData?.fg_pct || homeData?.field_goal_pct),
        three_pct: fmtPct(homeData?.fg3_pct || homeData?.three_pct || homeData?.three_point_pct)
      },
      away: {
        team: away.full_name || away.name,
        efg_pct: fmtPct(calcEfg(awayData)),
        fg_pct: fmtPct(awayData?.fg_pct || awayData?.field_goal_pct),
        three_pct: fmtPct(awayData?.fg3_pct || awayData?.three_pct || awayData?.three_point_pct)
      }
    };
  },
  
  TURNOVER_RATE: async (bdlSport, home, away, season) => {
    // For NBA, use REAL tm_tov_pct from advanced stats + opponent TOV context
    if (bdlSport === 'basketball_nba') {
      const [homeAdvanced, awayAdvanced, homeBase, awayBase, homeOpp, awayOpp] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season),
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season),
        fetchNBATeamOpponentStats(home.id, season),
        fetchNBATeamOpponentStats(away.id, season)
      ]);

      return {
        category: 'Turnover Rate (BDL Advanced + Opponent)',
        source: 'Ball Don\'t Lie API (Advanced: tm_tov_pct + Opponent: opp_tov_rate)',
        home: {
          team: home.full_name || home.name,
          tov_rate: homeAdvanced?.tm_tov_pct ? `${homeAdvanced.tm_tov_pct}%` : 'N/A',
          turnovers_per_game: homeBase?.tov_per_game || 'N/A',
          opp_tov_rate: homeOpp?.opp_tov_rate ? `${homeOpp.opp_tov_rate}%` : 'N/A',
          opp_tov_per_game: homeOpp?.opp_tov_per_game || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          tov_rate: awayAdvanced?.tm_tov_pct ? `${awayAdvanced.tm_tov_pct}%` : 'N/A',
          turnovers_per_game: awayBase?.tov_per_game || 'N/A',
          opp_tov_rate: awayOpp?.opp_tov_rate ? `${awayOpp.opp_tov_rate}%` : 'N/A',
          opp_tov_per_game: awayOpp?.opp_tov_per_game || 'N/A'
        },
        INVESTIGATE: 'How do these offensive and defensive turnover profiles compare?',
      };
    }
    
    // For other sports, use getTeamSeasonStats
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    // NCAAB BDL fields: turnover (per game), fga, fta — NO turnover_rate field exists
    // Calculate TOV% = TOV / (FGA + 0.44*FTA + TOV) * 100 (standard Four Factors formula)
    const calcTovRate = (d) => {
      if (!d) return null;
      // NBA has turnovers_per_game; NCAAB has turnover
      const tov = bdlSport === 'basketball_ncaab' ? d.turnover : (d.turnovers_per_game || d.turnover);
      if (tov != null && d.fga && d.fta) return (tov / (d.fga + 0.44 * d.fta + tov)) * 100;
      return null;
    };
    return {
      category: 'Turnover Rate',
      home: {
        team: home.full_name || home.name,
        tov_rate: fmtPct(calcTovRate(homeData)),
        turnovers_per_game: fmtNum(bdlSport === 'basketball_ncaab' ? homeData?.turnover : (homeData?.turnovers_per_game || homeData?.turnover))
      },
      away: {
        team: away.full_name || away.name,
        tov_rate: fmtPct(calcTovRate(awayData)),
        turnovers_per_game: fmtNum(bdlSport === 'basketball_ncaab' ? awayData?.turnover : (awayData?.turnovers_per_game || awayData?.turnover))
      }
    };
  },
  
  OREB_RATE: async (bdlSport, home, away, season) => {
    // For NBA, use REAL oreb_pct from advanced stats + opponent OREB context
    if (bdlSport === 'basketball_nba') {
      const [homeAdvanced, awayAdvanced, homeBase, awayBase, homeOpp, awayOpp] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season),
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season),
        fetchNBATeamOpponentStats(home.id, season),
        fetchNBATeamOpponentStats(away.id, season)
      ]);

      return {
        category: 'Offensive Rebounding (BDL Advanced + Opponent)',
        source: 'Ball Don\'t Lie API (Advanced: oreb_pct + Opponent: opp_oreb)',
        home: {
          team: home.full_name || home.name,
          oreb_pct: homeAdvanced?.oreb_pct ? `${homeAdvanced.oreb_pct}%` : 'N/A',
          oreb_per_game: homeBase?.oreb_per_game || 'N/A',
          opp_oreb_per_game: homeOpp?.opp_oreb || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          oreb_pct: awayAdvanced?.oreb_pct ? `${awayAdvanced.oreb_pct}%` : 'N/A',
          oreb_per_game: awayBase?.oreb_per_game || 'N/A',
          opp_oreb_per_game: awayOpp?.opp_oreb || 'N/A'
        },
        INVESTIGATE: 'How do these offensive and defensive rebounding profiles compare?'
      };
    }
    
    // For other sports, use getTeamSeasonStats
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    // NCAAB BDL fields: oreb, dreb (per game) — NO oreb_pct field exists
    // ORB% = OREB / (OREB + Opponent_DREB) (Dean Oliver formula, Basketball Reference)
    const calcOrebRate = (d, opponentData) => {
      if (!d) return null;
      // NBA may have oreb_pct directly; NCAAB only has raw oreb/dreb
      if (bdlSport !== 'basketball_ncaab' && (d.oreb_pct || d.offensive_reb_pct)) return d.oreb_pct || d.offensive_reb_pct;
      const oreb = bdlSport === 'basketball_ncaab' ? d.oreb : (d.oreb_per_game || d.oreb);
      // Use opponent's DREB for correct ORB% formula; fall back to own DREB if unavailable
      const oppDreb = opponentData ? (bdlSport === 'basketball_ncaab' ? opponentData.dreb : (opponentData.dreb_per_game || opponentData.dreb)) : null;
      const dreb = oppDreb != null ? oppDreb : (bdlSport === 'basketball_ncaab' ? d.dreb : (d.dreb_per_game || d.dreb));
      if (oreb != null && dreb != null && (oreb + dreb) > 0) return (oreb / (oreb + dreb)) * 100;
      return null;
    };
    return {
      category: 'Offensive Rebounding',
      home: {
        team: home.full_name || home.name,
        oreb_rate: fmtPct(calcOrebRate(homeData, awayData)),
        oreb_per_game: fmtNum(bdlSport === 'basketball_ncaab' ? homeData?.oreb : (homeData?.oreb_per_game || homeData?.oreb))
      },
      away: {
        team: away.full_name || away.name,
        oreb_rate: fmtPct(calcOrebRate(awayData, homeData)),
        oreb_per_game: fmtNum(bdlSport === 'basketball_ncaab' ? awayData?.oreb : (awayData?.oreb_per_game || awayData?.oreb))
      }
    };
  },
  
  FT_RATE: async (bdlSport, home, away, season) => {
    // For NBA, use team-level base stats + opponent FT data
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats, homeOpp, awayOpp] = await Promise.all([
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season),
        fetchNBATeamOpponentStats(home.id, season),
        fetchNBATeamOpponentStats(away.id, season)
      ]);

      return {
        category: 'Free Throw Rate (BDL Base + Opponent)',
        source: 'Ball Don\'t Lie API (Base + Opponent)',
        home: {
          team: home.full_name || home.name,
          ft_rate: homeStats?.ft_rate || 'N/A',
          ft_pct: homeStats?.ft_pct ? `${homeStats.ft_pct}%` : 'N/A',
          fta_per_game: homeStats?.fta_per_game || 'N/A',
          opp_ft_rate: homeOpp?.opp_ft_rate ? `${homeOpp.opp_ft_rate}%` : 'N/A',
          opp_fta_per_game: homeOpp?.opp_fta_per_game || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          ft_rate: awayStats?.ft_rate || 'N/A',
          ft_pct: awayStats?.ft_pct ? `${awayStats.ft_pct}%` : 'N/A',
          fta_per_game: awayStats?.fta_per_game || 'N/A',
          opp_ft_rate: awayOpp?.opp_ft_rate ? `${awayOpp.opp_ft_rate}%` : 'N/A',
          opp_fta_per_game: awayOpp?.opp_fta_per_game || 'N/A'
        },
        INVESTIGATE: 'How do these offensive and defensive free throw profiles compare?'
      };
    }
    
    // For other sports, use getTeamSeasonStats
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    // Calculate FT Rate (FTA/FGA) if not provided
    const calcFtRate = (d) => {
      if (d?.ft_rate) return d.ft_rate;
      const fta = d?.fta || 0;
      const fga = d?.fga || 1;
      return fta / fga;
    };
    
    return {
      category: 'Free Throw Rate',
      home: {
        team: home.full_name || home.name,
        ft_rate: fmtNum(calcFtRate(homeData), 3),
        ft_pct: fmtPct(homeData?.ft_pct || homeData?.free_throw_pct),
        fta_per_game: fmtNum(homeData?.fta_per_game || homeData?.fta) // NCAAB uses 'fta'
      },
      away: {
        team: away.full_name || away.name,
        ft_rate: fmtNum(calcFtRate(awayData), 3),
        ft_pct: fmtPct(awayData?.ft_pct || awayData?.free_throw_pct),
        fta_per_game: fmtNum(awayData?.fta_per_game || awayData?.fta) // NCAAB uses 'fta'
      }
    };
  },

  // ===== SHOOTING =====
  THREE_PT_SHOOTING: async (bdlSport, home, away, season) => {
    // For NBA, use player-aggregated base stats (BDL has no team_season_stats for NBA)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season)
      ]);
      
      return {
        category: 'Three-Point Shooting',
        home: {
          team: home.full_name || home.name,
          three_pct: homeStats?.fg3_pct ? `${homeStats.fg3_pct}%` : 'N/A',
          three_made_per_game: homeStats?.fg3m_per_game || 'N/A',
          three_attempted_per_game: homeStats?.fg3a_per_game || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          three_pct: awayStats?.fg3_pct ? `${awayStats.fg3_pct}%` : 'N/A',
          three_made_per_game: awayStats?.fg3m_per_game || 'N/A',
          three_attempted_per_game: awayStats?.fg3a_per_game || 'N/A'
        },
        INVESTIGATE: `How does each team's recent shooting compare to their season average?`,
      };
    }
    
    // For other sports, use getTeamSeasonStats
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    // BDL returns an array - extract first item
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    // BDL NCAAB uses fg3_pct, fg3m, fg3a; NBA uses three_pct, three_made_per_game, etc.
    return {
      category: 'Three-Point Shooting',
      home: {
        team: home.full_name || home.name,
        three_pct: fmtPct(homeStats?.fg3_pct || homeStats?.three_pct || homeStats?.three_point_pct),
        three_made_per_game: fmtNum(homeStats?.fg3m || homeStats?.three_made_per_game),
        three_attempted_per_game: fmtNum(homeStats?.fg3a || homeStats?.three_attempted_per_game)
      },
      away: {
        team: away.full_name || away.name,
        three_pct: fmtPct(awayStats?.fg3_pct || awayStats?.three_pct || awayStats?.three_point_pct),
        three_made_per_game: fmtNum(awayStats?.fg3m || awayStats?.three_made_per_game),
        three_attempted_per_game: fmtNum(awayStats?.fg3a || awayStats?.three_attempted_per_game)
      }
    };
  },

  // ===== NCAAB/NCAAF SPECIFIC STATS =====
  // These provide actual data that BDL has for college sports
  
  SCORING: async (bdlSport, home, away, season) => {
    const { homeData, awayData } = await fetchBothTeamSeasonStats(bdlSport, home, away, season);
    
    return {
      category: 'Scoring',
      home: {
        team: home.full_name || home.name,
        points_per_game: fmtNum(homeData?.pts || homeData?.points_per_game, 1),
        fg_pct: fmtPct(homeData?.fg_pct),
        games_played: homeData?.games_played || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        points_per_game: fmtNum(awayData?.pts || awayData?.points_per_game, 1),
        fg_pct: fmtPct(awayData?.fg_pct),
        games_played: awayData?.games_played || 'N/A'
      }
    };
  },

  ASSISTS: async (bdlSport, home, away, season) => {
    const { homeData, awayData } = await fetchBothTeamSeasonStats(bdlSport, home, away, season);
    
    return {
      category: 'Assists',
      home: {
        team: home.full_name || home.name,
        assists_per_game: fmtNum(homeData?.ast || homeData?.assists_per_game, 1)
      },
      away: {
        team: away.full_name || away.name,
        assists_per_game: fmtNum(awayData?.ast || awayData?.assists_per_game, 1)
      }
    };
  },

  REBOUNDS: async (bdlSport, home, away, season) => {
    const { homeData, awayData } = await fetchBothTeamSeasonStats(bdlSport, home, away, season);
    
    return {
      category: 'Rebounding',
      home: {
        team: home.full_name || home.name,
        rebounds_per_game: fmtNum(homeData?.reb || homeData?.rebounds_per_game, 1),
        oreb_per_game: fmtNum(homeData?.oreb, 1),
        dreb_per_game: fmtNum(homeData?.dreb, 1)
      },
      away: {
        team: away.full_name || away.name,
        rebounds_per_game: fmtNum(awayData?.reb || awayData?.rebounds_per_game, 1),
        oreb_per_game: fmtNum(awayData?.oreb, 1),
        dreb_per_game: fmtNum(awayData?.dreb, 1)
      }
    };
  },

  STEALS: async (bdlSport, home, away, season) => {
    const { homeData, awayData } = await fetchBothTeamSeasonStats(bdlSport, home, away, season);
    
    return {
      category: 'Steals',
      home: {
        team: home.full_name || home.name,
        steals_per_game: fmtNum(homeData?.stl || homeData?.steals_per_game, 1)
      },
      away: {
        team: away.full_name || away.name,
        steals_per_game: fmtNum(awayData?.stl || awayData?.steals_per_game, 1)
      }
    };
  },

  BLOCKS: async (bdlSport, home, away, season) => {
    const { homeData, awayData } = await fetchBothTeamSeasonStats(bdlSport, home, away, season);
    
    return {
      category: 'Blocks',
      home: {
        team: home.full_name || home.name,
        blocks_per_game: fmtNum(homeData?.blk || homeData?.blocks_per_game, 1)
      },
      away: {
        team: away.full_name || away.name,
        blocks_per_game: fmtNum(awayData?.blk || awayData?.blocks_per_game, 1)
      }
    };
  },

  FG_PCT: async (bdlSport, home, away, season) => {
    const { homeData, awayData } = await fetchBothTeamSeasonStats(bdlSport, home, away, season);
    
    return {
      category: 'Field Goal Percentage',
      home: {
        team: home.full_name || home.name,
        fg_pct: fmtPct(homeData?.fg_pct),
        fgm_per_game: fmtNum(homeData?.fgm, 1),
        fga_per_game: fmtNum(homeData?.fga, 1)
      },
      away: {
        team: away.full_name || away.name,
        fg_pct: fmtPct(awayData?.fg_pct),
        fgm_per_game: fmtNum(awayData?.fgm, 1),
        fga_per_game: fmtNum(awayData?.fga, 1)
      }
    };
  },

  // ===== NCAAB-SPECIFIC FETCHERS (Unique Calculations) =====
  // These calculate derived stats to avoid duplicate data
  
  NCAAB_EFG_PCT: async (bdlSport, home, away, season) => {
    try {
      const [homeStats, awayStats] = await Promise.all([
        ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
        ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
      ]);
      const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
      const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;

      // Calculate eFG% = (FGM + 0.5 * FG3M) / FGA
      const calcEfg = (data) => {
        if (!data) return null;
        const fgm = data.fgm || 0;
        const fg3m = data.fg3m || 0;
        const fga = data.fga || 0;
        if (fga === 0) return null;
        return ((fgm + 0.5 * fg3m) / fga * 100).toFixed(1);
      };

      return {
        category: 'Effective FG%',
        home: {
          team: home.full_name || home.name,
          efg_pct: calcEfg(homeData) ? `${calcEfg(homeData)}%` : 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          efg_pct: calcEfg(awayData) ? `${calcEfg(awayData)}%` : 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB_EFG_PCT fetch failed:', error.message);
      return { category: 'Effective FG%', error: 'Data unavailable' };
    }
  },

  NCAAB_AP_RANKING: async (bdlSport, home, away, season) => {
    try {
      const rankings = await ballDontLieService.getRankingsGeneric(bdlSport, { season });
      const apRankings = rankings?.filter(r => r.poll === 'ap') || [];
      
      const homeRank = apRankings.find(r => r.team?.id === home.id);
      const awayRank = apRankings.find(r => r.team?.id === away.id);
      
      return {
        category: 'AP Poll Ranking',
        home: {
          team: home.full_name || home.name,
          ap_rank: homeRank?.rank || 'Unranked',
          trend: homeRank?.trend || '-',
          record: homeRank?.record || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          ap_rank: awayRank?.rank || 'Unranked',
          trend: awayRank?.trend || '-',
          record: awayRank?.record || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] AP Ranking fetch failed:', error.message);
      return {
        category: 'AP Poll Ranking',
        home: { team: home.full_name || home.name, ap_rank: 'N/A' },
        away: { team: away.full_name || away.name, ap_rank: 'N/A' }
      };
    }
  },

  NCAAB_COACHES_RANKING: async (bdlSport, home, away, season) => {
    try {
      const rankings = await ballDontLieService.getRankingsGeneric(bdlSport, { season });
      const coachRankings = rankings?.filter(r => r.poll === 'coach') || [];
      
      const homeRank = coachRankings.find(r => r.team?.id === home.id);
      const awayRank = coachRankings.find(r => r.team?.id === away.id);
      
      return {
        category: 'Coaches Poll Ranking',
        home: {
          team: home.full_name || home.name,
          coaches_rank: homeRank?.rank || 'Unranked',
          trend: homeRank?.trend || '-',
          points: homeRank?.points || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          coaches_rank: awayRank?.rank || 'Unranked',
          trend: awayRank?.trend || '-',
          points: awayRank?.points || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] Coaches Ranking fetch failed:', error.message);
      return {
        category: 'Coaches Poll Ranking',
        home: { team: home.full_name || home.name, coaches_rank: 'N/A' },
        away: { team: away.full_name || away.name, coaches_rank: 'N/A' }
      };
    }
  },

  NCAAB_CONFERENCE_RECORD: async (bdlSport, home, away, season) => {
    try {
      // Some BDL NCAAB team objects may not include a valid conference_id; avoid passing it.
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });

      const homeStanding = Array.isArray(standings)
        ? standings.find(s => s.team?.id === home.id)
        : null;
      const awayStanding = Array.isArray(standings)
        ? standings.find(s => s.team?.id === away.id)
        : null;
      
      return {
        category: 'Conference Record',
        home: {
          team: home.full_name || home.name,
          conference_record: homeStanding?.conference_record || 'N/A',
          conference_win_pct: homeStanding?.conference_win_percentage 
            ? `${(homeStanding.conference_win_percentage * 100).toFixed(0)}%` 
            : 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          conference_record: awayStanding?.conference_record || 'N/A',
          conference_win_pct: awayStanding?.conference_win_percentage 
            ? `${(awayStanding.conference_win_percentage * 100).toFixed(0)}%` 
            : 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] Conference Record fetch failed:', error.message);
      return {
        category: 'Conference Record',
        home: { team: home.full_name || home.name, conference_record: 'N/A' },
        away: { team: away.full_name || away.name, conference_record: 'N/A' }
      };
    }
  },

  NCAAB_TEMPO: async (bdlSport, home, away, season) => {
    try {
      // Use Barttorvik Tempo (real adjusted tempo, not broken BDL calc)
      const [homeBartt, awayBartt] = await Promise.all([
        getBarttovikRatings(home.full_name || home.name),
        getBarttovikRatings(away.full_name || away.name)
      ]);
      return {
        category: 'Tempo (Possessions/Game, Barttorvik)',
        source: 'barttorvik.com',
        home: {
          team: home.full_name || home.name,
          tempo: homeBartt?.tempo ?? 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          tempo: awayBartt?.tempo ?? 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB_TEMPO fetch failed:', error.message);
      return { category: 'Tempo (Possessions/Game)', error: 'Data unavailable' };
    }
  },

  NCAAB_OFFENSIVE_RATING: async (bdlSport, home, away, season) => {
    try {
      // Use Barttorvik AdjOE (real adjusted offensive efficiency, not broken BDL calc)
      const [homeBartt, awayBartt] = await Promise.all([
        getBarttovikRatings(home.full_name || home.name),
        getBarttovikRatings(away.full_name || away.name)
      ]);
      return {
        category: 'Adjusted Offensive Efficiency (Barttorvik AdjOE)',
        source: 'barttorvik.com',
        home: {
          team: home.full_name || home.name,
          offensive_rating: homeBartt?.adjOE ?? 'N/A',
          adjOE_rank: homeBartt?.adjOE_rank ?? 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          offensive_rating: awayBartt?.adjOE ?? 'N/A',
          adjOE_rank: awayBartt?.adjOE_rank ?? 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB_OFFENSIVE_RATING fetch failed:', error.message);
      return { category: 'Adjusted Offensive Efficiency (Barttorvik AdjOE)', error: 'Data unavailable' };
    }
  },

  NCAAB_DEFENSIVE_RATING: async (bdlSport, home, away, season) => {
    try {
      // Use Barttorvik AdjDE (real adjusted defensive efficiency)
      // Old BDL calc produced garbage values (2702 instead of ~100) due to broken team_season_stats
      const [homeBartt, awayBartt] = await Promise.all([
        getBarttovikRatings(home.full_name || home.name),
        getBarttovikRatings(away.full_name || away.name)
      ]);
      return {
        category: 'Adjusted Defensive Efficiency (Barttorvik AdjDE)',
        source: 'barttorvik.com',
        home: {
          team: home.full_name || home.name,
          defensive_rating: homeBartt?.adjDE ?? 'N/A',
          adjDE_rank: homeBartt?.adjDE_rank ?? 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          defensive_rating: awayBartt?.adjDE ?? 'N/A',
          adjDE_rank: awayBartt?.adjDE_rank ?? 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB_DEFENSIVE_RATING fetch failed:', error.message);
      return { category: 'Adjusted Defensive Efficiency (Barttorvik AdjDE)', error: 'Data unavailable' };
    }
  },

  NCAAB_TS_PCT: async (bdlSport, home, away, season) => {
    try {
      const [homeStats, awayStats] = await Promise.all([
        ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
        ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
      ]);
      const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
      const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;

      // TS% = Points / (2 * (FGA + 0.44 * FTA))
      const calcTS = (data) => {
        if (!data) return null;
        const pts = data.pts || 0;
        const fga = data.fga || 0;
        const fta = data.fta || 0;
        const games = data.games_played || 1;
        const tsa = fga + 0.44 * fta; // True Shooting Attempts
        if (tsa === 0) return null;
        return ((pts / games) / (2 * (tsa / games)) * 100).toFixed(1);
      };

      return {
        category: 'True Shooting % (TS%)',
        home: {
          team: home.full_name || home.name,
          ts_pct: calcTS(homeData) ? `${calcTS(homeData)}%` : 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          ts_pct: calcTS(awayData) ? `${calcTS(awayData)}%` : 'N/A'
        },
        note: 'TS% captures total scoring efficiency (FG + 3PT + FT). Higher than eFG% for teams with elite FT rate.'
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB_TS_PCT fetch failed:', error.message);
      return { category: 'True Shooting % (TS%)', error: 'Data unavailable' };
    }
  },

  // ===== NCAAB FOUR FACTORS (Bundled — all 4 Dean Oliver metrics in one call) =====
  NCAAB_FOUR_FACTORS: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;
    try {
      const { homeData, awayData } = await fetchBothTeamSeasonStats(bdlSport, home, away, season);

      const calcFourFactors = (data, oppData) => {
        if (!data) return { efg_pct: 'N/A', tov_rate: 'N/A', fta_rate: 'N/A', oreb_pct: 'N/A' };
        const fgm = data.fgm || 0;
        const fga = data.fga || 0;
        const fg3m = data.fg3m || 0;
        const fta = data.fta || 0;
        const tov = data.turnover || 0;
        const oreb = data.oreb || 0;
        // Use opponent DREB for correct ORB% formula; fall back to own DREB
        const oppDreb = oppData?.dreb || data.dreb || 0;

        return {
          efg_pct: fga > 0 ? `${((fgm + 0.5 * fg3m) / fga * 100).toFixed(1)}%` : 'N/A',
          tov_rate: (fga + 0.44 * fta + tov) > 0 ? `${(tov / (fga + 0.44 * fta + tov) * 100).toFixed(1)}%` : 'N/A',
          fta_rate: fga > 0 ? (fta / fga).toFixed(3) : 'N/A',
          oreb_pct: (oreb + oppDreb) > 0 ? `${(oreb / (oreb + oppDreb) * 100).toFixed(1)}%` : 'N/A'
        };
      };

      return {
        category: 'Four Factors (NCAAB)',
        source: 'Ball Don\'t Lie API (Team Season Stats)',
        home: {
          team: home.full_name || home.name,
          ...calcFourFactors(homeData, awayData)
        },
        away: {
          team: away.full_name || away.name,
          ...calcFourFactors(awayData, homeData)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB_FOUR_FACTORS fetch failed:', error.message);
      return { category: 'Four Factors (NCAAB)', error: 'Data unavailable' };
    }
  },

  // ===== NCAAB L5 EFFICIENCY (Last 5 Games — eFG%, TS%, ORtg, DRtg) =====
  NCAAB_L5_EFFICIENCY: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;
    try {
      console.log(`[Stat Router] Fetching NCAAB L5 Efficiency for ${away.name} @ ${home.name}`);

      // Fetch recent games to get last 5 game IDs for each team
      const [homeGamesRaw, awayGamesRaw] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 50 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 50 })
      ]);

      const filterCompleted = (games) => (Array.isArray(games) ? games : games?.data || [])
        .filter(g => (g.home_team_score ?? g.home_score ?? 0) > 0 || (g.visitor_team_score ?? g.away_score ?? 0) > 0)
        .sort((a, b) => new Date(b.date || b.datetime) - new Date(a.date || a.datetime));

      const homeGames = filterCompleted(homeGamesRaw);
      const awayGames = filterCompleted(awayGamesRaw);

      const homeGameIds = homeGames.slice(0, 5).map(g => g.id);
      const awayGameIds = awayGames.slice(0, 5).map(g => g.id);

      // Fetch L5 efficiency from BDL player stats
      const [homeL5, awayL5] = await Promise.all([
        homeGameIds.length > 0 ? ballDontLieService.getTeamL5Efficiency(home.id, homeGameIds, bdlSport) : null,
        awayGameIds.length > 0 ? ballDontLieService.getTeamL5Efficiency(away.id, awayGameIds, bdlSport) : null
      ]);

      const formatL5 = (l5Data) => {
        if (!l5Data?.efficiency) return { efg_pct: 'N/A', ts_pct: 'N/A', approx_ortg: 'N/A', approx_drtg: 'N/A', approx_net_rtg: 'N/A' };
        const e = l5Data.efficiency;
        return {
          games: e.games || 0,
          efg_pct: e.efg_pct ? `${e.efg_pct}%` : 'N/A',
          ts_pct: e.ts_pct ? `${e.ts_pct}%` : 'N/A',
          approx_ortg: e.approx_ortg || 'N/A',
          approx_drtg: e.approx_drtg || 'N/A',
          approx_net_rtg: e.approx_net_rtg || 'N/A',
          opp_efg_pct: e.opp_efg_pct ? `${e.opp_efg_pct}%` : undefined,
          opp_ppg: e.opp_ppg || undefined
        };
      };

      return {
        category: 'L5 Efficiency (NCAAB)',
        source: 'Ball Don\'t Lie API (Player Stats — Last 5 Games)',
        home: {
          team: home.full_name || home.name,
          ...formatL5(homeL5)
        },
        away: {
          team: away.full_name || away.name,
          ...formatL5(awayL5)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB_L5_EFFICIENCY fetch failed:', error.message);
      return { category: 'L5 Efficiency (NCAAB)', error: 'Data unavailable' };
    }
  },

  // ===== NCAAB GROUNDING-BASED ADVANCED STATS =====
  // These use Gemini Grounding to fetch advanced analytics not available in BDL
  
  NCAAB_BARTTORVIK_RATINGS: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching Barttorvik ratings for ${awayTeamName} @ ${homeTeamName} via Barttorvik API`);

      // Barttorvik metrics are KenPom-equivalent (AdjOE ≈ AdjO, AdjDE ≈ AdjD, AdjEM ≈ AdjEM)
      const [homeBartt, awayBartt] = await Promise.all([
        getBarttovikRatings(homeTeamName),
        getBarttovikRatings(awayTeamName)
      ]);

      const formatTeam = (bartt, teamName) => ({
        team: teamName,
        t_rank: bartt ? `#${bartt.rank}` : 'N/A',
        adj_em: bartt ? ((bartt.adjEM > 0 ? '+' : '') + bartt.adjEM) : 'N/A',
        adj_offense: bartt?.adjOE ?? 'N/A',
        adj_defense: bartt?.adjDE ?? 'N/A',
        tempo: bartt?.tempo ?? 'N/A'
      });

      return {
        category: 'Barttorvik Ratings (T-Rank)',
        source: 'barttorvik.com API (direct)',
        home: formatTeam(homeBartt, homeTeamName),
        away: formatTeam(awayBartt, awayTeamName)
      };
    } catch (error) {
      console.warn('[Stat Router] Barttorvik ratings fetch failed:', error.message);
      return {
        category: 'Barttorvik Ratings',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name, t_rank: 'N/A' },
        away: { team: away.full_name || away.name, t_rank: 'N/A' }
      };
    }
  },

  NCAAB_NET_RANKING: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching NET rankings for ${awayTeamName} @ ${homeTeamName} via Gemini Grounding (split queries)`);

      const buildNetQuery = (teamName) => `Search ncaa.com for the 2025-26 college basketball season NCAA NET rankings.

What is the NET ranking for ${teamName}?

Respond with ONLY:
NET Ranking: [number]
Quad 1 Record: [W-L]
Quad 2 Record: [W-L]

Only report numbers from ncaa.com. If not found, write "not found".`;

      const groundingOpts = {
        temperature: 1.0,
        maxTokens: 2500,
        systemMessage: 'Search ncaa.com for 2025-26 NET rankings. Report only the numbers requested — no commentary.'
      };

      const [homeResponse, awayResponse] = await Promise.all([
        geminiGroundingSearch(buildNetQuery(homeTeamName), groundingOpts),
        geminiGroundingSearch(buildNetQuery(awayTeamName), groundingOpts)
      ]);

      const extractNetData = (response) => {
        const content = (response?.content || response?.choices?.[0]?.message?.content || '').toLowerCase();
        const netMatch = content.match(/net[^\d]*#?\s*(\d{1,3})/i) || content.match(/rank[^\d]*#?\s*(\d{1,3})/i);
        const q1Match = content.match(/quad\s*1[^\d]*(\d+-\d+)/i);
        const q2Match = content.match(/quad\s*2[^\d]*(\d+-\d+)/i);
        return {
          net_rank: netMatch ? netMatch[1] : 'N/A',
          quad_1: q1Match ? q1Match[1] : 'N/A',
          quad_2: q2Match ? q2Match[1] : 'N/A'
        };
      };

      return {
        category: 'NET Ranking',
        source: 'NCAA via Gemini Grounding',
        home: {
          team: homeTeamName,
          ...extractNetData(homeResponse)
        },
        away: {
          team: awayTeamName,
          ...extractNetData(awayResponse)
        },
        raw_response: `HOME: ${(homeResponse?.content || '')}\n---\nAWAY: ${(awayResponse?.content || '')}`
      };
    } catch (error) {
      console.warn('[Stat Router] NET Ranking fetch failed:', error.message);
      return {
        category: 'NET Ranking',
        error: 'NET data unavailable',
        home: { team: home.full_name || home.name, net_rank: 'N/A' },
        away: { team: away.full_name || away.name, net_rank: 'N/A' }
      };
    }
  },

  NCAAB_STRENGTH_OF_SCHEDULE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching Strength of Schedule for ${awayTeamName} @ ${homeTeamName} via Barttorvik API`);

      // WAB (Wins Above Bubble) is an SOS-adjusted metric — teams with high WAB beat tough opponents
      const [homeBartt, awayBartt] = await Promise.all([
        getBarttovikRatings(homeTeamName),
        getBarttovikRatings(awayTeamName)
      ]);

      return {
        category: 'Strength of Schedule (Barttorvik)',
        source: 'barttorvik.com API (direct)',
        home: {
          team: homeTeamName,
          t_rank: homeBartt?.rank ?? 'N/A',
          wab: homeBartt?.wab ?? 'N/A',
          record: homeBartt?.record ?? 'N/A',
          barthag: homeBartt?.barthag ?? 'N/A',
          conference: homeBartt?.conferenceName ?? 'N/A'
        },
        away: {
          team: awayTeamName,
          t_rank: awayBartt?.rank ?? 'N/A',
          wab: awayBartt?.wab ?? 'N/A',
          record: awayBartt?.record ?? 'N/A',
          barthag: awayBartt?.barthag ?? 'N/A',
          conference: awayBartt?.conferenceName ?? 'N/A'
        },
        note: 'WAB (Wins Above Bubble) reflects schedule-adjusted quality. Higher WAB = more quality wins against the schedule.'
      };
    } catch (error) {
      console.warn('[Stat Router] SOS fetch failed:', error.message);
      return {
        category: 'Strength of Schedule',
        error: 'SOS data unavailable',
        home: { team: home.full_name || home.name, sos_rank: 'N/A' },
        away: { team: away.full_name || away.name, sos_rank: 'N/A' }
      };
    }
  },

  NCAAB_QUAD_RECORD: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching Quad records for ${awayTeamName} @ ${homeTeamName} via Gemini Grounding`);

      // Ask for team-separated format to prevent cross-contamination
      const query = `What are the current Quad 1, Quad 2, Quad 3, and Quad 4 records for ${homeTeamName} and ${awayTeamName} college basketball teams in the ${getCurrentSeasonString()} season?

Quad records are based on opponent NET ranking and game location (home/away/neutral).

Format EXACTLY as:
=== ${homeTeamName} ===
Quad 1: [W-L]
Quad 2: [W-L]
Quad 3: [W-L]
Quad 4: [W-L]

=== ${awayTeamName} ===
Quad 1: [W-L]
Quad 2: [W-L]
Quad 3: [W-L]
Quad 4: [W-L]`;

      const response = await geminiGroundingSearch(query, {
        temperature: 1.0,
        maxTokens: 2500,
        systemMessage: 'You are a college basketball expert specializing in NCAA tournament metrics. Provide accurate Quad records with complete data for BOTH teams. Format each team separately.'
      });

      const content = response?.data || '';

      // Extract Quad records — split by team name to prevent first-match contamination
      const extractQuads = (text, teamName) => {
        // Isolate team section: find team name, take everything until the next team header or end
        const teamLower = teamName.toLowerCase();
        const textLower = text.toLowerCase();
        const teamIdx = textLower.indexOf(teamLower);

        let teamSection = text;
        if (teamIdx >= 0) {
          // Start from the team name, go until we hit another "===" or the other team
          const afterTeam = text.substring(teamIdx);
          // Find the next team separator (=== or the start of another team section)
          const nextSeparator = afterTeam.substring(teamLower.length).search(/===|\n\s*\n\s*[A-Z]/);
          teamSection = nextSeparator > 0
            ? afterTeam.substring(0, teamLower.length + nextSeparator)
            : afterTeam;
        }

        const q1Match = teamSection.match(/quad\s*1[^\d]*(\d+-\d+)/i);
        const q2Match = teamSection.match(/quad\s*2[^\d]*(\d+-\d+)/i);
        const q3Match = teamSection.match(/quad\s*3[^\d]*(\d+-\d+)/i);
        const q4Match = teamSection.match(/quad\s*4[^\d]*(\d+-\d+)/i);

        return {
          quad_1: q1Match ? q1Match[1] : 'N/A',
          quad_2: q2Match ? q2Match[1] : 'N/A',
          quad_3: q3Match ? q3Match[1] : 'N/A',
          quad_4: q4Match ? q4Match[1] : 'N/A'
        };
      };

      return {
        category: 'Quad Record (NCAA Tournament Metrics)',
        source: 'NCAA via Gemini Grounding',
        home: {
          team: homeTeamName,
          ...extractQuads(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...extractQuads(content, awayTeamName)
        },
        raw_response: content
      };
    } catch (error) {
      console.warn('[Stat Router] Quad Record fetch failed:', error.message);
      return {
        category: 'Quad Record',
        error: 'Quad data unavailable',
        home: { team: home.full_name || home.name, quad_1: 'N/A' },
        away: { team: away.full_name || away.name, quad_1: 'N/A' }
      };
    }
  },

  // ===== NCAAB BARTTORVIK T-RANK AND TEMPO-FREE STATS =====
  // Uses barttorvik.com which defaults to 2026 season
  NCAAB_BARTTORVIK: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching Barttorvik T-Rank for ${awayTeamName} @ ${homeTeamName} via Barttorvik API`);

      const [homeBartt, awayBartt] = await Promise.all([
        getBarttovikRatings(homeTeamName),
        getBarttovikRatings(awayTeamName)
      ]);

      const formatTeam = (bartt, teamName) => ({
        team: teamName,
        t_rank: bartt?.rank ?? 'N/A',
        adj_oe: bartt?.adjOE ?? 'N/A',
        adj_de: bartt?.adjDE ?? 'N/A',
        adj_em: bartt?.adjEM ?? 'N/A',
        barthag: bartt?.barthag ?? 'N/A',
        wab: bartt?.wab ?? 'N/A',
        tempo: bartt?.tempo ?? 'N/A',
        record: bartt?.record ?? 'N/A',
        conference: bartt?.conferenceName ?? 'N/A'
      });

      return {
        category: 'Barttorvik T-Rank (2026 Season)',
        source: 'barttorvik.com API (direct)',
        season: '2026',
        home: formatTeam(homeBartt, homeTeamName),
        away: formatTeam(awayBartt, awayTeamName)
      };
    } catch (error) {
      console.warn('[Stat Router] Barttorvik fetch failed:', error.message);
      return {
        category: 'Barttorvik T-Rank',
        error: 'Barttorvik data unavailable',
        home: { team: home.full_name || home.name, t_rank: 'N/A' },
        away: { team: away.full_name || away.name, t_rank: 'N/A' }
      };
    }
  },

  // ===== NCAAB HOME/AWAY SPLITS VIA BDL GAME RESULTS =====
  // Computes Season/L10/L5 home vs away records + point margins from BDL games

  NCAAB_HOME_AWAY_SPLITS: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;

    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching NCAAB Home/Away Splits for ${awayTeamName} @ ${homeTeamName} via BDL Games`);

      // Fetch full season games for both teams
      const [homeGamesRaw, awayGamesRaw] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 50 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 50 })
      ]);

      const filterCompleted = (games) => (Array.isArray(games) ? games : games?.data || [])
        .filter(g => (g.home_team_score ?? g.home_score ?? 0) > 0 || (g.visitor_team_score ?? g.away_score ?? 0) > 0)
        .sort((a, b) => new Date(b.date || b.datetime) - new Date(a.date || a.datetime));

      const homeGames = filterCompleted(homeGamesRaw);
      const awayGames = filterCompleted(awayGamesRaw);

      // Compute home/away splits for a slice of games
      const calcSplitsForSlice = (games, teamId, teamName) => {
        if (!games || games.length === 0) return null;
        let homeWins = 0, homeLosses = 0, awayWins = 0, awayLosses = 0;
        let homePts = 0, homeOppPts = 0, homeGamesCount = 0;
        let awayPts = 0, awayOppPts = 0, awayGamesCount = 0;

        for (const g of games) {
          const isHome = g.home_team?.id === teamId || (g.home_team?.name || '').toLowerCase().includes(teamName.toLowerCase().split(' ').pop());
          const teamScore = isHome ? (g.home_team_score ?? g.home_score ?? 0) : (g.visitor_team_score ?? g.away_score ?? 0);
          const oppScore = isHome ? (g.visitor_team_score ?? g.away_score ?? 0) : (g.home_team_score ?? g.home_score ?? 0);
          if (teamScore === 0 && oppScore === 0) continue;

          if (isHome) {
            homeGamesCount++;
            homePts += teamScore;
            homeOppPts += oppScore;
            if (teamScore > oppScore) homeWins++; else homeLosses++;
          } else {
            awayGamesCount++;
            awayPts += teamScore;
            awayOppPts += oppScore;
            if (teamScore > oppScore) awayWins++; else awayLosses++;
          }
        }

        return {
          home_record: `${homeWins}-${homeLosses}`,
          away_record: `${awayWins}-${awayLosses}`,
          home_margin: homeGamesCount > 0 ? ((homePts - homeOppPts) / homeGamesCount).toFixed(1) : 'N/A',
          away_margin: awayGamesCount > 0 ? ((awayPts - awayOppPts) / awayGamesCount).toFixed(1) : 'N/A',
          home_games: homeGamesCount,
          away_games: awayGamesCount
        };
      };

      // Compute Season / L10 / L5 splits for a team
      const calcAllSplits = (games, teamId, teamName) => {
        if (!games || games.length === 0) return null;
        return {
          season: calcSplitsForSlice(games, teamId, teamName),
          l10: calcSplitsForSlice(games.slice(0, 10), teamId, teamName),
          l5: calcSplitsForSlice(games.slice(0, 5), teamId, teamName)
        };
      };

      return {
        category: 'Home/Away Splits (NCAAB)',
        source: 'Ball Don\'t Lie API (Game Results)',
        home: {
          team: homeTeamName,
          ...calcAllSplits(homeGames, home.id, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...calcAllSplits(awayGames, away.id, awayTeamName)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB Home/Away Splits failed:', error.message);
      return {
        category: 'Home/Away Splits (NCAAB)',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  NCAAB_RECENT_FORM: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;
    
    try {
      console.log(`[Stat Router] Fetching NCAAB Recent Form with opponent quality`);
      
      // Get last 30 days of games for both teams
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [home.id], 
          seasons: [season],
          per_page: 50
        }),
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [away.id], 
          seasons: [season],
          per_page: 50
        })
      ]);
      
      // Filter to completed games and get last 5
      const filterCompleted = (games) => (games || [])
        .filter(g => g.status === 'post' || g.period_detail === 'Final')
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);
      
      const homeL5 = filterCompleted(homeGames);
      const awayL5 = filterCompleted(awayGames);
      
      const analyzeGames = (games, teamId, teamName) => {
        let wins = 0, losses = 0;
        const details = [];
        let totalMargin = 0;
        
        for (const g of games) {
          const isHome = g.home_team?.id === teamId;
          const teamScore = isHome ? g.home_score : g.away_score;
          const oppScore = isHome ? g.away_score : g.home_score;
          const oppName = isHome ? g.visitor_team?.full_name : g.home_team?.full_name;
          const margin = teamScore - oppScore;
          const won = margin > 0;
          
          if (won) wins++;
          else losses++;
          totalMargin += margin;
          
          details.push({
            opponent: oppName || 'Unknown',
            result: won ? 'W' : 'L',
            score: `${teamScore}-${oppScore}`,
            margin: margin,
            location: isHome ? 'HOME' : 'ROAD'
          });
        }
        
        const avgMargin = games.length > 0 ? (totalMargin / games.length).toFixed(1) : 0;
        
        return {
          team: teamName,
          l5_record: `${wins}-${losses}`,
          avg_margin: avgMargin > 0 ? `+${avgMargin}` : avgMargin,
          trend: wins >= 4 ? 'HOT' : wins <= 1 ? 'COLD' : 'MIXED',
          games: details
        };
      };
      
      return {
        category: 'Recent Form L5 (NCAAB)',
        home: analyzeGames(homeL5, home.id, home.full_name || home.name),
        away: analyzeGames(awayL5, away.id, away.full_name || away.name),
        context: 'L5 record with margin and opponent context. Consider: Who did they play? Close games or blowouts?'
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB Recent Form failed:', error.message);
      return {
        category: 'Recent Form L5',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name, l5_record: 'N/A' },
        away: { team: away.full_name || away.name, l5_record: 'N/A' }
      };
    }
  },

  // ===== NCAAB GROUNDING — CONFERENCE STRENGTH, OPPONENT QUALITY, HOME COURT =====

  NCAAB_CONFERENCE_STRENGTH: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;

    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching NCAAB Conference Strength for ${awayTeamName} @ ${homeTeamName} via Barttorvik API`);

      // Fetch Barttorvik ratings for both teams in parallel
      const [homeRatings, awayRatings] = await Promise.all([
        getBarttovikRatings(homeTeamName),
        getBarttovikRatings(awayTeamName)
      ]);

      const formatTeamConf = (teamName, ratings) => {
        if (!ratings) return `${teamName}: Conference data unavailable`;
        const lines = [`${teamName} — ${ratings.conference || 'Unknown Conference'}`];
        if (ratings.rank != null) lines.push(`  T-Rank: #${ratings.rank}`);
        if (ratings.adjEM != null) lines.push(`  AdjEM: ${ratings.adjEM}`);
        if (ratings.adjOE != null) lines.push(`  AdjOE: ${ratings.adjOE}`);
        if (ratings.adjDE != null) lines.push(`  AdjDE: ${ratings.adjDE}`);
        if (ratings.barthag != null) lines.push(`  Barthag: ${ratings.barthag}`);
        if (ratings.record) lines.push(`  Record: ${ratings.record}`);
        return lines.join('\n');
      };

      const homeConf = homeRatings?.conference || 'Unknown';
      const awayConf = awayRatings?.conference || 'Unknown';
      const sameConference = homeConf !== 'Unknown' && homeConf === awayConf;

      let summary = `--- Conference Context ---\n`;
      summary += formatTeamConf(homeTeamName, homeRatings) + '\n\n';
      summary += formatTeamConf(awayTeamName, awayRatings) + '\n';

      if (sameConference) {
        summary += `\nBoth teams play in the ${homeConf}. This is a conference matchup — familiarity and rivalry dynamics may apply.`;
      } else if (homeConf !== 'Unknown' && awayConf !== 'Unknown') {
        summary += `\n${homeTeamName} plays in the ${homeConf}; ${awayTeamName} plays in the ${awayConf}. Compare T-Rank and AdjEM to gauge relative conference strength.`;
      }

      return {
        category: 'Conference Strength (NCAAB)',
        source: 'Barttorvik API',
        home_team: homeTeamName,
        away_team: awayTeamName,
        home_conference: homeConf,
        away_conference: awayConf,
        home_ratings: homeRatings || null,
        away_ratings: awayRatings || null,
        raw_response: summary,
        context: 'T-Rank and AdjEM provide context for interpreting team stats. A team ranked 40th in a strong conference faces tougher nightly competition than one ranked 40th in a weak conference.'
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB Conference Strength fetch failed:', error.message);
      return {
        category: 'Conference Strength',
        error: 'Conference strength data unavailable',
        home_team: home.full_name || home.name,
        away_team: away.full_name || away.name
      };
    }
  },

  NCAAB_OPPONENT_QUALITY: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;

    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching NCAAB Opponent Quality for ${awayTeamName} @ ${homeTeamName} via Barttorvik API`);

      const [homeBartt, awayBartt] = await Promise.all([
        getBarttovikRatings(homeTeamName),
        getBarttovikRatings(awayTeamName)
      ]);

      return {
        category: 'Opponent Quality Filter (NCAAB)',
        source: 'barttorvik.com API (direct)',
        home: {
          team: homeTeamName,
          t_rank: homeBartt?.rank ?? 'N/A',
          wab: homeBartt?.wab ?? 'N/A',
          barthag: homeBartt?.barthag ?? 'N/A',
          record: homeBartt?.record ?? 'N/A',
          adjEM: homeBartt?.adjEM ?? 'N/A',
          conference: homeBartt?.conferenceName ?? 'N/A'
        },
        away: {
          team: awayTeamName,
          t_rank: awayBartt?.rank ?? 'N/A',
          wab: awayBartt?.wab ?? 'N/A',
          barthag: awayBartt?.barthag ?? 'N/A',
          record: awayBartt?.record ?? 'N/A',
          adjEM: awayBartt?.adjEM ?? 'N/A',
          conference: awayBartt?.conferenceName ?? 'N/A'
        },
        context: 'WAB (Wins Above Bubble) is schedule-adjusted — high WAB means quality wins against tough opponents. Compare T-Rank gap to the spread to assess market pricing.'
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB Opponent Quality fetch failed:', error.message);
      return {
        category: 'Opponent Quality',
        error: 'Opponent quality data unavailable',
        home_team: home.full_name || home.name,
        away_team: away.full_name || away.name
      };
    }
  },

  NCAAB_HOME_COURT_ADVANTAGE: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;

    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching NCAAB Home Court Advantage for ${awayTeamName} @ ${homeTeamName} via BDL games`);

      // BDL-based: Calculate actual home/away scoring differentials from completed games
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 100 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 100 })
      ]);

      const calcHomeSplits = (games, teamId, teamName) => {
        let homeWins = 0, homeLosses = 0, homePtsFor = 0, homePtsAgainst = 0, homeGamesCount = 0;
        let awayWins = 0, awayLosses = 0, awayPtsFor = 0, awayPtsAgainst = 0, awayGamesCount = 0;

        for (const game of games) {
          const isCompleted = game.status === 'Final' || game.status === 'post' || game.status === 'final' ||
            ((game.home_team_score ?? game.home_score ?? 0) > 0);
          if (!isCompleted) continue;

          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          const teamScore = isHome
            ? (game.home_team_score ?? game.home_score ?? 0)
            : (game.visitor_team_score ?? game.away_score ?? 0);
          const oppScore = isHome
            ? (game.visitor_team_score ?? game.away_score ?? 0)
            : (game.home_team_score ?? game.home_score ?? 0);

          if (teamScore === 0 && oppScore === 0) continue;

          if (isHome) {
            homeGamesCount++;
            homePtsFor += teamScore;
            homePtsAgainst += oppScore;
            if (teamScore > oppScore) homeWins++; else homeLosses++;
          } else {
            awayGamesCount++;
            awayPtsFor += teamScore;
            awayPtsAgainst += oppScore;
            if (teamScore > oppScore) awayWins++; else awayLosses++;
          }
        }

        const homePPG = homeGamesCount > 0 ? (homePtsFor / homeGamesCount).toFixed(1) : 'N/A';
        const homeOppPPG = homeGamesCount > 0 ? (homePtsAgainst / homeGamesCount).toFixed(1) : 'N/A';
        const awayPPG = awayGamesCount > 0 ? (awayPtsFor / awayGamesCount).toFixed(1) : 'N/A';
        const awayOppPPG = awayGamesCount > 0 ? (awayPtsAgainst / awayGamesCount).toFixed(1) : 'N/A';
        const homeMargin = homeGamesCount > 0 ? ((homePtsFor - homePtsAgainst) / homeGamesCount).toFixed(1) : 'N/A';
        const awayMargin = awayGamesCount > 0 ? ((awayPtsFor - awayPtsAgainst) / awayGamesCount).toFixed(1) : 'N/A';

        return {
          home_record: `${homeWins}-${homeLosses}`,
          away_record: `${awayWins}-${awayLosses}`,
          home_ppg: homePPG,
          home_opp_ppg: homeOppPPG,
          home_margin: homeMargin,
          away_ppg: awayPPG,
          away_opp_ppg: awayOppPPG,
          away_margin: awayMargin,
          home_away_margin_gap: (homeGamesCount > 0 && awayGamesCount > 0)
            ? ((homePtsFor - homePtsAgainst) / homeGamesCount - (awayPtsFor - awayPtsAgainst) / awayGamesCount).toFixed(1)
            : 'N/A'
        };
      };

      const homeSplits = calcHomeSplits(homeGames, home.id, homeTeamName);
      const awaySplits = calcHomeSplits(awayGames, away.id, awayTeamName);

      return {
        category: 'Home Court Advantage (NCAAB)',
        source: 'BDL game results (calculated)',
        home: {
          team: homeTeamName,
          ...homeSplits
        },
        away: {
          team: awayTeamName,
          ...awaySplits
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB Home Court Advantage fetch failed:', error.message);
      return {
        category: 'Home Court Advantage',
        error: 'Home court data unavailable',
        home_team: home.full_name || home.name,
        away_team: away.full_name || away.name
      };
    }
  },

  // ===== NCAAB VENUE (Highlightly API — only source for NCAAB arena names) =====

  NCAAB_VENUE: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;

    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching NCAAB Venue for ${awayTeamName} @ ${homeTeamName} via Highlightly`);

      const venue = await getNcaabVenue(homeTeamName, awayTeamName);

      if (!venue) {
        return {
          category: 'Venue (NCAAB)',
          source: 'Highlightly API',
          venue: null,
          note: 'Venue data unavailable — could not match teams or find game in Highlightly',
          home_team: homeTeamName,
          away_team: awayTeamName
        };
      }

      return {
        category: 'Venue (NCAAB)',
        source: 'Highlightly API',
        venue,
        home_team: homeTeamName,
        away_team: awayTeamName
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB Venue fetch failed:', error.message);
      return {
        category: 'Venue (NCAAB)',
        error: 'Venue data unavailable',
        home_team: home.full_name || home.name,
        away_team: away.full_name || away.name
      };
    }
  },

  // ===== NCAAF BDL-BASED STATS (THESE WORK - use team_season_stats) =====
  
  NCAAF_PASSING_OFFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Passing Offense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      // Fetch team season stats from BDL (note: function expects object with teamId, season)
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      return {
        category: 'Passing Offense',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          passing_yards: homeStats?.passing_yards || 'N/A',
          passing_ypg: homeStats?.passing_yards_per_game?.toFixed(1) || 'N/A',
          passing_tds: homeStats?.passing_touchdowns || 'N/A',
          passing_ints: homeStats?.passing_interceptions || 'N/A'
        },
        away: {
          team: awayTeamName,
          passing_yards: awayStats?.passing_yards || 'N/A',
          passing_ypg: awayStats?.passing_yards_per_game?.toFixed(1) || 'N/A',
          passing_tds: awayStats?.passing_touchdowns || 'N/A',
          passing_ints: awayStats?.passing_interceptions || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Passing Offense fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

  NCAAF_RUSHING_OFFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Rushing Offense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      return {
        category: 'Rushing Offense',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          rushing_yards: homeStats?.rushing_yards || 'N/A',
          rushing_ypg: homeStats?.rushing_yards_per_game?.toFixed(1) || 'N/A',
          rushing_tds: homeStats?.rushing_touchdowns || 'N/A'
        },
        away: {
          team: awayTeamName,
          rushing_yards: awayStats?.rushing_yards || 'N/A',
          rushing_ypg: awayStats?.rushing_yards_per_game?.toFixed(1) || 'N/A',
          rushing_tds: awayStats?.rushing_touchdowns || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Rushing Offense fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

  NCAAF_TOTAL_OFFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Total Offense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      const homeTotalYds = (homeStats?.passing_yards || 0) + (homeStats?.rushing_yards || 0);
      const awayTotalYds = (awayStats?.passing_yards || 0) + (awayStats?.rushing_yards || 0);
      const homeTotalYpg = ((homeStats?.passing_yards_per_game || 0) + (homeStats?.rushing_yards_per_game || 0));
      const awayTotalYpg = ((awayStats?.passing_yards_per_game || 0) + (awayStats?.rushing_yards_per_game || 0));
      
      return {
        category: 'Total Offense',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          total_yards: homeTotalYds || 'N/A',
          total_ypg: homeTotalYpg?.toFixed(1) || 'N/A',
          passing_ypg: homeStats?.passing_yards_per_game?.toFixed(1) || 'N/A',
          rushing_ypg: homeStats?.rushing_yards_per_game?.toFixed(1) || 'N/A'
        },
        away: {
          team: awayTeamName,
          total_yards: awayTotalYds || 'N/A',
          total_ypg: awayTotalYpg?.toFixed(1) || 'N/A',
          passing_ypg: awayStats?.passing_yards_per_game?.toFixed(1) || 'N/A',
          rushing_ypg: awayStats?.rushing_yards_per_game?.toFixed(1) || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Total Offense fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

  NCAAF_DEFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Defense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      return {
        category: 'Defense (Yards Allowed)',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          opp_passing_yards: homeStats?.opp_passing_yards || 'N/A',
          opp_rushing_yards: homeStats?.opp_rushing_yards || 'N/A',
          opp_total_yards: ((homeStats?.opp_passing_yards || 0) + (homeStats?.opp_rushing_yards || 0)) || 'N/A'
        },
        away: {
          team: awayTeamName,
          opp_passing_yards: awayStats?.opp_passing_yards || 'N/A',
          opp_rushing_yards: awayStats?.opp_rushing_yards || 'N/A',
          opp_total_yards: ((awayStats?.opp_passing_yards || 0) + (awayStats?.opp_rushing_yards || 0)) || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Defense fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

  NCAAF_SCORING: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Scoring for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      // Calculate TDs from passing + rushing (approximate scoring)
      const homeTotalTds = (homeStats?.passing_touchdowns || 0) + (homeStats?.rushing_touchdowns || 0);
      const awayTotalTds = (awayStats?.passing_touchdowns || 0) + (awayStats?.rushing_touchdowns || 0);
      
      return {
        category: 'Scoring (Touchdowns)',
        data_scope: 'Touchdowns only (total points/PPG not available from BDL for NCAAF)',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          passing_tds: homeStats?.passing_touchdowns || 'N/A',
          rushing_tds: homeStats?.rushing_touchdowns || 'N/A',
          total_tds: homeTotalTds || 'N/A'
        },
        away: {
          team: awayTeamName,
          passing_tds: awayStats?.passing_touchdowns || 'N/A',
          rushing_tds: awayStats?.rushing_touchdowns || 'N/A',
          total_tds: awayTotalTds || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Scoring fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

  NCAAF_TURNOVER_MARGIN: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Turnover Data for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      return {
        category: 'Interceptions',
        data_scope: 'INTs thrown only (full turnover data unavailable from BDL for NCAAF)',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          interceptions_thrown: homeStats?.passing_interceptions || 'N/A'
        },
        away: {
          team: awayTeamName,
          interceptions_thrown: awayStats?.passing_interceptions || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Turnover fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },


  // ===== PLAYERS =====
  TOP_PLAYERS: async (bdlSport, home, away, season) => {
    // For NBA, use player-aggregated base stats which includes top_players
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season)
      ]);
      
      return {
        category: 'Top Players',
        home: {
          team: home.full_name || home.name,
          players: homeStats?.top_players || [{ note: 'No player data' }]
        },
        away: {
          team: away.full_name || away.name,
          players: awayStats?.top_players || [{ note: 'No player data' }]
        }
      };
    }
    
    // For other sports, use the generic fetcher
    const [homePlayers, awayPlayers] = await Promise.all([
      fetchTopPlayersForTeam(bdlSport, home, season),
      fetchTopPlayersForTeam(bdlSport, away, season)
    ]);
    
    return {
      category: 'Top Players',
      home: {
        team: home.full_name || home.name,
        players: homePlayers
      },
      away: {
        team: away.full_name || away.name,
        players: awayPlayers
      }
    };
  },
  
  INJURIES: async (bdlSport, home, away) => {
    const teamIds = [home.id, away.id];
    const injuries = await ballDontLieService.getInjuriesGeneric(bdlSport, { team_ids: teamIds });
    
    const homeInjuries = injuries?.filter(i => 
      i.player?.team?.id === home.id || i.team_id === home.id
    ) || [];
    const awayInjuries = injuries?.filter(i => 
      i.player?.team?.id === away.id || i.team_id === away.id
    ) || [];
    
    return {
      category: 'Injuries',
      home: {
        team: home.full_name || home.name,
        injuries: homeInjuries.map(i => ({
          player: `${i.player?.first_name} ${i.player?.last_name}`,
          position: i.player?.position,
          status: i.status,
          comment: i.comment?.slice(0, 100)
        }))
      },
      away: {
        team: away.full_name || away.name,
        injuries: awayInjuries.map(i => ({
          player: `${i.player?.first_name} ${i.player?.last_name}`,
          position: i.player?.position,
          status: i.status,
          comment: i.comment?.slice(0, 100)
        }))
      }
    };
  },

  // ===== STANDINGS & RECORDS =====
  // ===== STANDINGS & RECORDS =====
  STANDINGS: async (bdlSport, home, away, season) => {
    // NCAAF/NCAAB standings require conference_id - skip to avoid 400 errors
    // Standings snapshot is already fetched in scoutReportBuilder with proper conference handling
    if (bdlSport === 'americanfootball_ncaaf' || bdlSport === 'basketball_ncaab') {
      return {
        category: 'Full Standings & Records',
        note: 'College standings require conference_id. Check the Scout Report standings snapshot for conference records.',
        home: { team: home.full_name || home.name, overall: 'See Scout Report', conference_record: 'See Scout Report' },
        away: { team: away.full_name || away.name, overall: 'See Scout Report', conference_record: 'See Scout Report' }
      };
    }

    const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });

    const homeSt = standings?.find(s => s.team?.id === home.id);
    const awaySt = standings?.find(s => s.team?.id === away.id);
    
    return {
      category: 'Full Standings & Records',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        wins: homeSt?.wins || 'N/A',
        losses: homeSt?.losses || 'N/A',
        overall_record: `${homeSt?.wins || 0}-${homeSt?.losses || 0}`,
        home_record: homeSt?.home_record || 'N/A',
        away_record: homeSt?.road_record || 'N/A',
        conference_record: homeSt?.conference_record || 'N/A',
        conference_rank: homeSt?.conference_rank || 'N/A',
        division_record: homeSt?.division_record || 'N/A',
        division_rank: homeSt?.division_rank || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        wins: awaySt?.wins || 'N/A',
        losses: awaySt?.losses || 'N/A',
        overall_record: `${awaySt?.wins || 0}-${awaySt?.losses || 0}`,
        home_record: awaySt?.home_record || 'N/A',
        away_record: awaySt?.road_record || 'N/A',
        conference_record: awaySt?.conference_record || 'N/A',
        conference_rank: awaySt?.conference_rank || 'N/A',
        division_record: awaySt?.division_record || 'N/A',
        division_rank: awaySt?.division_rank || 'N/A'
      },
      context: homeSt && awaySt ? 
        `${home.name} (${homeSt.wins}-${homeSt.losses}, #${homeSt.conference_rank} in conf) vs ${away.name} (${awaySt.wins}-${awaySt.losses}, #${awaySt.conference_rank} in conf)` :
        'Standings comparison unavailable'
    };
  },
  
  TEAM_RECORD: async (bdlSport, home, away, season) => {
    // Alias for STANDINGS
    return FETCHERS.STANDINGS(bdlSport, home, away, season);
  },
  
  CONFERENCE_STANDING: async (bdlSport, home, away, season) => {
    // Alias for STANDINGS
    return FETCHERS.STANDINGS(bdlSport, home, away, season);
  },
  
  HOME_AWAY_SPLITS: async (bdlSport, home, away, season) => {
    // NCAAB: BDL standings require conference_id — delegate to Gemini Grounding fetcher
    if (bdlSport === 'basketball_ncaab') {
      return FETCHERS.NCAAB_HOME_AWAY_SPLITS(bdlSport, home, away, season);
    }
    // NCAAF: BDL standings require conference_id — no grounding fetcher available
    if (bdlSport === 'americanfootball_ncaaf') {
      return {
        category: 'Home/Away Splits',
        note: 'NCAAF home/away splits unavailable via BDL standings - use RECENT_FORM for game context',
        home: { team: home.full_name || home.name, overall: 'N/A', home_record: 'N/A', away_record: 'N/A' },
        away: { team: away.full_name || away.name, overall: 'N/A', home_record: 'N/A', away_record: 'N/A' }
      };
    }
    
    const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
    
    const homeSt = standings?.find(s => s.team?.id === home.id);
    const awaySt = standings?.find(s => s.team?.id === away.id);
    
    return {
      category: 'Home/Away Splits',
      home: {
        team: home.full_name || home.name,
        overall: homeSt ? `${homeSt.wins}-${homeSt.losses}` : 'N/A',
        home_record: homeSt?.home_record || 'N/A',
        away_record: homeSt?.road_record || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        overall: awaySt ? `${awaySt.wins}-${awaySt.losses}` : 'N/A',
        home_record: awaySt?.home_record || 'N/A',
        away_record: awaySt?.road_record || 'N/A'
      },
      INVESTIGATE: `What was the quality of opponents in these home and away games?`,
      QUALITY_QUESTION: `Ask: How do they perform at home vs GOOD teams? A team can be 12-5 at home but 2-5 vs teams over .500.`
    };
  },

  // ===== CONFERENCE STATS (REAL DATA - from BDL Standings) =====
  CONFERENCE_STATS: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching CONFERENCE_STATS for ${away.name} @ ${home.name}`);
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const homeSt = standings?.find(s => s.team?.id === home.id);
      const awaySt = standings?.find(s => s.team?.id === away.id);
      
      // Parse conference record (format: "X-Y")
      const parseConfRecord = (record) => {
        if (!record || record === 'N/A') return { wins: 0, losses: 0, pct: null };
        const parts = record.split('-');
        const wins = parseInt(parts[0]) || 0;
        const losses = parseInt(parts[1]) || 0;
        const total = wins + losses;
        return { wins, losses, pct: total > 0 ? (wins / total * 100).toFixed(0) : null };
      };
      
      const homeConf = parseConfRecord(homeSt?.conference_record);
      const awayConf = parseConfRecord(awaySt?.conference_record);
      
      return {
        category: 'Conference Performance',
        source: 'Ball Don\'t Lie API (Standings)',
        home: {
          team: home.full_name || home.name,
          conference: homeSt?.team?.conference || 'N/A',
          conference_record: homeSt?.conference_record || 'N/A',
          conference_win_pct: homeConf.pct ? `${homeConf.pct}%` : 'N/A',
          conference_rank: homeSt?.conference_rank || 'N/A',
          division: homeSt?.team?.division || 'N/A',
          division_record: homeSt?.division_record || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          conference: awaySt?.team?.conference || 'N/A',
          conference_record: awaySt?.conference_record || 'N/A',
          conference_win_pct: awayConf.pct ? `${awayConf.pct}%` : 'N/A',
          conference_rank: awaySt?.conference_rank || 'N/A',
          division: awaySt?.team?.division || 'N/A',
          division_record: awaySt?.division_record || 'N/A'
        },
        same_conference: homeSt?.team?.conference === awaySt?.team?.conference,
        same_division: homeSt?.team?.division === awaySt?.team?.division,
        INVESTIGATE: homeSt?.team?.conference === awaySt?.team?.conference
          ? `Conference game. How have these teams performed against each other recently?`
          : `Non-conference game. How do conference records compare?`,
        note: 'Conference record reflects performance against similar-level competition.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching CONFERENCE_STATS:`, error.message);
      return {
        category: 'Conference Performance',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  // ===== NON-CONFERENCE STRENGTH (REAL DATA - calculated from games) =====
  NON_CONF_STRENGTH: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching NON_CONF_STRENGTH for ${away.name} @ ${home.name}`);
    
    try {
      // Get standings to know each team's conference
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const homeSt = standings?.find(s => s.team?.id === home.id);
      const awaySt = standings?.find(s => s.team?.id === away.id);
      
      const homeConf = homeSt?.team?.conference;
      const awayConf = awaySt?.team?.conference;
      
      // Build map of team ID -> conference
      const teamConfMap = {};
      for (const s of standings || []) {
        if (s.team?.id && s.team?.conference) {
          teamConfMap[s.team.id] = s.team.conference;
        }
      }
      
      // Get season games for both teams
      const seasonStart = new Date(season - 1, 9, 1); // Oct 1
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        })
      ]);
      
      // Calculate non-conference record
      const calcNonConfRecord = (games, teamId, teamConf) => {
        let wins = 0, losses = 0;
        const nonConfGames = [];
        
        for (const game of games || []) {
          const homeScore = game.home_team_score || game.home_score || 0;
          const awayScore = game.visitor_team_score || game.away_score || 0;
          if (homeScore === 0 && awayScore === 0) continue; // Unplayed
          
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          const oppId = isHome 
            ? (game.visitor_team?.id || game.visitor_team_id)
            : (game.home_team?.id || game.home_team_id);
          
          const oppConf = teamConfMap[oppId];
          
          // Non-conference = different conference
          if (oppConf && oppConf !== teamConf) {
            const won = isHome ? homeScore > awayScore : awayScore > homeScore;
            if (won) wins++;
            else losses++;
            nonConfGames.push({
              opponent: isHome ? game.visitor_team?.name : game.home_team?.name,
              result: won ? 'W' : 'L',
              opponent_conf: oppConf
            });
          }
        }
        
        const total = wins + losses;
        return {
          record: total > 0 ? `${wins}-${losses}` : 'No non-conf games',
          win_pct: total > 0 ? `${(wins / total * 100).toFixed(0)}%` : 'N/A',
          games_played: total,
          recent: nonConfGames.slice(-3).reverse()
        };
      };
      
      const homeNonConf = calcNonConfRecord(homeGames, home.id, homeConf);
      const awayNonConf = calcNonConfRecord(awayGames, away.id, awayConf);
      
      return {
        category: 'Non-Conference Strength',
        source: 'Ball Don\'t Lie API (calculated)',
        home: {
          team: home.full_name || home.name,
          conference: homeConf || 'N/A',
          non_conf_record: homeNonConf.record,
          non_conf_win_pct: homeNonConf.win_pct,
          non_conf_games: homeNonConf.games_played,
          recent_non_conf: homeNonConf.recent
        },
        away: {
          team: away.full_name || away.name,
          conference: awayConf || 'N/A',
          non_conf_record: awayNonConf.record,
          non_conf_win_pct: awayNonConf.win_pct,
          non_conf_games: awayNonConf.games_played,
          recent_non_conf: awayNonConf.recent
        },
        INVESTIGATE: `How do these teams perform against non-conference opponents?`,
        note: 'Non-conference records provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NON_CONF_STRENGTH:`, error.message);
      return {
        category: 'Non-Conference Strength',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  // ===== DEFENSIVE REBOUNDING (REAL DATA — DREB% from advanced + opponent OREB context) =====
  DREB_RATE: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching DREB_RATE for ${away.name} @ ${home.name}`);

    if (bdlSport !== 'basketball_nba') {
      return {
        category: 'Defensive Rebounding',
        note: 'DREB rate currently only available for NBA',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }

    try {
      const [homeAdvanced, awayAdvanced, homeOpp, awayOpp, homeBase, awayBase] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season),
        fetchNBATeamOpponentStats(home.id, season),
        fetchNBATeamOpponentStats(away.id, season),
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season)
      ]);

      return {
        category: 'Defensive Rebounding',
        source: 'Ball Don\'t Lie API (Advanced + Opponent)',
        home: {
          team: home.full_name || home.name,
          dreb_pct: homeAdvanced?.dreb_pct ? `${homeAdvanced.dreb_pct}%` : 'N/A',
          dreb_per_game: homeBase?.dreb_per_game || 'N/A',
          opp_oreb_per_game: homeOpp?.opp_oreb || 'N/A',
          games_played: homeAdvanced?.games_played || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          dreb_pct: awayAdvanced?.dreb_pct ? `${awayAdvanced.dreb_pct}%` : 'N/A',
          dreb_per_game: awayBase?.dreb_per_game || 'N/A',
          opp_oreb_per_game: awayOpp?.opp_oreb || 'N/A',
          games_played: awayAdvanced?.games_played || 'N/A'
        },
        INVESTIGATE: 'How do these defensive rebounding profiles compare?'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching DREB_RATE:`, error.message);
      return {
        category: 'Defensive Rebounding',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  // ===== POINT DIFFERENTIAL TREND (REAL DATA - L5 vs Season) =====
  EFFICIENCY_TREND: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching EFFICIENCY_TREND (point differential) for ${away.name} @ ${home.name}`);
    
    try {
      // Get season games for point differential trends
      const seasonStart = new Date(season - 1, 9, 1);
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 30
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 30
        })
      ]);
      
      // Calculate efficiency trend (point differential)
      const calcEfficiencyTrend = (games, teamId) => {
        const completed = (games || [])
          .filter(g => {
            const hs = g.home_team_score || g.home_score || 0;
            const as = g.visitor_team_score || g.away_score || 0;
            return hs > 0 || as > 0;
          })
          .sort((a, b) => new Date(b.date || b.game_date) - new Date(a.date || a.game_date));
        
        if (completed.length < 5) return null;
        
        // Calculate point differential for each game
        const margins = completed.map(g => {
          const isHome = (g.home_team?.id || g.home_team_id) === teamId;
          const teamScore = isHome ? (g.home_team_score || g.home_score) : (g.visitor_team_score || g.away_score);
          const oppScore = isHome ? (g.visitor_team_score || g.away_score) : (g.home_team_score || g.home_score);
          return teamScore - oppScore;
        });
        
        const l5Margins = margins.slice(0, 5);
        const l10Margins = margins.slice(0, 10);
        const seasonMargins = margins;
        
        const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        
        const l5Avg = avg(l5Margins);
        const l10Avg = avg(l10Margins);
        const seasonAvg = avg(seasonMargins);
        
        // Determine trend
        let trend = 'STABLE';
        let trendDetail = '';
        if (l5Avg > seasonAvg + 3) {
          trend = 'SURGING';
          trendDetail = `L5 margin (${l5Avg > 0 ? '+' : ''}${l5Avg.toFixed(1)}) is ${(l5Avg - seasonAvg).toFixed(1)} pts above season avg`;
        } else if (l5Avg < seasonAvg - 3) {
          trend = 'SLUMPING';
          trendDetail = `L5 margin (${l5Avg > 0 ? '+' : ''}${l5Avg.toFixed(1)}) is ${(seasonAvg - l5Avg).toFixed(1)} pts below season avg`;
        } else if (l5Avg > l10Avg + 2) {
          trend = 'IMPROVING';
          trendDetail = `L5 (${l5Avg > 0 ? '+' : ''}${l5Avg.toFixed(1)}) better than L10 (${l10Avg > 0 ? '+' : ''}${l10Avg.toFixed(1)})`;
        } else if (l5Avg < l10Avg - 2) {
          trend = 'DECLINING';
          trendDetail = `L5 (${l5Avg > 0 ? '+' : ''}${l5Avg.toFixed(1)}) worse than L10 (${l10Avg > 0 ? '+' : ''}${l10Avg.toFixed(1)})`;
        }
        
        return {
          l5_margin: `${l5Avg > 0 ? '+' : ''}${l5Avg.toFixed(1)}`,
          l10_margin: `${l10Avg > 0 ? '+' : ''}${l10Avg.toFixed(1)}`,
          season_margin: `${seasonAvg > 0 ? '+' : ''}${seasonAvg.toFixed(1)}`,
          trend,
          trend_detail: trendDetail,
          games_analyzed: completed.length
        };
      };
      
      const homeTrend = calcEfficiencyTrend(homeGames, home.id);
      const awayTrend = calcEfficiencyTrend(awayGames, away.id);
      
      return {
        category: 'Point Differential Trend (L5 vs L10 vs Season)',
        source: 'Ball Don\'t Lie API (calculated)',
        data_scope: 'Point differential trends (not pace-adjusted efficiency)',
        home: {
          team: home.full_name || home.name,
          ...homeTrend
        },
        away: {
          team: away.full_name || away.name,
          ...awayTrend
        },
        INVESTIGATE: `How do the point differential trends compare? Is either team surging or slumping?`,
        note: 'These are raw point differentials, not per-100-possession efficiency. Use alongside ORtg/DRtg for pace-adjusted context.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching EFFICIENCY_TREND:`, error.message);
      return {
        category: 'Efficiency Trend',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  // ===== THREE POINT DEFENSE (REAL DATA — opponent 3PT% + volume from BDL) =====
  THREE_PT_DEFENSE: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching THREE_PT_DEFENSE for ${away.name} @ ${home.name}`);
    const [homeOpp, awayOpp] = await Promise.all([
      fetchNBATeamOpponentStats(home.id, season),
      fetchNBATeamOpponentStats(away.id, season)
    ]);
    return {
      category: 'Three Point Defense',
      source: 'Ball Don\'t Lie API (Opponent Stats)',
      home: {
        team: home.full_name || home.name,
        opp_fg3_pct: homeOpp?.opp_fg3_pct ? `${homeOpp.opp_fg3_pct}%` : 'N/A',
        opp_fg3a_per_game: homeOpp?.opp_fg3a_per_game || 'N/A',
        opp_fg3m_per_game: homeOpp?.opp_fg3m_per_game || 'N/A',
        games_played: homeOpp?.games_played || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        opp_fg3_pct: awayOpp?.opp_fg3_pct ? `${awayOpp.opp_fg3_pct}%` : 'N/A',
        opp_fg3a_per_game: awayOpp?.opp_fg3a_per_game || 'N/A',
        opp_fg3m_per_game: awayOpp?.opp_fg3m_per_game || 'N/A',
        games_played: awayOpp?.games_played || 'N/A'
      },
      INVESTIGATE: 'How do these perimeter defense profiles compare?'
    };
  },

  // ===== OPPONENT FREE THROW RATE (REAL DATA — from BDL opponent stats) =====
  OPP_FT_RATE: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching OPP_FT_RATE for ${away.name} @ ${home.name}`);

    try {
      const [homeOpp, awayOpp] = await Promise.all([
        fetchNBATeamOpponentStats(home.id, season),
        fetchNBATeamOpponentStats(away.id, season)
      ]);

      return {
        category: 'Opponent Free Throw Rate (Foul Discipline)',
        source: 'Ball Don\'t Lie API (Opponent Stats)',
        home: {
          team: home.full_name || home.name,
          opp_ft_rate: homeOpp?.opp_ft_rate ? `${homeOpp.opp_ft_rate}%` : 'N/A',
          opp_fta_per_game: homeOpp?.opp_fta_per_game || 'N/A',
          opp_ftm_per_game: homeOpp?.opp_ftm_per_game || 'N/A',
          games_played: homeOpp?.games_played || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          opp_ft_rate: awayOpp?.opp_ft_rate ? `${awayOpp.opp_ft_rate}%` : 'N/A',
          opp_fta_per_game: awayOpp?.opp_fta_per_game || 'N/A',
          opp_ftm_per_game: awayOpp?.opp_ftm_per_game || 'N/A',
          games_played: awayOpp?.games_played || 'N/A'
        },
        INVESTIGATE: 'How do these foul discipline profiles compare?'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching OPP_FT_RATE:`, error.message);
      return {
        category: 'Opponent Free Throw Rate',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  // ===== OPPONENT EFFECTIVE FG% (REAL DATA — from BDL opponent stats) =====
  OPP_EFG_PCT: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching OPP_EFG_PCT for ${away.name} @ ${home.name}`);
    const [homeOpp, awayOpp] = await Promise.all([
      fetchNBATeamOpponentStats(home.id, season),
      fetchNBATeamOpponentStats(away.id, season)
    ]);
    return {
      category: 'Opponent Shooting Efficiency',
      source: 'Ball Don\'t Lie API (Opponent Stats)',
      home: {
        team: home.full_name || home.name,
        opp_efg_pct: homeOpp?.opp_efg_pct ? `${homeOpp.opp_efg_pct}%` : 'N/A',
        opp_fg_pct: homeOpp?.opp_fg_pct ? `${homeOpp.opp_fg_pct}%` : 'N/A',
        opp_fg3_pct: homeOpp?.opp_fg3_pct ? `${homeOpp.opp_fg3_pct}%` : 'N/A',
        games_played: homeOpp?.games_played || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        opp_efg_pct: awayOpp?.opp_efg_pct ? `${awayOpp.opp_efg_pct}%` : 'N/A',
        opp_fg_pct: awayOpp?.opp_fg_pct ? `${awayOpp.opp_fg_pct}%` : 'N/A',
        opp_fg3_pct: awayOpp?.opp_fg3_pct ? `${awayOpp.opp_fg3_pct}%` : 'N/A',
        games_played: awayOpp?.games_played || 'N/A'
      },
      INVESTIGATE: 'How do these defensive shooting profiles compare?'
    };
  },

  // ===== OPPONENT TURNOVER RATE (REAL DATA — from BDL opponent stats) =====
  OPP_TOV_RATE: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching OPP_TOV_RATE for ${away.name} @ ${home.name}`);
    const [homeOpp, awayOpp] = await Promise.all([
      fetchNBATeamOpponentStats(home.id, season),
      fetchNBATeamOpponentStats(away.id, season)
    ]);
    return {
      category: 'Opponent Turnover Rate',
      source: 'Ball Don\'t Lie API (Opponent Stats)',
      home: {
        team: home.full_name || home.name,
        opp_tov_rate: homeOpp?.opp_tov_rate ? `${homeOpp.opp_tov_rate}%` : 'N/A',
        opp_tov_per_game: homeOpp?.opp_tov_per_game || 'N/A',
        games_played: homeOpp?.games_played || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        opp_tov_rate: awayOpp?.opp_tov_rate ? `${awayOpp.opp_tov_rate}%` : 'N/A',
        opp_tov_per_game: awayOpp?.opp_tov_per_game || 'N/A',
        games_played: awayOpp?.games_played || 'N/A'
      },
      INVESTIGATE: 'How do these turnover-forcing profiles compare?'
    };
  },

  // ===== PACE LAST 10 GAMES (REAL season pace + L10 scoring trend) =====
  PACE_LAST_10: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching PACE_LAST_10 for ${away.name} @ ${home.name}`);

    if (bdlSport !== 'basketball_nba') {
      return { category: 'Pace Last 10', note: 'Only available for NBA' };
    }

    try {
      // Get recent games + season advanced stats (for real pace) in parallel
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [homeGames, awayGames, homeAdvanced, awayAdvanced] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: thirtyDaysAgo.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 15
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: thirtyDaysAgo.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 15
        }),
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);

      // Calculate L10 scoring trend (recent data, not a proxy)
      const calcRecentPace = (games, teamId) => {
        const completed = (games || [])
          .filter(g => ((g.home_team_score ?? g.home_score ?? 0) > 0))
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 10);

        if (completed.length < 5) return null;

        let totalPts = 0, totalOppPts = 0;
        for (const g of completed) {
          const isHome = g.home_team?.id === teamId;
          totalPts += isHome ? (g.home_team_score ?? g.home_score ?? 0) : (g.visitor_team_score ?? g.away_score ?? 0);
          totalOppPts += isHome ? (g.visitor_team_score ?? g.away_score ?? 0) : (g.home_team_score ?? g.home_score ?? 0);
        }

        return {
          games_analyzed: completed.length,
          last_10_total_ppg: ((totalPts + totalOppPts) / completed.length).toFixed(1),
          last_10_team_ppg: (totalPts / completed.length).toFixed(1),
          last_10_opp_ppg: (totalOppPts / completed.length).toFixed(1)
        };
      };

      const homePace = calcRecentPace(homeGames, home.id);
      const awayPace = calcRecentPace(awayGames, away.id);

      return {
        category: 'Pace - Season + Last 10 Games',
        source: 'Ball Don\'t Lie API (Advanced + Recent Games)',
        home: {
          team: home.full_name || home.name,
          season_pace: homeAdvanced?.pace || 'N/A',
          ...homePace
        },
        away: {
          team: away.full_name || away.name,
          season_pace: awayAdvanced?.pace || 'N/A',
          ...awayPace
        },
        INVESTIGATE: 'How do these pace profiles compare?'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching PACE_LAST_10:`, error.message);
      return {
        category: 'Pace Last 10',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  // ===== PACE HOME vs AWAY (REAL season pace + venue scoring splits) =====
  PACE_HOME_AWAY: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching PACE_HOME_AWAY for ${away.name} @ ${home.name}`);

    if (bdlSport !== 'basketball_nba') {
      return { category: 'Pace Splits', note: 'Only available for NBA' };
    }

    try {
      const seasonStart = new Date(season - 1, 9, 1);
      const today = new Date();

      const [homeGames, awayGames, homeAdvanced, awayAdvanced] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        }),
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);

      // Calculate home/away scoring splits (venue-specific data)
      const calcPaceSplits = (games, teamId) => {
        const completed = (games || []).filter(g => ((g.home_team_score ?? g.home_score ?? 0) > 0));

        const homeGamesOnly = completed.filter(g => g.home_team?.id === teamId);
        const roadGamesOnly = completed.filter(g => g.visitor_team?.id === teamId);

        const calcAvgTotal = (gList) => {
          if (gList.length === 0) return null;
          let total = 0;
          for (const g of gList) {
            total += (g.home_team_score ?? g.home_score ?? 0) + (g.visitor_team_score ?? g.away_score ?? 0);
          }
          return (total / gList.length).toFixed(1);
        };

        const homeTotalPpg = calcAvgTotal(homeGamesOnly);
        const roadTotalPpg = calcAvgTotal(roadGamesOnly);

        return {
          home_total_ppg: homeTotalPpg,
          home_games: homeGamesOnly.length,
          away_total_ppg: roadTotalPpg,
          away_games: roadGamesOnly.length,
          home_away_diff: homeTotalPpg && roadTotalPpg
            ? (parseFloat(homeTotalPpg) - parseFloat(roadTotalPpg)).toFixed(1)
            : 'N/A'
        };
      };

      const homeSplits = calcPaceSplits(homeGames, home.id);
      const awaySplits = calcPaceSplits(awayGames, away.id);

      return {
        category: 'Pace - Season + Home vs Road Splits',
        source: 'Ball Don\'t Lie API (Advanced + Game Splits)',
        home: {
          team: home.full_name || home.name,
          season_pace: homeAdvanced?.pace || 'N/A',
          home_total_ppg: homeSplits.home_total_ppg,
          away_total_ppg: homeSplits.away_total_ppg,
          home_away_diff: homeSplits.home_away_diff,
          home_games: homeSplits.home_games,
          away_games: homeSplits.away_games,
          note: 'Playing at HOME tonight'
        },
        away: {
          team: away.full_name || away.name,
          season_pace: awayAdvanced?.pace || 'N/A',
          home_total_ppg: awaySplits.home_total_ppg,
          away_total_ppg: awaySplits.away_total_ppg,
          home_away_diff: awaySplits.home_away_diff,
          home_games: awaySplits.home_games,
          away_games: awaySplits.away_games,
          note: 'Playing on ROAD tonight'
        },
        INVESTIGATE: 'How do these home/away pace splits compare?'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching PACE_HOME_AWAY:`, error.message);
      return {
        category: 'Pace Splits',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  // ===== PAINT SCORING (REAL DATA from BDL scoring type breakdown) =====
  PAINT_SCORING: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching PAINT_SCORING (real zone data) for ${away.name} @ ${home.name}`);
    const [homeAdvanced, awayAdvanced] = await Promise.all([
      fetchNBATeamAdvancedStats(home.id, season),
      fetchNBATeamAdvancedStats(away.id, season)
    ]);

    const formatScoringZones = (stats) => {
      if (!stats?.scoring_profile) return { error: 'Scoring profile unavailable' };
      return {
        pct_paint: stats.scoring_profile.pct_paint || 'N/A',
        pct_midrange: stats.scoring_profile.pct_midrange || 'N/A',
        pct_3pt: stats.scoring_profile.pct_3pt || 'N/A',
        pct_fastbreak: stats.scoring_profile.pct_fastbreak || 'N/A'
      };
    };

    return {
      category: 'Scoring Zone Breakdown (Paint, Midrange, 3PT, Fastbreak)',
      source: 'Ball Don\'t Lie API (Scoring Type)',
      home: {
        team: home.full_name || home.name,
        ...formatScoringZones(homeAdvanced)
      },
      away: {
        team: away.full_name || away.name,
        ...formatScoringZones(awayAdvanced)
      },
      INVESTIGATE: 'Which team scores more in the paint vs from three? How does this matchup with the opponent defense?'
    };
  },

  // ===== MIDRANGE SHOOTING (REAL DATA from BDL scoring type breakdown) =====
  MIDRANGE: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching MIDRANGE (real zone data) for ${away.name} @ ${home.name}`);

    try {
      const [homeAdvanced, awayAdvanced] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);

      const formatMidrange = (stats) => {
        if (!stats?.scoring_profile) return { error: 'Scoring profile unavailable' };
        return {
          pct_midrange: stats.scoring_profile.pct_midrange || 'N/A',
          pct_paint: stats.scoring_profile.pct_paint || 'N/A',
          pct_3pt: stats.scoring_profile.pct_3pt || 'N/A'
        };
      };

      return {
        category: 'Midrange Shooting (Zone Breakdown)',
        source: 'Ball Don\'t Lie API (Scoring Type)',
        home: {
          team: home.full_name || home.name,
          ...formatMidrange(homeAdvanced)
        },
        away: {
          team: away.full_name || away.name,
          ...formatMidrange(awayAdvanced)
        },
        INVESTIGATE: `How reliant is each team on midrange vs paint vs three? Does midrange usage create a matchup edge?`,
        note: 'Percentages show share of total scoring from each zone.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching MIDRANGE:`, error.message);
      return {
        category: 'Midrange Shooting',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  // ===== PAINT DEFENSE (REAL DATA — opponent paint pts + fast break pts from BDL defense stats) =====
  PAINT_DEFENSE: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching PAINT_DEFENSE for ${away.name} @ ${home.name}`);
    const [homeAdvanced, awayAdvanced, homeBase, awayBase, homeDefense, awayDefense] = await Promise.all([
      fetchNBATeamAdvancedStats(home.id, season),
      fetchNBATeamAdvancedStats(away.id, season),
      fetchNBATeamBaseStats(home.id, season),
      fetchNBATeamBaseStats(away.id, season),
      fetchNBATeamDefenseStats(home.id, season),
      fetchNBATeamDefenseStats(away.id, season)
    ]);
    return {
      category: 'Paint Defense',
      source: 'Ball Don\'t Lie API (Defense + Advanced + Base)',
      home: {
        team: home.full_name || home.name,
        opp_pts_paint: homeDefense?.opp_pts_paint || 'N/A',
        opp_pts_fb: homeDefense?.opp_pts_fb || 'N/A',
        defensive_rating: homeAdvanced?.defensive_rating || 'N/A',
        blk_per_game: homeBase?.blk_per_game || 'N/A',
        games_played: homeDefense?.games_played || homeAdvanced?.games_played || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        opp_pts_paint: awayDefense?.opp_pts_paint || 'N/A',
        opp_pts_fb: awayDefense?.opp_pts_fb || 'N/A',
        defensive_rating: awayAdvanced?.defensive_rating || 'N/A',
        blk_per_game: awayBase?.blk_per_game || 'N/A',
        games_played: awayDefense?.games_played || awayAdvanced?.games_played || 'N/A'
      },
      INVESTIGATE: 'How do these paint defense profiles compare?'
    };
  },

  // ===== TRANSITION DEFENSE (BDL Defense Stats) =====
  TRANSITION_DEFENSE: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching TRANSITION_DEFENSE for ${away.name} @ ${home.name}`);

    if (bdlSport === 'basketball_nba') {
      const [homeDefense, awayDefense, homeAdvanced, awayAdvanced] = await Promise.all([
        fetchNBATeamDefenseStats(home.id, season),
        fetchNBATeamDefenseStats(away.id, season),
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);

      return {
        category: 'Transition Defense (Fast Break & Turnover Points Allowed)',
        source: 'Ball Don\'t Lie API (Defense Stats)',
        home: {
          team: home.full_name || home.name,
          opp_pts_fb: homeDefense?.opp_pts_fb || 'N/A',
          opp_pts_off_tov: homeDefense?.opp_pts_off_tov || 'N/A',
          pace: homeAdvanced?.pace || 'N/A',
          games_played: homeDefense?.games_played || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          opp_pts_fb: awayDefense?.opp_pts_fb || 'N/A',
          opp_pts_off_tov: awayDefense?.opp_pts_off_tov || 'N/A',
          pace: awayAdvanced?.pace || 'N/A',
          games_played: awayDefense?.games_played || 'N/A'
        },
        INVESTIGATE: 'How do these transition defense profiles compare?'
      };
    }

    // Non-NBA fallback
    return {
      category: 'Transition Defense',
      note: 'Transition defense data only available for NBA',
      home: { team: home.full_name || home.name },
      away: { team: away.full_name || away.name }
    };
  },

  // KEEP: Grounding required - BDL does not have 5-man lineup data. Unique data not available elsewhere.
  // ===== LINEUP NET RATINGS (First Unit & Second Unit Performance - GROUNDING) =====
  LINEUP_NET_RATINGS: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching LINEUP_NET_RATINGS for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'basketball_nba') {
      return { category: 'Lineup Net Ratings', note: 'Only available for NBA' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `${seasonStr} NBA lineup net rating first unit second unit bench ${home.name} vs ${away.name}.
        What is each team's:
        1. Starting lineup (first unit) net rating
        2. Bench unit (second unit) net rating
        3. Best performing 5-man lineup
        4. Death lineup or closing lineup if they have one
        Include minutes played for key lineups.`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NBA lineup analyst. Provide lineup net ratings for starters, bench, and key 5-man combinations for both teams.'
      });
      
      return {
        category: 'Lineup Net Ratings (First & Second Unit)',
        source: 'Gemini Grounding (Live Search)',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `What is the gap between starter and bench net rating for each team?`,
        note: 'Starter vs bench unit stats provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching LINEUP_NET_RATINGS:`, error.message);
      return {
        category: 'Lineup Net Ratings',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  // ===== TRAVEL SITUATION (Time Zone & Fatigue) =====
  TRAVEL_SITUATION: async (bdlSport, home, away, season, options = {}) => {
    console.log(`[Stat Router] Fetching TRAVEL_SITUATION for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'basketball_nba') {
      return { category: 'Travel Situation', note: 'Currently only available for NBA' };
    }
    
    // NBA team time zones (simplified)
    const teamTimeZones = {
      // Pacific (PT)
      'Lakers': 'PT', 'Clippers': 'PT', 'Warriors': 'PT', 'Kings': 'PT',
      'Trail Blazers': 'PT', 'Blazers': 'PT',
      // Mountain (MT)
      'Nuggets': 'MT', 'Jazz': 'MT', 'Suns': 'MT',
      // Central (CT)
      'Mavericks': 'CT', 'Spurs': 'CT', 'Rockets': 'CT', 'Pelicans': 'CT',
      'Grizzlies': 'CT', 'Timberwolves': 'CT', 'Thunder': 'CT', 'Bulls': 'CT',
      'Bucks': 'CT',
      // Eastern (ET)
      'Celtics': 'ET', 'Nets': 'ET', 'Knicks': 'ET', '76ers': 'ET', 'Sixers': 'ET',
      'Raptors': 'ET', 'Heat': 'ET', 'Magic': 'ET', 'Hawks': 'ET', 'Hornets': 'ET',
      'Wizards': 'ET', 'Cavaliers': 'ET', 'Cavs': 'ET', 'Pistons': 'ET', 'Pacers': 'ET'
    };
    
    const getTimeZone = (teamName) => {
      for (const [key, tz] of Object.entries(teamTimeZones)) {
        if (teamName.includes(key)) return tz;
      }
      return 'ET'; // Default
    };
    
    const tzOrder = { 'PT': 0, 'MT': 1, 'CT': 2, 'ET': 3 };
    
    const homeTz = getTimeZone(home.name || home.full_name);
    const awayTz = getTimeZone(away.name || away.full_name);
    
    const tzDiff = tzOrder[homeTz] - tzOrder[awayTz];
    
    let travelImpact = 'NEUTRAL';
    let travelNote = '';

    if (tzDiff >= 2) {
      travelImpact = 'AWAY TEAM DISADVANTAGE';
      travelNote = `${away.name} traveling EAST across ${Math.abs(tzDiff)} time zones.`;
    } else if (tzDiff <= -2) {
      travelImpact = 'MILD AWAY DISADVANTAGE';
      travelNote = `${away.name} traveling WEST across ${Math.abs(tzDiff)} time zones.`;
    } else if (Math.abs(tzDiff) === 1) {
      travelImpact = 'MINIMAL IMPACT';
      travelNote = `1 time zone difference.`;
    }
    
    return {
      category: 'Travel & Time Zone Situation',
      source: 'Calculated from team locations',
      home: {
        team: home.full_name || home.name,
        time_zone: homeTz,
        status: 'Playing at HOME - no travel'
      },
      away: {
        team: away.full_name || away.name,
        time_zone: awayTz,
        status: `Traveling from ${awayTz} to ${homeTz}`
      },
      time_zone_diff: Math.abs(tzDiff),
      travel_direction: tzDiff > 0 ? 'EASTWARD' : tzDiff < 0 ? 'WESTWARD' : 'SAME ZONE',
      travel_impact: travelImpact,
      travel_note: travelNote,
      INVESTIGATE: tzDiff >= 2 ? `How has the away team performed in games with this time zone difference?` : null,
      note: 'Eastward travel is harder than westward. 2+ time zone jumps are significant.'
    };
  },

  // ===== MINUTES TREND (Top 5 MPG per team from BDL season averages) =====
  MINUTES_TREND: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching MINUTES_TREND for ${away.name} @ ${home.name}`);

    if (bdlSport !== 'basketball_nba') {
      return { category: 'Minutes Trend', note: 'Only available for NBA' };
    }

    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month >= 10 ? year : year - 1;
    }

    try {
      // Fetch active players for both teams, then get season averages with MPG
      const fetchTopMinutesPlayers = async (teamId) => {
        const playersUrl = `https://api.balldontlie.io/v1/players/active?team_ids[]=${teamId}&per_page=15`;
        const playersResp = await fetch(playersUrl, { headers: { Authorization: BDL_API_KEY } });
        const playersJson = await playersResp.json();
        const players = playersJson.data || [];
        if (players.length === 0) return [];

        const topPlayerIds = players.slice(0, 12).map(p => p.id);
        const playerIdParams = topPlayerIds.map(id => `player_ids[]=${id}`).join('&');
        const seasonAvgUrl = `https://api.balldontlie.io/v1/season_averages/general?season=${season}&season_type=regular&type=base&${playerIdParams}`;
        const resp = await fetch(seasonAvgUrl, { headers: { Authorization: BDL_API_KEY } });
        const json = await resp.json();
        const playerStats = json.data || [];

        // Sort by minutes descending, take top 5
        return playerStats
          .filter(ps => ps.stats?.min != null && parseFloat(ps.stats.min) > 0)
          .sort((a, b) => parseFloat(b.stats.min) - parseFloat(a.stats.min))
          .slice(0, 5)
          .map(ps => ({
            name: `${ps.player?.first_name || ''} ${ps.player?.last_name || ''}`.trim(),
            mpg: parseFloat(ps.stats.min).toFixed(1),
            ppg: (ps.stats?.pts || 0).toFixed(1),
            games_played: ps.stats?.games_played || 'N/A'
          }));
      };

      const [homePlayers, awayPlayers] = await Promise.all([
        fetchTopMinutesPlayers(home.id),
        fetchTopMinutesPlayers(away.id)
      ]);

      return {
        category: 'Minutes Distribution (Top 5 by MPG)',
        source: 'Ball Don\'t Lie API (Season Averages)',
        home: {
          team: home.full_name || home.name,
          top_5_by_minutes: homePlayers.length > 0 ? homePlayers : 'Data unavailable'
        },
        away: {
          team: away.full_name || away.name,
          top_5_by_minutes: awayPlayers.length > 0 ? awayPlayers : 'Data unavailable'
        },
        INVESTIGATE: 'How do minutes distributions compare between these teams?',
        note: 'Season MPG for top 5 players per team.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching MINUTES_TREND:`, error.message);
      return {
        category: 'Minutes Trend',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  // ===== BLOWOUT TENDENCY (Margin Patterns) =====
  BLOWOUT_TENDENCY: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching BLOWOUT_TENDENCY for ${away.name} @ ${home.name}`);
    
    try {
      const seasonStart = new Date(season - 1, 9, 1);
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 40
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 40
        })
      ]);
      
      // Calculate blowout and close game patterns
      const calcMarginPatterns = (games, teamId) => {
        const completed = (games || [])
          .filter(g => (g.home_team_score || 0) > 0)
          .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        if (completed.length < 5) return null;
        
        let blowoutWins = 0, blowoutLosses = 0;
        let closeWins = 0, closeLosses = 0;
        let totalMargin = 0;
        const margins = [];
        
        for (const g of completed) {
          const isHome = g.home_team?.id === teamId;
          const teamScore = isHome ? (g.home_team_score ?? g.home_score ?? 0) : (g.visitor_team_score ?? g.away_score ?? 0);
          const oppScore = isHome ? (g.visitor_team_score ?? g.away_score ?? 0) : (g.home_team_score ?? g.home_score ?? 0);
          const margin = teamScore - oppScore;
          const absMargin = Math.abs(margin);

          margins.push(margin);
          totalMargin += margin;

          if (margin > 0) {
            // Win
            if (absMargin >= 15) blowoutWins++;
            else if (absMargin <= 5) closeWins++;
          } else {
            // Loss
            if (absMargin >= 15) blowoutLosses++;
            else if (absMargin <= 5) closeLosses++;
          }
        }
        
        const avgMargin = totalMargin / completed.length;
        const blowoutRate = ((blowoutWins + blowoutLosses) / completed.length * 100).toFixed(0);
        const closeGameRate = ((closeWins + closeLosses) / completed.length * 100).toFixed(0);
        
        return {
          games_analyzed: completed.length,
          avg_margin: `${avgMargin > 0 ? '+' : ''}${avgMargin.toFixed(1)}`,
          blowout_wins: blowoutWins,
          blowout_losses: blowoutLosses,
          blowout_rate: `${blowoutRate}%`,
          close_wins: closeWins,
          close_losses: closeLosses,
          close_game_rate: `${closeGameRate}%`,
          profile: blowoutWins >= 5 ? 'BLOWOUT TEAM' :
                   closeWins + closeLosses >= completed.length * 0.4 ? 'CLOSE GAME TEAM' :
                   'MIXED PROFILE'
        };
      };
      
      const homePatterns = calcMarginPatterns(homeGames, home.id);
      const awayPatterns = calcMarginPatterns(awayGames, away.id);
      
      return {
        category: 'Blowout Tendency & Margin Patterns',
        source: 'Ball Don\'t Lie API (calculated)',
        home: {
          team: home.full_name || home.name,
          ...homePatterns
        },
        away: {
          team: away.full_name || away.name,
          ...awayPatterns
        },
        INVESTIGATE: `What do the margin patterns reveal about each team's profile?`,
        note: 'Blowout: 15+ margin. Close: 5 or less margin.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching BLOWOUT_TENDENCY:`, error.message);
      return {
        category: 'Blowout Tendency',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  // ===== RECENT FORM (ENHANCED) =====
  // Now includes margin analysis, opponent quality, and narrative context
  RECENT_FORM: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching ENHANCED RECENT_FORM for ${awayName} @ ${homeName} (${bdlSport})`);
    
    // NFL uses seasons[] and team_ids[], not date ranges
    const isNFL = bdlSport === 'americanfootball_nfl';
    const isNCAA = bdlSport === 'americanfootball_ncaaf' || bdlSport === 'basketball_ncaab';
    const isNBA = bdlSport === 'basketball_nba';
    const isNHL = bdlSport === 'icehockey_nhl';
    
    let params;
    if (isNFL || isNCAA) {
      // For football, use season filter - get all games this season (need 10+ for L10)
      params = {
        seasons: [season],
        per_page: 25 // Get more games to ensure we have enough for L10
      };
    } else {
      // For other sports (NBA, NHL), use date range - extend to 45 days to capture L10
      const today = new Date();
      const fortyFiveDaysAgo = new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000);
      params = {
        start_date: fortyFiveDaysAgo.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0],
        per_page: 25 // Need more for L10
      };
    }
    
    try {
      // Fetch games AND standings in parallel for opponent quality analysis
      const [homeGames, awayGames, standings] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], ...params }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], ...params }),
        // Fetch standings to assess opponent quality
        (isNFL || isNBA || isNHL) ? ballDontLieService.getStandingsGeneric(bdlSport, { season }) : Promise.resolve([])
      ]);
      
      console.log(`[Stat Router] Got ${homeGames?.length || 0} games for ${homeName}, ${awayGames?.length || 0} for ${awayName}, ${standings?.length || 0} standings`);
      
      // Build standings map for quick opponent lookup
      const standingsMap = new Map();
      if (standings && standings.length > 0) {
        for (const s of standings) {
          const teamId = s.team?.id;
          if (teamId) {
            standingsMap.set(teamId, {
              overall_record: s.overall_record || `${s.wins || 0}-${s.losses || 0}`,
              wins: s.wins || 0,
              losses: s.losses || 0,
              point_differential: s.point_differential || 0
            });
          }
        }
        console.log(`[Stat Router] Built standings map with ${standingsMap.size} teams for opponent quality lookup`);
      }
      
      // Sort by date descending (most recent first)
      const sortByDate = (a, b) => new Date(b.date) - new Date(a.date);
      const sortedHomeGames = (homeGames || []).sort(sortByDate);
      const sortedAwayGames = (awayGames || []).sort(sortByDate);
      
      // Pass standings map for enhanced analysis
      const homeForm = formatRecentGames(sortedHomeGames, homeName, standingsMap);
      const awayForm = formatRecentGames(sortedAwayGames, awayName, standingsMap);
      
      return {
        category: 'Recent Form - L5 + L10 Analysis',

        home: {
          team: home.full_name || home.name,
          ...homeForm
        },
        away: {
          team: away.full_name || away.name,
          ...awayForm
        },
        note: 'If Scout Report grounding has more recent data, prefer that for accuracy.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching recent form:`, error.message);
      return {
        category: 'Recent Form',
        home: { team: home.full_name || home.name, record: 'N/A', note: 'Data unavailable' },
        away: { team: away.full_name || away.name, record: 'N/A', note: 'Data unavailable' },
        WARNING: 'Recent form data unavailable.'
      };
    }
  },

  // ===== QUARTER SCORING TRENDS (NFL) =====
  // Shows Q1, Q2, Q3, Q4 scoring breakdown - fast starters vs closers
  QUARTER_SCORING: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching QUARTER_SCORING for ${awayName} @ ${homeName} (${bdlSport})`);
    
    try {
      // NHL uses periods (P1/P2/P3), not quarters — BDL NHL game data doesn't expose period scores
      if (bdlSport === 'icehockey_nhl') {
        return {
          category: 'Period Scoring Trends',
          data_scope: 'BDL NHL game data does not expose period-by-period scores (P1/P2/P3). Use Gemini Grounding for period scoring trends.',
          home: { team: homeName, note: 'Period scoring data unavailable from BDL' },
          away: { team: awayName, note: 'Period scoring data unavailable from BDL' }
        };
      }

      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 20 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 20 })
      ]);

      // Filter to completed games only - using case-insensitive status check
      const completedHomeGames = (homeGames || []).filter(g => isGameCompleted(g.status));
      const completedAwayGames = (awayGames || []).filter(g => isGameCompleted(g.status));

      const calcQuarterStats = (games, teamId, teamName) => {
        if (!games || games.length === 0) return null;
        
        let q1Scored = 0, q2Scored = 0, q3Scored = 0, q4Scored = 0;
        let q1Allowed = 0, q2Allowed = 0, q3Allowed = 0, q4Allowed = 0;
        let gamesWithQuarters = 0;
        
        for (const game of games) {
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          
          // Get quarter scores based on whether team is home or away
          const teamQ1 = isHome ? game.home_team_q1 : game.visitor_team_q1;
          const teamQ2 = isHome ? game.home_team_q2 : game.visitor_team_q2;
          const teamQ3 = isHome ? game.home_team_q3 : game.visitor_team_q3;
          const teamQ4 = isHome ? game.home_team_q4 : game.visitor_team_q4;
          
          const oppQ1 = isHome ? game.visitor_team_q1 : game.home_team_q1;
          const oppQ2 = isHome ? game.visitor_team_q2 : game.home_team_q2;
          const oppQ3 = isHome ? game.visitor_team_q3 : game.home_team_q3;
          const oppQ4 = isHome ? game.visitor_team_q4 : game.home_team_q4;
          
          // Only count games with quarter data
          if (teamQ1 !== null && teamQ2 !== null && teamQ3 !== null && teamQ4 !== null) {
            q1Scored += teamQ1 || 0;
            q2Scored += teamQ2 || 0;
            q3Scored += teamQ3 || 0;
            q4Scored += teamQ4 || 0;
            q1Allowed += oppQ1 || 0;
            q2Allowed += oppQ2 || 0;
            q3Allowed += oppQ3 || 0;
            q4Allowed += oppQ4 || 0;
            gamesWithQuarters++;
          }
        }
        
        if (gamesWithQuarters === 0) return null;
        
        const avgQ1 = (q1Scored / gamesWithQuarters).toFixed(1);
        const avgQ2 = (q2Scored / gamesWithQuarters).toFixed(1);
        const avgQ3 = (q3Scored / gamesWithQuarters).toFixed(1);
        const avgQ4 = (q4Scored / gamesWithQuarters).toFixed(1);
        const avg1H = ((q1Scored + q2Scored) / gamesWithQuarters).toFixed(1);
        const avg2H = ((q3Scored + q4Scored) / gamesWithQuarters).toFixed(1);
        
        const avgQ1Allowed = (q1Allowed / gamesWithQuarters).toFixed(1);
        const avgQ2Allowed = (q2Allowed / gamesWithQuarters).toFixed(1);
        const avgQ3Allowed = (q3Allowed / gamesWithQuarters).toFixed(1);
        const avgQ4Allowed = (q4Allowed / gamesWithQuarters).toFixed(1);
        
        // Determine team profile
        const q1Diff = parseFloat(avgQ1) - parseFloat(avgQ1Allowed);
        const q4Diff = parseFloat(avgQ4) - parseFloat(avgQ4Allowed);
        const firstHalfDiff = parseFloat(avg1H) - ((parseFloat(avgQ1Allowed) + parseFloat(avgQ2Allowed)));
        const secondHalfDiff = parseFloat(avg2H) - ((parseFloat(avgQ3Allowed) + parseFloat(avgQ4Allowed)));
        
        let profile = [];
        if (q1Diff >= 3) profile.push('FAST STARTER (+' + q1Diff.toFixed(1) + ' Q1)');
        if (q1Diff <= -3) profile.push('SLOW STARTER (' + q1Diff.toFixed(1) + ' Q1)');
        if (q4Diff >= 3) profile.push('STRONG CLOSER (+' + q4Diff.toFixed(1) + ' Q4)');
        if (q4Diff <= -3) profile.push('FADES LATE (' + q4Diff.toFixed(1) + ' Q4)');
        if (secondHalfDiff - firstHalfDiff >= 5) profile.push('SECOND HALF TEAM');
        if (firstHalfDiff - secondHalfDiff >= 5) profile.push('FIRST HALF TEAM');
        
        return {
          team: teamName,
          games_analyzed: gamesWithQuarters,
          scoring: { Q1: avgQ1, Q2: avgQ2, Q3: avgQ3, Q4: avgQ4, '1H': avg1H, '2H': avg2H },
          allowed: { Q1: avgQ1Allowed, Q2: avgQ2Allowed, Q3: avgQ3Allowed, Q4: avgQ4Allowed },
          differential: { Q1: q1Diff.toFixed(1), Q4: q4Diff.toFixed(1), '1H': firstHalfDiff.toFixed(1), '2H': secondHalfDiff.toFixed(1) },
          profile: profile.length > 0 ? profile.join(', ') : 'BALANCED'
        };
      };
      
      return {
        category: 'Quarter-by-Quarter Scoring Trends',
        home: calcQuarterStats(completedHomeGames, home.id, homeName),
        away: calcQuarterStats(completedAwayGames, away.id, awayName),
        insight: 'Use this to identify fast starters vs slow starters, and closers vs faders. Key for 1H/2H betting angles.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching QUARTER_SCORING:`, error.message);
      return { category: 'Quarter Scoring', error: 'Data unavailable' };
    }
  },

  // ===== FIRST HALF TRENDS =====
  // Teams that start hot vs cold - halftime lead %
  FIRST_HALF_TRENDS: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching FIRST_HALF_TRENDS for ${awayName} @ ${homeName} (${bdlSport})`);
    
    try {
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 20 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 20 })
      ]);
      
      const completedHomeGames = (homeGames || []).filter(g => g.status === 'Final' || g.status === 'final');
      const completedAwayGames = (awayGames || []).filter(g => g.status === 'Final' || g.status === 'final');
      
      const calcFirstHalfStats = (games, teamId, teamName) => {
        if (!games || games.length === 0) return null;
        
        let leadingAtHalf = 0, trailingAtHalf = 0, tiedAtHalf = 0;
        let totalFirstHalfScored = 0, totalFirstHalfAllowed = 0;
        let winsWhenLeading = 0, winsWhenTrailing = 0;
        let gamesWithData = 0;
        
        for (const game of games) {
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          
          const teamQ1 = isHome ? game.home_team_q1 : game.visitor_team_q1;
          const teamQ2 = isHome ? game.home_team_q2 : game.visitor_team_q2;
          const oppQ1 = isHome ? game.visitor_team_q1 : game.home_team_q1;
          const oppQ2 = isHome ? game.visitor_team_q2 : game.home_team_q2;
          
          const teamFinal = isHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_score ?? 0);
          const oppFinal = isHome ? (game.visitor_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
          
          if (teamQ1 !== null && teamQ2 !== null && oppQ1 !== null && oppQ2 !== null) {
            const team1H = (teamQ1 || 0) + (teamQ2 || 0);
            const opp1H = (oppQ1 || 0) + (oppQ2 || 0);
            
            totalFirstHalfScored += team1H;
            totalFirstHalfAllowed += opp1H;
            gamesWithData++;
            
            const won = teamFinal > oppFinal;
            
            if (team1H > opp1H) {
              leadingAtHalf++;
              if (won) winsWhenLeading++;
            } else if (team1H < opp1H) {
              trailingAtHalf++;
              if (won) winsWhenTrailing++;
            } else {
              tiedAtHalf++;
            }
          }
        }
        
        if (gamesWithData === 0) return null;
        
        const avg1HScored = (totalFirstHalfScored / gamesWithData).toFixed(1);
        const avg1HAllowed = (totalFirstHalfAllowed / gamesWithData).toFixed(1);
        const leadPct = ((leadingAtHalf / gamesWithData) * 100).toFixed(0);
        const closeRate = leadingAtHalf > 0 ? ((winsWhenLeading / leadingAtHalf) * 100).toFixed(0) : 'N/A';
        const comebackRate = trailingAtHalf > 0 ? ((winsWhenTrailing / trailingAtHalf) * 100).toFixed(0) : 'N/A';
        
        return {
          team: teamName,
          games_analyzed: gamesWithData,
          avg_1H_scored: avg1HScored,
          avg_1H_allowed: avg1HAllowed,
          leading_at_half: `${leadingAtHalf}/${gamesWithData} (${leadPct}%)`,
          trailing_at_half: `${trailingAtHalf}/${gamesWithData}`,
          close_out_rate: closeRate !== 'N/A' ? `${closeRate}% when leading at half` : 'N/A',
          comeback_rate: comebackRate !== 'N/A' ? `${comebackRate}% when trailing at half` : 'N/A'
        };
      };
      
      return {
        category: 'First Half Scoring Trends',
        home: calcFirstHalfStats(completedHomeGames, home.id, homeName),
        away: calcFirstHalfStats(completedAwayGames, away.id, awayName),
        insight: 'Shows which team starts faster and their close-out rate when leading at halftime.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching FIRST_HALF_TRENDS:`, error.message);
      return { category: 'First Half Trends', error: 'Data unavailable' };
    }
  },

  // ===== SECOND HALF TRENDS =====
  // Closers vs faders - 4th quarter dominance
  SECOND_HALF_TRENDS: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching SECOND_HALF_TRENDS for ${awayName} @ ${homeName} (${bdlSport})`);
    
    try {
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 20 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 20 })
      ]);
      
      const completedHomeGames = (homeGames || []).filter(g => g.status === 'Final' || g.status === 'final');
      const completedAwayGames = (awayGames || []).filter(g => g.status === 'Final' || g.status === 'final');
      
      const calcSecondHalfStats = (games, teamId, teamName) => {
        if (!games || games.length === 0) return null;
        
        let total2HScored = 0, total2HAllowed = 0;
        let totalQ4Scored = 0, totalQ4Allowed = 0;
        let won2ndHalf = 0, lost2ndHalf = 0;
        let wonQ4 = 0, lostQ4 = 0;
        let gamesWithData = 0;
        
        for (const game of games) {
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          
          const teamQ3 = isHome ? game.home_team_q3 : game.visitor_team_q3;
          const teamQ4 = isHome ? game.home_team_q4 : game.visitor_team_q4;
          const oppQ3 = isHome ? game.visitor_team_q3 : game.home_team_q3;
          const oppQ4 = isHome ? game.visitor_team_q4 : game.home_team_q4;
          
          if (teamQ3 !== null && teamQ4 !== null && oppQ3 !== null && oppQ4 !== null) {
            const team2H = (teamQ3 || 0) + (teamQ4 || 0);
            const opp2H = (oppQ3 || 0) + (oppQ4 || 0);
            const teamQ4Score = teamQ4 || 0;
            const oppQ4Score = oppQ4 || 0;
            
            total2HScored += team2H;
            total2HAllowed += opp2H;
            totalQ4Scored += teamQ4Score;
            totalQ4Allowed += oppQ4Score;
            gamesWithData++;
            
            if (team2H > opp2H) won2ndHalf++;
            else if (team2H < opp2H) lost2ndHalf++;
            
            if (teamQ4Score > oppQ4Score) wonQ4++;
            else if (teamQ4Score < oppQ4Score) lostQ4++;
          }
        }
        
        if (gamesWithData === 0) return null;
        
        const avg2HScored = (total2HScored / gamesWithData).toFixed(1);
        const avg2HAllowed = (total2HAllowed / gamesWithData).toFixed(1);
        const avgQ4Scored = (totalQ4Scored / gamesWithData).toFixed(1);
        const avgQ4Allowed = (totalQ4Allowed / gamesWithData).toFixed(1);
        const q4Diff = (totalQ4Scored - totalQ4Allowed) / gamesWithData;
        
        let closerProfile = 'NEUTRAL';
        if (q4Diff >= 3) closerProfile = 'STRONG CLOSER';
        else if (q4Diff >= 1.5) closerProfile = 'SOLID CLOSER';
        else if (q4Diff <= -3) closerProfile = 'FADES LATE';
        else if (q4Diff <= -1.5) closerProfile = 'STRUGGLES TO CLOSE';
        
        return {
          team: teamName,
          games_analyzed: gamesWithData,
          avg_2H_scored: avg2HScored,
          avg_2H_allowed: avg2HAllowed,
          avg_Q4_scored: avgQ4Scored,
          avg_Q4_allowed: avgQ4Allowed,
          Q4_differential: q4Diff >= 0 ? `+${q4Diff.toFixed(1)}` : q4Diff.toFixed(1),
          won_2nd_half: `${won2ndHalf}/${gamesWithData}`,
          won_Q4: `${wonQ4}/${gamesWithData}`,
          closer_profile: closerProfile
        };
      };
      
      return {
        category: 'Second Half & 4th Quarter Trends',
        home: calcSecondHalfStats(completedHomeGames, home.id, homeName),
        away: calcSecondHalfStats(completedAwayGames, away.id, awayName),
        insight: 'Shows which team closes games better. Critical for live betting and late-game situations.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching SECOND_HALF_TRENDS:`, error.message);
      return { category: 'Second Half Trends', error: 'Data unavailable' };
    }
  },

  // ===== VARIANCE & CONSISTENCY ANALYSIS (NEW) =====
  // Key for underdog betting: High variance = more upset potential
  VARIANCE_CONSISTENCY: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching VARIANCE_CONSISTENCY for ${awayName} @ ${homeName} (${bdlSport})`);
    
    // Only supported for NFL currently (expandable to other sports)
    if (bdlSport !== 'americanfootball_nfl') {
      return {
        category: 'Variance & Consistency',
        note: 'Currently only available for NFL. Coming soon for other sports.',
        home: { team: homeName },
        away: { team: awayName }
      };
    }
    
    try {
      // Get recent games for both teams
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 17 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 17 })
      ]);
      
      const completedHomeGames = (homeGames || []).filter(g => g.status === 'Final' || g.status === 'final').slice(0, 10);
      const completedAwayGames = (awayGames || []).filter(g => g.status === 'Final' || g.status === 'final').slice(0, 10);
      
      // Calculate variance stats for a team
      const calcVarianceStats = (games, teamId, teamName) => {
        if (!games || games.length < 3) {
          return { team: teamName, error: 'Insufficient data' };
        }
        
        const margins = [];
        const pointsScored = [];
        let closeGames = 0; // Within 7 points
        let blowouts = 0;   // Won/lost by 14+
        let beatsGoodTeams = 0;
        let losesToBadTeams = 0;
        
        for (const game of games) {
          const isHome = game.home_team?.id === teamId;
          const teamScore = isHome ? game.home_team_score : game.away_team_score;
          const oppScore = isHome ? game.away_team_score : game.home_team_score;
          
          if (teamScore == null || oppScore == null) continue;
          
          const margin = teamScore - oppScore;
          margins.push(margin);
          pointsScored.push(teamScore);
          
          // Close game analysis
          if (Math.abs(margin) <= 7) closeGames++;
          if (Math.abs(margin) >= 14) blowouts++;
        }
        
        if (margins.length < 3) {
          return { team: teamName, error: 'Insufficient games with scores' };
        }
        
        // Calculate standard deviation of margins (VARIANCE indicator)
        const avgMargin = margins.reduce((a, b) => a + b, 0) / margins.length;
        const variance = margins.reduce((acc, m) => acc + Math.pow(m - avgMargin, 2), 0) / margins.length;
        const stdDev = Math.sqrt(variance);
        
        // Calculate scoring consistency
        const avgPoints = pointsScored.reduce((a, b) => a + b, 0) / pointsScored.length;
        const scoringVariance = pointsScored.reduce((acc, p) => acc + Math.pow(p - avgPoints, 2), 0) / pointsScored.length;
        const scoringStdDev = Math.sqrt(scoringVariance);
        
        // Determine consistency profile
        let marginProfile = 'CONSISTENT';
        if (stdDev > 14) marginProfile = 'HIGH VARIANCE (Boom/Bust)';
        else if (stdDev > 10) marginProfile = 'MODERATE VARIANCE';
        else if (stdDev < 7) marginProfile = 'VERY CONSISTENT';
        
        let scoringProfile = 'CONSISTENT SCORING';
        if (scoringStdDev > 8) scoringProfile = 'INCONSISTENT SCORING';
        
        // Calculate upset potential indicators
        const closeGamePct = ((closeGames / margins.length) * 100).toFixed(0);
        const blowoutPct = ((blowouts / margins.length) * 100).toFixed(0);
        
        // Key insight for betting
        // Just report the variance numbers, no interpretive labels
        
        return {
          team: teamName,
          games_analyzed: margins.length,
          margin_analysis: {
            avg_margin: avgMargin.toFixed(1),
            std_dev: stdDev.toFixed(1),
            profile: marginProfile
          },
          scoring_analysis: {
            avg_points: avgPoints.toFixed(1),
            std_dev: scoringStdDev.toFixed(1),
            profile: scoringProfile
          },
          game_types: {
            close_games: `${closeGames}/${margins.length} (${closeGamePct}%)`,
            blowouts: `${blowouts}/${margins.length} (${blowoutPct}%)`
          }
        };
      };
      
      const homeVariance = calcVarianceStats(completedHomeGames, home.id, homeName);
      const awayVariance = calcVarianceStats(completedAwayGames, away.id, awayName);
      
      // Generate comparative insight
      let compareInsight = '';
      if (homeVariance.margin_analysis && awayVariance.margin_analysis) {
        const homeStdDev = parseFloat(homeVariance.margin_analysis.std_dev);
        const awayStdDev = parseFloat(awayVariance.margin_analysis.std_dev);
        
        if (homeStdDev > awayStdDev + 3) {
          compareInsight = `${homeName} is more volatile (stdDev ${homeStdDev.toFixed(1)}) than ${awayName} (stdDev ${awayStdDev.toFixed(1)})`;
        } else if (awayStdDev > homeStdDev + 3) {
          compareInsight = `${awayName} is more volatile (stdDev ${awayStdDev.toFixed(1)}) than ${homeName} (stdDev ${homeStdDev.toFixed(1)})`;
        } else {
          compareInsight = 'Both teams have similar consistency profiles';
        }
      }
      
      return {
        category: 'Variance & Consistency Analysis',
        note: 'Std dev measures scoring margin consistency.',
        home: homeVariance,
        away: awayVariance,
        comparative_insight: compareInsight
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching VARIANCE_CONSISTENCY:`, error.message);
      return { category: 'Variance & Consistency', error: 'Data unavailable' };
    }
  },

  // ===== HEAD-TO-HEAD HISTORY =====
  H2H_HISTORY: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching H2H_HISTORY for ${awayName} @ ${homeName} (${bdlSport})`);
    
    // Helper: Extract personnel notes from box score data
    const extractPersonnelNote = (boxScore, homeTeamId, awayTeamId) => {
      try {
        if (!boxScore || !boxScore.home_team_stats || !boxScore.away_team_stats) {
          return null;
        }
        
        // Get top scorer from each team
        const homeStats = boxScore.home_team_stats || [];
        const awayStats = boxScore.away_team_stats || [];
        
        // Sort by points to find top performers
        const homeTop = [...homeStats].sort((a, b) => (b.pts || 0) - (a.pts || 0))[0];
        const awayTop = [...awayStats].sort((a, b) => (b.pts || 0) - (a.pts || 0))[0];
        
        // Find any key players who DNP (0 minutes or not in stats)
        const homeDnp = homeStats.filter(p => (p.min === '0:00' || p.min === 0 || p.min === '00:00') && p.player?.first_name);
        const awayDnp = awayStats.filter(p => (p.min === '0:00' || p.min === 0 || p.min === '00:00') && p.player?.first_name);
        
        let note = 'Key: ';
        if (homeTop?.player) {
          const name = `${homeTop.player.first_name?.[0] || ''}. ${homeTop.player.last_name || 'Unknown'}`;
          note += `${name} ${homeTop.pts || 0}pts/${homeTop.min || '?'}min`;
        }
        if (awayTop?.player) {
          const name = `${awayTop.player.first_name?.[0] || ''}. ${awayTop.player.last_name || 'Unknown'}`;
          note += `; ${name} ${awayTop.pts || 0}pts/${awayTop.min || '?'}min`;
        }
        
        // Add DNP notes for key players (if any)
        const dnpNotes = [];
        if (homeDnp.length > 0) {
          const dnpNames = homeDnp.slice(0, 2).map(p => `${p.player?.last_name || 'Unknown'}`).join(', ');
          dnpNotes.push(`${dnpNames} DNP`);
        }
        if (awayDnp.length > 0) {
          const dnpNames = awayDnp.slice(0, 2).map(p => `${p.player?.last_name || 'Unknown'}`).join(', ');
          dnpNotes.push(`${dnpNames} DNP`);
        }
        
        if (dnpNotes.length > 0) {
          note += ` | ${dnpNotes.join('; ')}`;
        }
        
        return note;
      } catch (e) {
        console.log(`[Stat Router] Error extracting personnel note: ${e.message}`);
        return null;
      }
    };
    
    try {
      // Calculate dynamic season - NFL/NCAAF: Aug-Feb spans years
      // If season not provided, calculate based on current date
      let currentSeason = season;
      if (!currentSeason) {
        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();
        // NFL/NCAAF: Aug-Feb, so Jan-Jul = previous year's season
        currentSeason = month <= 7 ? year - 1 : year;
      }
      
      const homeGames = await ballDontLieService.getGames(bdlSport, {
        team_ids: [home.id],
        seasons: [currentSeason],
        per_page: 50
      });

      // Filter to only COMPLETED games against the away team
      const h2hGames = (homeGames || []).filter(game => {
        const gameHomeId = game.home_team?.id || game.home_team_id;
        const gameAwayId = game.visitor_team?.id || game.visitor_team_id;
        const isH2H = (gameHomeId === away.id || gameAwayId === away.id);
        // BDL status values vary by sport:
        // NBA: has home_team_score > 0 means completed
        // NFL: status='Final'
        // NCAAB: status='Final' or 'post'
        // NHL: status='Final' or game_state='OFF'
        const hasScores = ((game.home_team_score ?? game.home_score ?? 0) > 0) || ((game.visitor_team_score ?? game.away_score ?? 0) > 0);
        const statusFinal = game.status === 'Final' || game.status === 'post' || game.status === 'final';
        const isCompleted = hasScores || statusFinal;
        // Also ensure game date is in the past
        const gameDate = new Date(game.date);
        const isPast = gameDate < new Date();
        return isH2H && isCompleted && isPast;
      }).sort((a, b) => new Date(b.date) - new Date(a.date)); // Most recent first
      
      if (h2hGames.length === 0) {
        return {
          category: `Head-to-Head History (${currentSeason} Season)`,
          games_found: 0,
          h2h_available: false,
          note: `NO H2H DATA: ${homeName} and ${awayName} have not played each other in the ${currentSeason} season.`,
          revenge_game: false,
          ANTI_HALLUCINATION: `CRITICAL: You have ZERO H2H data for this matchup. DO NOT claim any historical records, winning streaks, or "Team A owns Team B" narratives. If you don't have H2H data, simply don't mention H2H in your analysis.`
        };
      }
      
      // For NBA, try to fetch box scores to get personnel context
      const isNba = bdlSport === 'basketball_nba';
      let boxScoresByDate = {};
      
      if (isNba && h2hGames.length <= 3) {
        // Only fetch box scores for recent H2H games (limit to avoid slowdown)
        console.log(`[Stat Router] Fetching box scores for ${h2hGames.length} H2H game(s) to get personnel notes...`);
        
        for (const game of h2hGames.slice(0, 3)) {
          try {
            const gameDate = game.date?.split('T')[0]; // YYYY-MM-DD
            if (gameDate && !boxScoresByDate[gameDate]) {
              const boxScores = await ballDontLieService.getNbaBoxScores(gameDate, 30); // Cache 30 min
              if (boxScores && boxScores.length > 0) {
                // Find the box score that matches this game (by team IDs)
                const matchingBox = boxScores.find(bs => {
                  const bsHomeId = bs.game?.home_team?.id || bs.home_team?.id;
                  const bsAwayId = bs.game?.visitor_team?.id || bs.visitor_team?.id;
                  return (bsHomeId === home.id || bsHomeId === away.id) && 
                         (bsAwayId === home.id || bsAwayId === away.id);
                });
                if (matchingBox) {
                  boxScoresByDate[gameDate] = matchingBox;
                }
              }
            }
          } catch (e) {
            console.log(`[Stat Router] Box score fetch failed for ${game.date}: ${e.message}`);
          }
        }
      }
      
      // Format H2H results with full date including year AND personnel notes
      const h2hResults = h2hGames.slice(0, 5).map(game => {
        const isHomeTeamHome = (game.home_team?.id || game.home_team_id) === home.id;
        const homeScore = isHomeTeamHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_score ?? 0);
        const awayScore = isHomeTeamHome ? (game.visitor_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
        const winner = homeScore > awayScore ? homeName : awayName;
        const margin = Math.abs(homeScore - awayScore);
        const gameDate = new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const gameDateKey = game.date?.split('T')[0];
        const week = game.week ? `Week ${game.week}` : '';
        
        // Get personnel note from box score if available
        const boxScore = boxScoresByDate[gameDateKey];
        const personnelNote = boxScore ? extractPersonnelNote(boxScore, home.id, away.id) : null;
        
        return {
          date: gameDate,
          week: week,
          result: `${winner} won by ${margin}`,
          score: `${homeName} ${homeScore} - ${awayScore} ${awayName}`,
          margin: margin, // Store margin for sweep context analysis
          home_won: homeScore > awayScore,
          personnel_note: personnelNote || (isNba ? '(Box score unavailable)' : null)
        };
      });
      
      // Calculate series record for THIS SEASON
      const homeWins = h2hResults.filter(r => r.home_won).length;
      const awayWins = h2hResults.length - homeWins;
      
      // Check for revenge game (did away team lose last meeting?)
      const lastMeeting = h2hResults[0];
      const revengeGame = lastMeeting && !lastMeeting.home_won;
      
      // ===== NBA SWEEP CONTEXT DETECTION (NBA-SPECIFIC) =====
      // Detects when one team is about to sweep an elite opponent 4-0
      // This is historically very rare and should prompt investigation
      let sweepContext = null;
      
      if (isNba && h2hGames.length >= 3) {
        const gamesPlayed = h2hGames.length;
        const isCompleteSweep = (homeWins === gamesPlayed) || (awayWins === gamesPlayed);
        
        if (isCompleteSweep) {
          try {
            // Determine dominant and swept teams
            const dominantTeam = homeWins === gamesPlayed ? home : away;
            const dominantTeamName = homeWins === gamesPlayed ? homeName : awayName;
            const sweptTeam = homeWins === gamesPlayed ? away : home;
            const sweptTeamName = homeWins === gamesPlayed ? awayName : homeName;
            
            // Fetch standings to get win percentages and division info
            const standings = await ballDontLieService.getNbaStandings(currentSeason);
            
            // Get swept team's standing (with null checks)
            const sweptTeamStanding = standings?.find(s => s.team?.id === sweptTeam.id);
            const dominantTeamStanding = standings?.find(s => s.team?.id === dominantTeam.id);
            
            if (sweptTeamStanding?.wins !== undefined && sweptTeamStanding?.losses !== undefined) {
              const sweptWins = sweptTeamStanding.wins;
              const sweptLosses = sweptTeamStanding.losses;
              const sweptTotal = sweptWins + sweptLosses;
              
              if (sweptTotal > 0) {
                const sweptWinPct = (sweptWins / sweptTotal) * 100;
                
                // Check if division rivals (same division = more film study and adjustment opportunities)
                const sweptDivision = sweptTeamStanding?.team?.division;
                const dominantDivision = dominantTeamStanding?.team?.division;
                const isDivisionRival = sweptDivision && dominantDivision && sweptDivision === dominantDivision;
                
                // Calculate average margin of H2H wins
                const margins = h2hResults.map(r => r.margin || 0);
                const avgMargin = margins.reduce((sum, m) => sum + m, 0) / margins.length;
                
                // Determine margin context
                let marginNote = '';
                if (avgMargin >= 15) {
                  marginNote = `Blowout dominance (avg +${avgMargin.toFixed(0)}) — but elite teams adjust schemes after exposure.`;
                } else if (avgMargin >= 8) {
                  marginNote = `Solid margins (avg +${avgMargin.toFixed(0)}) — real edge, but not overwhelming.`;
                } else {
                  marginNote = `Close wins (avg +${avgMargin.toFixed(0)}) — barely dominance, regression more likely.`;
                }
                
                // Sliding scale alert levels:
                // - 70%+ win rate: STRONG trap alert
                // - 60-70% (or 60%+ for division rivals): CAUTION flag
                // - Below 60%: Proceed (H2H trend likely real)
                let alertLevel = null;
                let sweepNote = null;
                
                // Division rivals trigger caution at lower threshold (60% vs 70%)
                const strongThreshold = 70;
                const cautionThreshold = isDivisionRival ? 60 : 70;
                
                if (sweptWinPct >= strongThreshold) {
                  alertLevel = 'STRONG';
                  sweepNote = `SWEEP CONTEXT: ${sweptTeamName} is ${sweptWins}-${sweptLosses} (${sweptWinPct.toFixed(1)}%)${isDivisionRival ? ' and a division rival' : ''}. Sweeping an elite team 4-0 is historically very rare. The combination of roster quality, coaching adjustments, and statistical variance makes clean sweeps against top-tier opponents a statistical anomaly. Ask yourself: "Am I betting that an elite team will get swept 4-0?" Investigate whether non-H2H factors (injuries, rest, scheme advantages) justify betting the sweep.`;
                } else if (sweptWinPct >= cautionThreshold) {
                  alertLevel = 'CAUTION';
                  sweepNote = `SWEEP CONTEXT: ${sweptTeamName} is ${sweptWins}-${sweptLosses} (${sweptWinPct.toFixed(1)}%)${isDivisionRival ? ' — a division rival with more film study opportunities' : ''}. 4-0 sweeps against playoff-caliber teams are uncommon due to coaching adjustments and statistical variance.`;
                }
                
                if (alertLevel) {
                  sweepContext = {
                    triggered: true,
                    alert_level: alertLevel,
                    games_in_sweep: gamesPlayed,
                    dominant_team: dominantTeamName,
                    swept_team: sweptTeamName,
                    swept_team_record: `${sweptWins}-${sweptLosses}`,
                    swept_team_win_pct: `${sweptWinPct.toFixed(1)}%`,
                    is_division_rival: isDivisionRival,
                    division: isDivisionRival ? sweptDivision : null,
                    avg_margin: avgMargin.toFixed(1),
                    margin_context: marginNote,
                    sweep_note: sweepNote
                  };
                  console.log(`[Stat Router] SWEEP CONTEXT ALERT (${alertLevel}): ${dominantTeamName} is ${gamesPlayed}-0 vs ${sweptTeamName} (${sweptWinPct.toFixed(1)}% win rate${isDivisionRival ? ', division rival' : ''})`);
                }
              }
            }
          } catch (sweepErr) {
            console.log(`[Stat Router] Sweep context check failed (non-fatal): ${sweepErr.message}`);
            // Non-fatal - just skip sweep context if standings unavailable
          }
        }
      }
      
      // ===== NFL REVENGE CONTEXT DETECTION (NFL-SPECIFIC) =====
      // In NFL, elite teams don't lose twice to the same opponent, especially after a blowout
      const isNfl = bdlSport === 'americanfootball_nfl';
      
      if (isNfl && h2hGames.length >= 1 && !sweepContext) {
        try {
          // Get the previous meeting details
          const lastGame = h2hResults[0];
          const lastMargin = lastGame?.margin || 0;
          
          // Determine winner and loser of last meeting
          const lastWinnerIsHome = lastGame?.home_won;
          const losingTeam = lastWinnerIsHome ? away : home;
          const losingTeamName = lastWinnerIsHome ? awayName : homeName;
          const winningTeam = lastWinnerIsHome ? home : away;
          const winningTeamName = lastWinnerIsHome ? homeName : awayName;
          
          // Fetch standings to get win percentages and division info
          const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason });
          
          const losingTeamStanding = standings?.find(s => s.team?.id === losingTeam.id);
          const winningTeamStanding = standings?.find(s => s.team?.id === winningTeam.id);
          
          if (losingTeamStanding?.wins !== undefined && losingTeamStanding?.losses !== undefined) {
            const losingWins = losingTeamStanding.wins;
            const losingLosses = losingTeamStanding.losses;
            const losingTotal = losingWins + losingLosses;
            
            if (losingTotal > 0) {
              const losingWinPct = (losingWins / losingTotal) * 100;
              
              // Check if division rivals
              const losingDivision = losingTeamStanding?.team?.division;
              const winningDivision = winningTeamStanding?.team?.division;
              const isDivisionRival = losingDivision && winningDivision && losingDivision === winningDivision;
              
              // NFL Revenge Context: Division rival lost by 14+ points AND is 70%+ win rate
              // In NFL, 14+ points is a convincing win (2+ TDs)
              if (isDivisionRival && losingWinPct >= 70 && lastMargin >= 14) {
                sweepContext = {
                  triggered: true,
                  alert_level: 'REVENGE',
                  sport: 'NFL',
                  games_played: h2hGames.length,
                  losing_team: losingTeamName,
                  winning_team: winningTeamName,
                  losing_team_record: `${losingWins}-${losingLosses}`,
                  losing_team_win_pct: `${losingWinPct.toFixed(1)}%`,
                  is_division_rival: true,
                  division: losingDivision,
                  last_margin: lastMargin,
                  sweep_note: `NFL DIVISION REMATCH: ${losingTeamName} is ${losingWins}-${losingLosses} (${losingWinPct.toFixed(1)}%) and lost by ${lastMargin} points to division rival ${winningTeamName} earlier this season. Investigate: What do the stats show about how ${losingTeamName} has performed since that loss? Has anything changed schematically? Does the spread already reflect the division familiarity factor?`
                };
                console.log(`[Stat Router] NFL REVENGE CONTEXT: ${losingTeamName} (${losingWinPct.toFixed(1)}%) lost by ${lastMargin} to division rival ${winningTeamName}`);
              }
            }
          }
        } catch (nflErr) {
          console.log(`[Stat Router] NFL revenge context check failed (non-fatal): ${nflErr.message}`);
        }
      }
      
      // ===== NCAAB SWEEP CONTEXT DETECTION (NCAAB-SPECIFIC) =====
      // In NCAAB, conference rivals play 2x per year; 2-0 sweeps trigger caution for elite/ranked teams
      const isNcaab = bdlSport === 'basketball_ncaab';
      
      if (isNcaab && h2hGames.length >= 2 && !sweepContext) {
        const gamesPlayed = h2hGames.length;
        const isCompleteSweep = (homeWins === gamesPlayed) || (awayWins === gamesPlayed);
        
        if (isCompleteSweep) {
          try {
            // Determine dominant and swept teams
            const dominantTeam = homeWins === gamesPlayed ? home : away;
            const dominantTeamName = homeWins === gamesPlayed ? homeName : awayName;
            const sweptTeam = homeWins === gamesPlayed ? away : home;
            const sweptTeamName = homeWins === gamesPlayed ? awayName : homeName;
            
            // Fetch standings to get win percentages and conference info
            const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason });
            
            const sweptTeamStanding = standings?.find(s => s.team?.id === sweptTeam.id);
            const dominantTeamStanding = standings?.find(s => s.team?.id === dominantTeam.id);
            
            if (sweptTeamStanding?.wins !== undefined && sweptTeamStanding?.losses !== undefined) {
              const sweptWins = sweptTeamStanding.wins;
              const sweptLosses = sweptTeamStanding.losses;
              const sweptTotal = sweptWins + sweptLosses;
              
              if (sweptTotal > 0) {
                const sweptWinPct = (sweptWins / sweptTotal) * 100;
                
                // Check if conference rivals
                const sweptConference = sweptTeamStanding?.team?.conference;
                const dominantConference = dominantTeamStanding?.team?.conference;
                const isConferenceRival = sweptConference && dominantConference && sweptConference === dominantConference;
                
                // Check if swept team is ranked (Top 25 indicator)
                const sweptRanking = sweptTeamStanding?.ranking || sweptTeamStanding?.ap_rank || null;
                const isRanked = sweptRanking && sweptRanking <= 25;
                
                // Calculate average margin
                const margins = h2hResults.map(r => r.margin || 0);
                const avgMargin = margins.reduce((sum, m) => sum + m, 0) / margins.length;
                
                // NCAAB Sweep Context: Conference rival is 0-2 AND is 70%+ OR ranked
                if (isConferenceRival && (sweptWinPct >= 70 || isRanked)) {
                  const rankNote = isRanked ? ` (Ranked #${sweptRanking})` : '';
                  const marginNote = avgMargin >= 10 
                    ? `Dominant margins (avg +${avgMargin.toFixed(0)}) — but elite programs adjust for conference rivals.`
                    : `Close games (avg +${avgMargin.toFixed(0)}) — series has been competitive despite the sweep.`;
                  
                  sweepContext = {
                    triggered: true,
                    alert_level: sweptWinPct >= 70 ? 'STRONG' : 'CAUTION',
                    sport: 'NCAAB',
                    games_in_sweep: gamesPlayed,
                    dominant_team: dominantTeamName,
                    swept_team: sweptTeamName,
                    swept_team_record: `${sweptWins}-${sweptLosses}`,
                    swept_team_win_pct: `${sweptWinPct.toFixed(1)}%`,
                    swept_team_ranking: sweptRanking,
                    is_conference_rival: true,
                    conference: sweptConference,
                    avg_margin: avgMargin.toFixed(1),
                    margin_context: marginNote,
                    sweep_note: `NCAAB SWEEP CONTEXT: ${sweptTeamName}${rankNote} is ${sweptWins}-${sweptLosses} (${sweptWinPct.toFixed(1)}%) and 0-${gamesPlayed} vs conference rival ${dominantTeamName}. Elite/ranked conference teams rarely get swept 3-0 — coaching staffs adjust for familiar opponents through repeated film study. ${marginNote} Ask yourself: "Am I betting that ${isRanked ? 'a ranked team' : 'a 70%+ team'} will go 0-${gamesPlayed + 1} against the same conference opponent?"`
                  };
                  console.log(`[Stat Router] NCAAB SWEEP CONTEXT: ${sweptTeamName} (${sweptWinPct.toFixed(1)}%${isRanked ? ', #' + sweptRanking : ''}) is 0-${gamesPlayed} vs conference rival ${dominantTeamName}`);
                }
              }
            }
          } catch (ncaabErr) {
            console.log(`[Stat Router] NCAAB sweep context check failed (non-fatal): ${ncaabErr.message}`);
          }
        }
      }
      
      // ===== CONDITIONS CHANGED CONTEXT (1-2 GAME H2H) =====
      // For small sample H2H (1-2 games), check if conditions have significantly changed
      // This helps Gary understand that a single game result may not be representative
      let conditionsChangedContext = null;
      
      if (isNba && h2hGames.length <= 2 && h2hResults.length > 0) {
        try {
          // Check for DNPs in previous H2H games (from personnel notes)
          const dnpMatches = [];
          for (const result of h2hResults) {
            if (result.personnel_note) {
              // Look for DNP patterns like "DNP: Embiid" or "Embiid (0 min)"
              const dnpPattern = /DNP:\s*([^|,]+)|(\w+)\s*\(0\s*min\)/gi;
              let match;
              while ((match = dnpPattern.exec(result.personnel_note)) !== null) {
                const playerName = (match[1] || match[2] || '').trim();
                if (playerName && playerName.length > 2) {
                  dnpMatches.push({
                    player: playerName,
                    date: result.date,
                    result: result.result
                  });
                }
              }
            }
          }
          
          // If we found DNPs, flag that conditions may have changed
          if (dnpMatches.length > 0) {
            const dnpList = dnpMatches.map(d => `${d.player} (out ${d.date})`).join(', ');
            const gamesText = h2hGames.length === 1 ? 'the only H2H game' : `${h2hGames.length} H2H games`;
            
            conditionsChangedContext = {
              triggered: true,
              dnp_players: dnpMatches,
              sample_size: h2hGames.length,
              note: `CONDITIONS CHANGED: In ${gamesText} this season, key player(s) were OUT: ${dnpList}. This result happened under DIFFERENT circumstances. Ask yourself: "What's different tonight?" Check current injury report — if these players are now available, the previous result may not be representative. 1-game H2H is CONTEXT (for narrative), not EVIDENCE (for conviction).`
            };
            console.log(`[Stat Router] CONDITIONS CHANGED: Found DNP(s) in H2H: ${dnpList}`);
          } else if (h2hGames.length === 1) {
            // Even without detected DNPs, flag that 1-game H2H is anecdotal
            conditionsChangedContext = {
              triggered: true,
              dnp_players: [],
              sample_size: 1,
              note: `SAMPLE SIZE WARNING: Only 1 H2H game this season. One game is ANECDOTAL, not predictive. Use for narrative ("revenge spot", "what's different tonight") but don't lean on it for conviction. Ask: "What's DIFFERENT tonight?" (health, venue, rest, roster changes)`
            };
          }
        } catch (condErr) {
          console.log(`[Stat Router] Conditions changed check failed (non-fatal): ${condErr.message}`);
        }
      }
      
      return {
        category: `Head-to-Head History (${currentSeason} Season ONLY)`,
        games_found: h2hGames.length,
        h2h_available: true,
        this_season_record: `${homeName} ${homeWins}-${awayWins} ${awayName}`,
        meetings_this_season: h2hResults,
        revenge_game: revengeGame,
        revenge_note: revengeGame ? `${awayName} lost the last meeting - potential revenge spot` : null,
        sweep_context: sweepContext,
        conditions_changed_context: conditionsChangedContext,
        ANTI_HALLUCINATION: `DATA BOUNDARY: You have ONLY ${h2hGames.length} verified H2H game(s) from the ${currentSeason} season. You may cite these specific games. DO NOT claim historical streaks, prior season records, or "all-time" H2H records that are not shown here.`
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching H2H history:`, error.message);
      return {
        category: 'Head-to-Head History',
        h2h_available: false,
        error: 'Data unavailable',
        ANTI_HALLUCINATION: 'CRITICAL: H2H data fetch FAILED. You have ZERO verified H2H data. DO NOT mention H2H history at all - focus on other factors instead.'
      };
    }
  },

  // ===== CLUTCH STATS (Close Game Record) =====
  CLUTCH_STATS: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching CLUTCH_STATS for ${away.name} @ ${home.name}`);

    try {
      // NBA: Use real BDL team_season_averages/clutch endpoint (Tier 1 predictive data)
      if (bdlSport === 'basketball_nba') {
        const API_KEY = process.env.BALLDONTLIE_API_KEY;
        const baseUrl = 'https://api.balldontlie.io/nba/v1/team_season_averages/clutch';

        const fetchClutch = async (url) => {
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          return resp.json();
        };

        const [homeAdvJson, awayAdvJson, homeBaseJson, awayBaseJson] = await Promise.all([
          fetchClutch(`${baseUrl}?season=${season}&season_type=regular&type=advanced&team_ids[]=${home.id}`),
          fetchClutch(`${baseUrl}?season=${season}&season_type=regular&type=advanced&team_ids[]=${away.id}`),
          fetchClutch(`${baseUrl}?season=${season}&season_type=regular&type=base&team_ids[]=${home.id}`),
          fetchClutch(`${baseUrl}?season=${season}&season_type=regular&type=base&team_ids[]=${away.id}`)
        ]);

        const hAdv = homeAdvJson?.data?.[0]?.stats || {};
        const aAdv = awayAdvJson?.data?.[0]?.stats || {};
        const hBase = homeBaseJson?.data?.[0]?.stats || {};
        const aBase = awayBaseJson?.data?.[0]?.stats || {};

        const formatClutch = (adv, base, teamName) => ({
          team: teamName,
          clutch_record: `${adv.w || 0}-${adv.l || 0}`,
          clutch_win_pct: adv.w_pct ? `${(adv.w_pct * 100).toFixed(1)}%` : 'N/A',
          clutch_games: adv.gp || 0,
          clutch_net_rating: adv.net_rating ?? 'N/A',
          clutch_net_rank: adv.net_rating_rank ?? 'N/A',
          clutch_off_rating: adv.off_rating ?? 'N/A',
          clutch_def_rating: adv.def_rating ?? 'N/A',
          clutch_efg_pct: adv.efg_pct ? `${(adv.efg_pct * 100).toFixed(1)}%` : 'N/A',
          clutch_ts_pct: adv.ts_pct ? `${(adv.ts_pct * 100).toFixed(1)}%` : 'N/A',
          clutch_tov_pct: adv.tm_tov_pct ? `${(adv.tm_tov_pct * 100).toFixed(1)}%` : 'N/A',
          clutch_ppg: base.pts ?? 'N/A',
          clutch_plus_minus: base.plus_minus ?? 'N/A'
        });

        return {
          category: 'Clutch Performance (BDL Team Clutch Averages)',
          home: formatClutch(hAdv, hBase, home.full_name || home.name),
          away: formatClutch(aAdv, aBase, away.full_name || away.name)
        };
      }

      // Non-NBA: Sport not supported for clutch stats
      return { category: 'Clutch Stats', note: 'Only available for NBA', error: 'Sport not supported' };
    } catch (error) {
      console.error(`[Stat Router] Error fetching clutch stats:`, error.message);
      return {
        category: 'Clutch Stats',
        home: { team: home.full_name || home.name, close_record: 'N/A' },
        away: { team: away.full_name || away.name, close_record: 'N/A' }
      };
    }
  },

  // ===== LUCK-ADJUSTED (Pythagorean Expected Wins) =====
  LUCK_ADJUSTED: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching LUCK_ADJUSTED (Pythagorean expected wins) for ${away.name} @ ${home.name}`);
    
    try {
      // Get standings for wins/losses + recent games for scoring
      const [standings, homeGames, awayGames] = await Promise.all([
        ballDontLieService.getNbaStandings(season),
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [home.id], 
          start_date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
          per_page: 20 
        }),
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [away.id], 
          start_date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
          per_page: 20 
        })
      ]);
      
      // Find teams in standings
      const homeStanding = standings.find(s => s.team?.id === home.id);
      const awayStanding = standings.find(s => s.team?.id === away.id);
      
      // Calculate PPG from recent games
      const calcPpg = (games, teamId) => {
        const completedGames = (games || []).filter(g => (g.home_team_score ?? g.home_score ?? 0) > 0 || (g.visitor_team_score ?? g.away_score ?? 0) > 0);
        if (completedGames.length === 0) return { ppg: 0, oppPpg: 0 };

        let totalPf = 0, totalPa = 0;
        for (const g of completedGames) {
          const isHome = g.home_team?.id === teamId;
          totalPf += isHome ? (g.home_team_score ?? g.home_score ?? 0) : (g.visitor_team_score ?? g.away_score ?? 0);
          totalPa += isHome ? (g.visitor_team_score ?? g.away_score ?? 0) : (g.home_team_score ?? g.home_score ?? 0);
        }
        return { ppg: totalPf / completedGames.length, oppPpg: totalPa / completedGames.length };
      };
      
      const homeScoring = calcPpg(homeGames, home.id);
      const awayScoring = calcPpg(awayGames, away.id);
      
      // Calculate Pythagorean expected win %
      const calcPythagorean = (standing, scoring) => {
        const wins = standing?.wins || 0;
        const losses = standing?.losses || 0;
        const games = wins + losses;
        const ppg = scoring.ppg;
        const oppPpg = scoring.oppPpg;
        
        if (ppg === 0 || oppPpg === 0 || games === 0) {
          return { actual_record: 'N/A', expected_wins: 'N/A', luck_factor: 'N/A' };
        }
        
        // NBA Pythagorean exponent
        const exp = 13.91;
        const expectedWinPct = Math.pow(ppg, exp) / (Math.pow(ppg, exp) + Math.pow(oppPpg, exp));
        const expectedWins = Math.round(expectedWinPct * games * 10) / 10;
        const actualWinPct = wins / games;
        
        // Luck factor: positive = lucky (winning more than expected), negative = unlucky
        const luckFactor = ((actualWinPct - expectedWinPct) * 100).toFixed(1);
        const luckLabel = parseFloat(luckFactor) > 5 ? 'Winning more than expected — investigate' :
                          parseFloat(luckFactor) < -5 ? 'Winning less than expected — investigate' :
                          'Near expected win rate';
        
        return {
          actual_record: `${wins}-${losses}`,
          actual_win_pct: `${(actualWinPct * 100).toFixed(1)}%`,
          expected_wins: expectedWins.toFixed(1),
          expected_win_pct: `${(expectedWinPct * 100).toFixed(1)}%`,
          ppg: ppg.toFixed(1),
          opp_ppg: oppPpg.toFixed(1),
          luck_factor: `${parseFloat(luckFactor) > 0 ? '+' : ''}${luckFactor}%`,
          interpretation: luckLabel
        };
      };
      
      return {
        category: 'Luck-Adjusted (Pythagorean Expected Wins)',
        home: {
          team: home.full_name || home.name,
          ...calcPythagorean(homeStanding, homeScoring)
        },
        away: {
          team: away.full_name || away.name,
          ...calcPythagorean(awayStanding, awayScoring)
        },
        note: 'Teams with expected wins significantly different from actual wins - investigate sustainability.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching luck-adjusted stats:`, error.message);
      return {
        category: 'Luck-Adjusted',
        error: 'Data unavailable'
      };
    }
  },

  // ===== USAGE RATES (Real data from BDL advanced stats — usage concentration + top players) =====
  USAGE_RATES: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching USAGE_RATES for ${away.name} @ ${home.name}`);

    try {
      // Use fetchNBATeamAdvancedStats which already fetches usage data from BDL
      // season_averages/general?type=scoring (pct_pts_paint, etc.) and type=usage (usg_pct)
      const [homeAdvanced, awayAdvanced] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);

      const formatTeamUsage = (stats) => {
        if (!stats) return { error: 'Data unavailable' };
        return {
          usage_concentration: stats.usage_concentration || 'N/A',
          top_players: (stats.top_players || []).map(p => ({
            name: p.name,
            usage_pct: p.usage,
            minutes: p.mins
          })),
          scoring_profile: stats.scoring_profile || null
        };
      };

      return {
        category: 'Usage Rates & Offensive Concentration',
        source: 'Ball Don\'t Lie API (Advanced)',
        home: {
          team: home.full_name || home.name,
          ...formatTeamUsage(homeAdvanced)
        },
        away: {
          team: away.full_name || away.name,
          ...formatTeamUsage(awayAdvanced)
        },
        INVESTIGATE: 'Which team is more star-dependent vs balanced? How does that affect matchup?',
        note: 'Usage % = share of possessions used while on court. Star-heavy teams are more vulnerable to injury/foul trouble.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching usage rates:`, error.message);
      return { category: 'Usage Rates', error: 'Data unavailable' };
    }
  },

  // ===== VS ELITE TEAMS (Record vs Top 5 teams by conference) =====
  VS_ELITE_TEAMS: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching VS_ELITE_TEAMS for ${away.name} @ ${home.name}`);
    
    try {
      // Get standings to identify elite teams (top 5 in each conference)
      const standings = await ballDontLieService.getNbaStandings(season);
      
      // Get top 5 teams from each conference
      const eastElite = standings
        .filter(s => s.team?.conference === 'East')
        .sort((a, b) => (b.wins || 0) - (a.wins || 0))
        .slice(0, 5)
        .map(s => s.team?.id);
      
      const westElite = standings
        .filter(s => s.team?.conference === 'West')
        .sort((a, b) => (b.wins || 0) - (a.wins || 0))
        .slice(0, 5)
        .map(s => s.team?.id);
      
      const eliteTeamIds = [...eastElite, ...westElite];
      
      // Get games for each team this season
      const seasonStart = new Date(season - 1, 9, 1); // Oct 1
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        })
      ]);
      
      // Calculate record vs elite teams
      const calcVsElite = (games, teamId) => {
        let wins = 0, losses = 0;
        const eliteGames = [];
        
        for (const game of games || []) {
          const homeScore = game.home_team_score || 0;
          const awayScore = game.visitor_team_score || 0;
          if (homeScore === 0 && awayScore === 0) continue; // Unplayed
          
          const isHome = game.home_team?.id === teamId;
          const opponentId = isHome ? game.visitor_team?.id : game.home_team?.id;
          
          if (eliteTeamIds.includes(opponentId)) {
            const won = isHome ? homeScore > awayScore : awayScore > homeScore;
            if (won) wins++;
            else losses++;
            eliteGames.push({
              opponent: isHome ? game.visitor_team?.name : game.home_team?.name,
              result: won ? 'W' : 'L',
              score: isHome ? `${homeScore}-${awayScore}` : `${awayScore}-${homeScore}`
            });
          }
        }
        
        return {
          record: `${wins}-${losses}`,
          win_pct: wins + losses > 0 ? `${((wins / (wins + losses)) * 100).toFixed(0)}%` : 'N/A',
          games_played: wins + losses,
          recent_results: eliteGames.slice(0, 5)
        };
      };
      
      // Get elite team names for context
      const eliteTeamNames = standings
        .filter(s => eliteTeamIds.includes(s.team?.id))
        .map(s => s.team?.name)
        .slice(0, 10);
      
      return {
        category: 'Record vs Elite Teams (Top 5 Each Conference)',
        elite_teams: eliteTeamNames,
        home: {
          team: home.full_name || home.name,
          ...calcVsElite(homeGames, home.id)
        },
        away: {
          team: away.full_name || away.name,
          ...calcVsElite(awayGames, away.id)
        },
        note: 'Shows how each team performs against the best competition.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching vs elite teams:`, error.message);
      return { category: 'Record vs Elite Teams', error: 'Data unavailable' };
    }
  },

  // ===== SCHEDULE STRENGTH (Real SOS - Not an alias!) =====
  SCHEDULE_STRENGTH: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching SCHEDULE_STRENGTH for ${away.name} @ ${home.name}`);
    
    // Works for NBA, NHL, and college sports
    const isNba = bdlSport === 'basketball_nba';
    const isNhl = bdlSport === 'icehockey_nhl';
    
    try {
      // Get standings to know each team's record
      let standings = [];
      if (isNba) {
        standings = await ballDontLieService.getNbaStandings(season);
      } else if (isNhl) {
        standings = await ballDontLieService.getNhlStandings(season);
      } else {
        // For college, use getStandings generic
        standings = await ballDontLieService.getStandings(bdlSport, season);
      }
      
      // Build a map of team ID -> win percentage
      const teamWinPct = {};
      for (const s of standings || []) {
        const teamId = s.team?.id;
        const wins = s.wins || 0;
        const losses = s.losses || 0;
        const total = wins + losses;
        if (teamId && total > 0) {
          teamWinPct[teamId] = wins / total;
        }
      }
      
      // Get games for each team this season
      const seasonStart = new Date(season - 1, 9, 1); // Oct 1
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        })
      ]);
      
      // Calculate SOS for each team
      const calcSOS = (games, teamId) => {
        const completedGames = (games || []).filter(g => {
          const homeScore = g.home_team_score || g.home_score || 0;
          const awayScore = g.visitor_team_score || g.away_score || 0;
          return homeScore > 0 || awayScore > 0;
        });
        
        if (completedGames.length === 0) return null;
        
        let totalOppWinPct = 0;
        let opponentsWithData = 0;
        const opponentBreakdown = { elite: 0, good: 0, average: 0, weak: 0 };
        
        for (const game of completedGames) {
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          const oppId = isHome 
            ? (game.visitor_team?.id || game.visitor_team_id)
            : (game.home_team?.id || game.home_team_id);
          
          const oppWinPct = teamWinPct[oppId];
          if (oppWinPct !== undefined) {
            totalOppWinPct += oppWinPct;
            opponentsWithData++;
            
            // Categorize opponent
            if (oppWinPct >= 0.600) opponentBreakdown.elite++;
            else if (oppWinPct >= 0.500) opponentBreakdown.good++;
            else if (oppWinPct >= 0.400) opponentBreakdown.average++;
            else opponentBreakdown.weak++;
          }
        }
        
        if (opponentsWithData === 0) return null;
        
        const avgOppWinPct = totalOppWinPct / opponentsWithData;
        const sosRating = avgOppWinPct >= 0.520 ? 'HARD' :
                          avgOppWinPct >= 0.480 ? 'AVERAGE' : 'EASY';
        
        return {
          avg_opp_win_pct: `${(avgOppWinPct * 100).toFixed(1)}%`,
          games_analyzed: opponentsWithData,
          sos_rating: sosRating,
          opponent_breakdown: opponentBreakdown,
          vs_elite: opponentBreakdown.elite,
          vs_weak: opponentBreakdown.weak
        };
      };
      
      const homeSOS = calcSOS(homeGames, home.id);
      const awaySOS = calcSOS(awayGames, away.id);
      
      // Determine if records are inflated/deflated
      const getRecordContext = (sos, teamStanding) => {
        if (!sos || !teamStanding) return null;
        const teamWins = teamStanding.wins || 0;
        const teamLosses = teamStanding.losses || 0;
        const teamPct = teamWins / (teamWins + teamLosses) || 0;
        const avgOppPct = parseFloat(sos.avg_opp_win_pct) / 100;
        
        if (teamPct > 0.550 && avgOppPct < 0.470) {
          return 'RECORD MAY BE INFLATED - easy schedule';
        } else if (teamPct < 0.450 && avgOppPct > 0.530) {
          return 'RECORD MAY BE DEFLATED - tough schedule';
        } else if (teamPct > 0.550 && avgOppPct > 0.520) {
          return 'LEGIT RECORD - proven vs tough opponents';
        }
        return null;
      };
      
      const homeStanding = standings.find(s => s.team?.id === home.id);
      const awayStanding = standings.find(s => s.team?.id === away.id);
      
      return {
        category: 'Schedule Strength (Real SOS)',
        source: 'Ball Don\'t Lie API (calculated from opponent records)',
        home: {
          team: home.full_name || home.name,
          ...homeSOS,
          record_context: getRecordContext(homeSOS, homeStanding)
        },
        away: {
          team: away.full_name || away.name,
          ...awaySOS,
          record_context: getRecordContext(awaySOS, awayStanding)
        },
        INVESTIGATE: `How do the schedule strength ratings compare between these teams?`,
        note: 'League average SOS is 50%.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching SCHEDULE_STRENGTH:`, error.message);
      return { 
        category: 'Schedule Strength', 
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  // ===== BENCH DEPTH (NBA - Critical for Large Spreads) =====
  BENCH_DEPTH: async (bdlSport, home, away, season) => {
    // NCAAB: Use player season stats to compute depth (starters vs bench contribution)
    if (bdlSport === 'basketball_ncaab') {
      console.log(`[Stat Router] Fetching NCAAB BENCH_DEPTH for ${away.name} @ ${home.name}`);
      try {
        const [homeStats, awayStats] = await Promise.all([
          ballDontLieService.getNcaabPlayerSeasonStats({ teamId: home.id, season }),
          ballDontLieService.getNcaabPlayerSeasonStats({ teamId: away.id, season })
        ]);

        const calcNcaabDepth = (playerStats, teamName) => {
          if (!playerStats || playerStats.length === 0) return { error: 'No player stats' };
          // Calculate per-game averages, sort by PPG
          const players = playerStats
            .filter(s => (s.games_played || 0) > 0)
            .map(s => {
              const gp = s.games_played || 1;
              return {
                name: `${s.player?.first_name || ''} ${s.player?.last_name || ''}`.trim(),
                ppg: (s.pts || 0) / gp,
                rpg: (s.reb || 0) / gp,
                apg: (s.ast || 0) / gp,
                gp
              };
            })
            .sort((a, b) => b.ppg - a.ppg);

          const starters = players.slice(0, 5);
          const bench = players.slice(5);
          const starterPPG = starters.reduce((sum, p) => sum + p.ppg, 0);
          const benchPPG = bench.reduce((sum, p) => sum + p.ppg, 0);
          const benchContributors = bench.filter(p => p.ppg >= 3).length;

          return {
            starter_ppg: starterPPG.toFixed(1),
            bench_ppg: benchPPG.toFixed(1),
            bench_pct: starterPPG > 0 ? `${((benchPPG / (starterPPG + benchPPG)) * 100).toFixed(0)}%` : 'N/A',
            rotation_size: players.filter(p => p.ppg >= 3).length,
            bench_contributors: benchContributors,
            top_bench: bench.slice(0, 3).map(p => `${p.name} ${p.ppg.toFixed(1)}ppg`).join(', ') || 'None'
          };
        };

        const homeDepth = calcNcaabDepth(homeStats, home.name);
        const awayDepth = calcNcaabDepth(awayStats, away.name);
        const homeBench = parseFloat(homeDepth.bench_ppg) || 0;
        const awayBench = parseFloat(awayDepth.bench_ppg) || 0;
        const depthEdge = homeBench > awayBench + 3 ? 'HOME' : awayBench > homeBench + 3 ? 'AWAY' : 'EVEN';

        return {
          category: 'NCAAB Bench Depth (Season Stats)',
          home: { team: home.full_name || home.name, ...homeDepth },
          away: { team: away.full_name || away.name, ...awayDepth },
          depth_edge: depthEdge
        };
      } catch (error) {
        console.warn('[Stat Router] NCAAB BENCH_DEPTH error:', error.message);
        return { category: 'Bench Depth', error: 'Data unavailable for NCAAB' };
      }
    }

    // Non-NBA/NCAAB: not supported
    if (bdlSport !== 'basketball_nba') {
      return { category: 'Bench Depth', note: 'Only available for NBA/NCAAB', error: 'Sport not supported' };
    }

    console.log(`[Stat Router] Fetching BENCH_DEPTH for ${away.name} @ ${home.name}`);
    
    try {
      // Get recent games for both teams (last 10)
      const seasonStart = new Date(season - 1, 9, 1); // Oct 1
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 15
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 15
        })
      ]);
      
      // Get last 10 completed games for each team
      const getCompletedGames = (games, limit = 10) => {
        return (games || [])
          .filter(g => g.status === 'Final' && (g.home_team_score || 0) > 0)
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, limit);
      };
      
      const recentHomeGames = getCompletedGames(homeGames);
      const recentAwayGames = getCompletedGames(awayGames);
      
      if (recentHomeGames.length < 3 || recentAwayGames.length < 3) {
        return { category: 'Bench Depth', error: 'Not enough games to calculate bench depth' };
      }
      
      // Get player stats for these games
      const homeGameIds = recentHomeGames.map(g => g.id);
      const awayGameIds = recentAwayGames.map(g => g.id);
      
      const [homePlayerStats, awayPlayerStats] = await Promise.all([
        ballDontLieService.getPlayerStats(bdlSport, { game_ids: homeGameIds, per_page: 100 }),
        ballDontLieService.getPlayerStats(bdlSport, { game_ids: awayGameIds, per_page: 100 })
      ]);
      
      // Calculate bench depth for a team
      const calcBenchDepth = (playerStats, teamId, numGames) => {
        // Filter to only this team's players
        const teamStats = (playerStats || []).filter(s => s.team?.id === teamId);
        
        if (teamStats.length === 0) {
          return { error: 'No player stats available' };
        }
        
        // Aggregate stats by player
        const playerAgg = {};
        for (const stat of teamStats) {
          const playerId = stat.player?.id;
          if (!playerId) continue;
          
          if (!playerAgg[playerId]) {
            playerAgg[playerId] = {
              name: `${stat.player?.first_name || ''} ${stat.player?.last_name || ''}`.trim(),
              games: 0,
              minutes: 0,
              points: 0,
              plusMinus: 0
            };
          }
          
          // Parse minutes (format: "32" or "32:45")
          const minStr = stat.min || '0';
          const mins = parseInt(minStr.split(':')[0]) || 0;
          
          playerAgg[playerId].games++;
          playerAgg[playerId].minutes += mins;
          playerAgg[playerId].points += stat.pts || 0;
          playerAgg[playerId].plusMinus += stat.plus_minus || 0;
        }
        
        // Convert to array and sort by total minutes (most minutes = starter)
        const players = Object.entries(playerAgg)
          .map(([id, data]) => ({
            id,
            ...data,
            mpg: data.games > 0 ? data.minutes / data.games : 0,
            ppg: data.games > 0 ? data.points / data.games : 0,
            avgPlusMinus: data.games > 0 ? data.plusMinus / data.games : 0
          }))
          .sort((a, b) => b.mpg - a.mpg);
        
        // Top 5 by minutes = starters, rest = bench
        const starters = players.slice(0, 5);
        const bench = players.slice(5);
        
        // Calculate aggregates
        const starterPPG = starters.reduce((sum, p) => sum + p.ppg, 0);
        const benchPPG = bench.reduce((sum, p) => sum + p.ppg, 0);
        const starterMPG = starters.reduce((sum, p) => sum + p.mpg, 0);
        const benchMPG = bench.reduce((sum, p) => sum + p.mpg, 0);
        const starterPlusMinus = starters.reduce((sum, p) => sum + p.avgPlusMinus, 0) / Math.max(starters.length, 1);
        const benchPlusMinus = bench.reduce((sum, p) => sum + p.avgPlusMinus, 0) / Math.max(bench.length, 1);
        
        // Identify top bench scorers
        const topBench = bench.slice(0, 3).map(p => ({
          name: p.name,
          ppg: p.ppg.toFixed(1),
          mpg: p.mpg.toFixed(1)
        }));
        
        return {
          starter_ppg: starterPPG.toFixed(1),
          bench_ppg: benchPPG.toFixed(1),
          starter_mpg: starterMPG.toFixed(1),
          bench_mpg: benchMPG.toFixed(1),
          bench_plus_minus: benchPlusMinus.toFixed(1),
          starter_plus_minus: starterPlusMinus.toFixed(1),
          rotation_size: players.filter(p => p.mpg >= 10).length,
          top_bench_players: topBench,
          games_analyzed: numGames
        };
      };
      
      const homeDepth = calcBenchDepth(homePlayerStats, home.id, recentHomeGames.length);
      const awayDepth = calcBenchDepth(awayPlayerStats, away.id, recentAwayGames.length);
      
      // Determine which team has depth advantage
      const homeBenchPPG = parseFloat(homeDepth.bench_ppg) || 0;
      const awayBenchPPG = parseFloat(awayDepth.bench_ppg) || 0;
      const depthEdge = homeBenchPPG > awayBenchPPG + 3 ? 'HOME' : 
                        awayBenchPPG > homeBenchPPG + 3 ? 'AWAY' : 'EVEN';
      
      return {
        category: 'Bench Depth Analysis (Last 10 Games)',
        home: {
          team: home.full_name || home.name,
          ...homeDepth
        },
        away: {
          team: away.full_name || away.name,
          ...awayDepth
        },
        depth_edge: depthEdge,
        insight: `FOR LARGE SPREADS (7+): The bench must sustain leads. ${
          depthEdge === 'HOME' ? home.name + ' has deeper bench scoring (+' + (homeBenchPPG - awayBenchPPG).toFixed(1) + ' PPG)' :
          depthEdge === 'AWAY' ? away.name + ' has deeper bench scoring (+' + (awayBenchPPG - homeBenchPPG).toFixed(1) + ' PPG)' :
          'Bench scoring is roughly even - starters will determine margin'
        }`
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching bench depth:`, error.message);
      return { category: 'Bench Depth', error: 'Data unavailable - ' + error.message };
    }
  },

  // ===== NFL SPECIFIC =====
  // Helper to extract first element from BDL team_season_stats array response
  _extractNflStats: (statsArray) => {
    if (Array.isArray(statsArray) && statsArray.length > 0) return statsArray[0];
    return statsArray || {};
  },

  OFFENSIVE_EPA: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    // Extract first element from array response
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    // NCAAF uses different field names than NFL
    if (bdlSport === 'americanfootball_ncaaf') {
      const homeTotalYpg = (homeStats?.passing_yards_per_game || 0) + (homeStats?.rushing_yards_per_game || 0);
      const awayTotalYpg = (awayStats?.passing_yards_per_game || 0) + (awayStats?.rushing_yards_per_game || 0);
      const homeTotalTds = (homeStats?.passing_touchdowns || 0) + (homeStats?.rushing_touchdowns || 0);
      const awayTotalTds = (awayStats?.passing_touchdowns || 0) + (awayStats?.rushing_touchdowns || 0);
      
      return {
        category: 'Offensive Production',
        data_scope: 'Season yards and touchdowns (not EPA)',
        home: {
          team: home.full_name || home.name,
          total_yards_per_game: fmtNum(homeTotalYpg),
          passing_ypg: fmtNum(homeStats?.passing_yards_per_game),
          rushing_ypg: fmtNum(homeStats?.rushing_yards_per_game),
          total_tds: homeTotalTds.toString()
        },
        away: {
          team: away.full_name || away.name,
          total_yards_per_game: fmtNum(awayTotalYpg),
          passing_ypg: fmtNum(awayStats?.passing_yards_per_game),
          rushing_ypg: fmtNum(awayStats?.rushing_yards_per_game),
          total_tds: awayTotalTds.toString()
        }
      };
    }
    
    // NFL and other sports
    // Calculate yards per play correctly using season totals
    const homeGamesPlayed = homeStats?.games_played || 1;
    const awayGamesPlayed = awayStats?.games_played || 1;
    const homeTotalYards = homeStats?.total_offensive_yards || (homeStats?.total_offensive_yards_per_game * homeGamesPlayed);
    const awayTotalYards = awayStats?.total_offensive_yards || (awayStats?.total_offensive_yards_per_game * awayGamesPlayed);
    const homeTotalPlays = (homeStats?.passing_attempts || 0) + (homeStats?.rushing_attempts || 0);
    const awayTotalPlays = (awayStats?.passing_attempts || 0) + (awayStats?.rushing_attempts || 0);
    
    return {
      category: 'Offensive Efficiency',
      data_scope: 'Season yards and points (not EPA)',
      home: {
        team: home.full_name || home.name,
        points_per_game: fmtNum(homeStats?.total_points_per_game),
        yards_per_game: fmtNum(homeStats?.total_offensive_yards_per_game),
        yards_per_play: fmtNum(homeTotalPlays > 0 ? homeTotalYards / homeTotalPlays : 0, 1)
      },
      away: {
        team: away.full_name || away.name,
        points_per_game: fmtNum(awayStats?.total_points_per_game),
        yards_per_game: fmtNum(awayStats?.total_offensive_yards_per_game),
        yards_per_play: fmtNum(awayTotalPlays > 0 ? awayTotalYards / awayTotalPlays : 0, 1)
      }
    };
  },
  
  DEFENSIVE_EPA: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    // NCAAF uses different field names
    if (bdlSport === 'americanfootball_ncaaf') {
      const homeOppYards = (homeStats?.opp_passing_yards || 0) + (homeStats?.opp_rushing_yards || 0);
      const awayOppYards = (awayStats?.opp_passing_yards || 0) + (awayStats?.opp_rushing_yards || 0);
      
      return {
        category: 'Defensive Production',
        data_scope: 'Season yards allowed (not EPA)',
        home: {
          team: home.full_name || home.name,
          opp_total_yards: fmtNum(homeOppYards),
          opp_passing_yards: fmtNum(homeStats?.opp_passing_yards),
          opp_rushing_yards: fmtNum(homeStats?.opp_rushing_yards)
        },
        away: {
          team: away.full_name || away.name,
          opp_total_yards: fmtNum(awayOppYards),
          opp_passing_yards: fmtNum(awayStats?.opp_passing_yards),
          opp_rushing_yards: fmtNum(awayStats?.opp_rushing_yards)
        }
      };
    }
    
    // NFL and other sports
    return {
      category: 'Defensive Efficiency',
      data_scope: 'Season yards and points allowed (not EPA)',
      home: {
        team: home.full_name || home.name,
        opp_points_per_game: fmtNum(homeStats?.opp_total_points_per_game),
        opp_yards_per_game: fmtNum(homeStats?.opp_total_offensive_yards_per_game)
      },
      away: {
        team: away.full_name || away.name,
        opp_points_per_game: fmtNum(awayStats?.opp_total_points_per_game),
        opp_yards_per_game: fmtNum(awayStats?.opp_total_offensive_yards_per_game)
      }
    };
  },
  
  TURNOVER_MARGIN: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Turnover Margin',
      home: {
        team: home.full_name || home.name,
        turnover_diff: fmtNum(homeStats?.misc_turnover_differential, 0),
        takeaways: fmtNum(homeStats?.misc_total_takeaways, 0),
        giveaways: fmtNum(homeStats?.misc_total_giveaways, 0)
      },
      away: {
        team: away.full_name || away.name,
        turnover_diff: fmtNum(awayStats?.misc_turnover_differential, 0),
        takeaways: fmtNum(awayStats?.misc_total_takeaways, 0),
        giveaways: fmtNum(awayStats?.misc_total_giveaways, 0)
      },
      interpretation: interpretTurnoverMargin(homeStats, awayStats)
    };
  },
  
  RED_ZONE_OFFENSE: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name;
    const awayName = away.full_name || away.name;
    
    // NCAAF: BDL doesn't provide red zone data, return N/A
    if (bdlSport === 'americanfootball_ncaaf') {
      return {
        category: 'Red Zone Efficiency',
        home: { team: homeName, red_zone_td_pct: 'N/A' },
        away: { team: awayName, red_zone_td_pct: 'N/A' },
        note: 'NCAAF red zone data unavailable from BDL'
      };
    }
    
    // Try to get actual red zone data from recent games (NFL)
    const [homeGames, awayGames] = await Promise.all([
      ballDontLieService.getTeamStats ? 
        ballDontLieService.getTeamStats(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 10 }) : [],
      ballDontLieService.getTeamStats ? 
        ballDontLieService.getTeamStats(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 10 }) : []
    ]);
    
    // Aggregate red zone stats from games
    const aggregateRedZone = (games, teamId) => {
      let rzScores = 0, rzAttempts = 0;
      const teamGames = (games || []).filter(g => g.team?.id === teamId);
      teamGames.forEach(g => {
        rzScores += g.red_zone_scores || 0;
        rzAttempts += g.red_zone_attempts || 0;
      });
      return {
        scores: rzScores,
        attempts: rzAttempts,
        pct: rzAttempts > 0 ? ((rzScores / rzAttempts) * 100).toFixed(1) + '%' : 'N/A',
        games: teamGames.length
      };
    };
    
    const homeRZ = aggregateRedZone(homeGames, home.id);
    const awayRZ = aggregateRedZone(awayGames, away.id);
    
    // If we got real red zone data, use it
    if (homeRZ.attempts > 0 || awayRZ.attempts > 0) {
      return {
        category: 'Red Zone Scoring Efficiency',
        home: {
          team: homeName,
          red_zone_td_pct: homeRZ.pct,
          red_zone_scores: homeRZ.scores.toString(),
          red_zone_attempts: homeRZ.attempts.toString()
        },
        away: {
          team: awayName,
          red_zone_td_pct: awayRZ.pct,
          red_zone_scores: awayRZ.scores.toString(),
          red_zone_attempts: awayRZ.attempts.toString()
        },
        note: `Aggregated from ${homeRZ.games} home games, ${awayRZ.games} away games`
      };
    }
    
    // Red zone data unavailable — return error instead of substituting a different stat
    return {
      category: 'Red Zone Scoring Efficiency',
      error: 'Red zone data unavailable from BDL for this game',
      home: { team: homeName, red_zone_td_pct: 'N/A', red_zone_scores: 'N/A', red_zone_attempts: 'N/A' },
      away: { team: awayName, red_zone_td_pct: 'N/A', red_zone_scores: 'N/A', red_zone_attempts: 'N/A' },
      note: 'Red zone game data not available. Use Gemini grounding to investigate red zone efficiency if needed.'
    };
  },
  
  QB_STATS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Quarterback/Passing Stats',
      home: {
        team: home.full_name || home.name,
        qb_rating: fmtNum(homeStats?.passing_qb_rating),
        completion_pct: fmtPct(homeStats?.passing_completion_pct / 100),
        yards_per_attempt: fmtNum(homeStats?.yards_per_pass_attempt),
        passing_tds: fmtNum(homeStats?.passing_touchdowns, 0),
        interceptions: fmtNum(homeStats?.passing_interceptions, 0)
      },
      away: {
        team: away.full_name || away.name,
        qb_rating: fmtNum(awayStats?.passing_qb_rating),
        completion_pct: fmtPct(awayStats?.passing_completion_pct / 100),
        yards_per_attempt: fmtNum(awayStats?.yards_per_pass_attempt),
        passing_tds: fmtNum(awayStats?.passing_touchdowns, 0),
        interceptions: fmtNum(awayStats?.passing_interceptions, 0)
      }
    };
  },
  
  RB_STATS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Rushing Stats',
      home: {
        team: home.full_name || home.name,
        rushing_yards_per_game: fmtNum(homeStats?.rushing_yards_per_game),
        yards_per_carry: fmtNum(homeStats?.rushing_yards_per_rush_attempt),
        rushing_tds: fmtNum(homeStats?.rushing_touchdowns, 0)
      },
      away: {
        team: away.full_name || away.name,
        rushing_yards_per_game: fmtNum(awayStats?.rushing_yards_per_game),
        yards_per_carry: fmtNum(awayStats?.rushing_yards_per_rush_attempt),
        rushing_tds: fmtNum(awayStats?.rushing_touchdowns, 0)
      }
    };
  },

  // ===== NFL-SPECIFIC STATS (unique data for each token) =====
  
  SUCCESS_RATE_OFFENSE: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Offensive Success Rate (3rd/4th Down)',
      data_scope: 'Third and fourth down conversion rates (not per-play success rate)',
      home: {
        team: home.full_name || home.name,
        third_down_pct: fmtPct(homeStats?.misc_third_down_conv_pct / 100),
        fourth_down_pct: fmtPct(homeStats?.misc_fourth_down_conv_pct / 100),
        third_down_att: fmtNum(homeStats?.misc_third_down_conv_att, 0),
        third_down_made: fmtNum(homeStats?.misc_third_down_conv_made, 0)
      },
      away: {
        team: away.full_name || away.name,
        third_down_pct: fmtPct(awayStats?.misc_third_down_conv_pct / 100),
        fourth_down_pct: fmtPct(awayStats?.misc_fourth_down_conv_pct / 100),
        third_down_att: fmtNum(awayStats?.misc_third_down_conv_att, 0),
        third_down_made: fmtNum(awayStats?.misc_third_down_conv_made, 0)
      }
    };
  },

  SUCCESS_RATE_DEFENSE: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Defensive Success Rate (Opp 3rd/4th Down)',
      data_scope: 'Third and fourth down conversion rates (not per-play success rate)',
      home: {
        team: home.full_name || home.name,
        opp_third_down_pct: fmtPct(homeStats?.opp_third_down_conv_pct / 100),
        opp_fourth_down_pct: fmtPct(homeStats?.opp_fourth_down_conv_pct / 100)
      },
      away: {
        team: away.full_name || away.name,
        opp_third_down_pct: fmtPct(awayStats?.opp_third_down_conv_pct / 100),
        opp_fourth_down_pct: fmtPct(awayStats?.opp_fourth_down_conv_pct / 100)
      }
    };
  },

  EXPLOSIVE_PLAYS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    // BDL doesn't have actual explosive play data (plays > 20 yards)
    // Use longest plays and yards per attempt as proxies for explosiveness
    return {
      category: 'Explosive Play Potential',
      home: {
        team: home.full_name || home.name,
        longest_pass: fmtNum(homeStats?.passing_long, 0),
        longest_rush: fmtNum(homeStats?.rushing_long, 0),
        yards_per_catch: fmtNum(homeStats?.receiving_yards_per_reception, 1),
        yards_per_carry: fmtNum(homeStats?.rushing_yards_per_rush_attempt, 1)
      },
      away: {
        team: away.full_name || away.name,
        longest_pass: fmtNum(awayStats?.passing_long, 0),
        longest_rush: fmtNum(awayStats?.rushing_long, 0),
        yards_per_catch: fmtNum(awayStats?.receiving_yards_per_reception, 1),
        yards_per_carry: fmtNum(awayStats?.rushing_yards_per_rush_attempt, 1)
      }
    };
  },

  PRESSURE_RATE: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Pressure/Sack Stats',
      home: {
        team: home.full_name || home.name,
        sacks_made: fmtNum(homeStats?.defense_sacks, 0),
        sacks_allowed: fmtNum(homeStats?.passing_sacks_allowed, 0),
        qb_hits: fmtNum(homeStats?.defense_qb_hits, 0)
      },
      away: {
        team: away.full_name || away.name,
        sacks_made: fmtNum(awayStats?.defense_sacks, 0),
        sacks_allowed: fmtNum(awayStats?.passing_sacks_allowed, 0),
        qb_hits: fmtNum(awayStats?.defense_qb_hits, 0)
      }
    };
  },

  EPA_LAST_5: async (bdlSport, home, away, season) => {
    // Fetch last 5 completed games for each team to compute actual L5 scoring
    const [homeGamesRaw, awayGamesRaw] = await Promise.all([
      ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 25 }),
      ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 25 })
    ]);

    const calcL5Scoring = (games, teamId) => {
      if (!games || games.length === 0) return null;
      // Filter to completed games, sort by date descending, take last 5
      const completed = games
        .filter(g => isGameCompleted(g.status))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);
      if (completed.length === 0) return null;

      let totalPts = 0, totalOppPts = 0;
      for (const g of completed) {
        const isHome = (g.home_team?.id || g.home_team_id) === teamId;
        const teamScore = isHome
          ? (g.home_team_score ?? g.home_score ?? 0)
          : (g.visitor_team_score ?? g.away_score ?? 0);
        const oppScore = isHome
          ? (g.visitor_team_score ?? g.away_score ?? 0)
          : (g.home_team_score ?? g.home_score ?? 0);
        totalPts += teamScore;
        totalOppPts += oppScore;
      }
      const count = completed.length;
      const ppg = totalPts / count;
      const oppPpg = totalOppPts / count;
      return {
        games_used: count,
        ppg: fmtNum(ppg, 1),
        opp_ppg: fmtNum(oppPpg, 1),
        point_diff: fmtNum(ppg - oppPpg, 1)
      };
    };

    const homeL5 = calcL5Scoring(homeGamesRaw, home.id);
    const awayL5 = calcL5Scoring(awayGamesRaw, away.id);

    return {
      category: 'Last 5 Games Scoring Efficiency',
      data_scope: 'Actual L5 game scores (not per-play EPA)',
      home: {
        team: home.full_name || home.name,
        ...(homeL5 || { note: 'No completed games found' })
      },
      away: {
        team: away.full_name || away.name,
        ...(awayL5 || { note: 'No completed games found' })
      }
    };
  },

  RED_ZONE_DEFENSE: async (bdlSport, home, away, season) => {
    // Try to get actual red zone defense data from recent games (opponent stats)
    const [homeGames, awayGames] = await Promise.all([
      ballDontLieService.getTeamStats ? 
        ballDontLieService.getTeamStats(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 10 }) : [],
      ballDontLieService.getTeamStats ? 
        ballDontLieService.getTeamStats(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 10 }) : []
    ]);
    
    // For defense, we need opponent's red zone stats when playing against this team
    // This requires getting opponent stats from games, which is complex
    // For now, fall back to defensive efficiency metrics
    
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Defensive Efficiency Summary',
      data_scope: 'General defensive stats (red zone specific data unavailable from BDL)',
      home: {
        team: home.full_name || home.name,
        opp_ppg: fmtNum(homeStats?.opp_total_points_per_game),
        opp_yards_per_game: fmtNum(homeStats?.opp_total_offensive_yards_per_game),
        takeaways: fmtNum((homeStats?.defense_interceptions || 0) + (homeStats?.defense_fumble_recoveries || 0), 0),
        sacks: fmtNum(homeStats?.opp_passing_sacks || homeStats?.defense_sacks, 0)
      },
      away: {
        team: away.full_name || away.name,
        opp_ppg: fmtNum(awayStats?.opp_total_points_per_game),
        opp_yards_per_game: fmtNum(awayStats?.opp_total_offensive_yards_per_game),
        takeaways: fmtNum((awayStats?.defense_interceptions || 0) + (awayStats?.defense_fumble_recoveries || 0), 0),
        sacks: fmtNum(awayStats?.opp_passing_sacks || awayStats?.defense_sacks, 0)
      }
    };
  },

  WR_TE_STATS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Receiving/Passing Attack',
      home: {
        team: home.full_name || home.name,
        receiving_yards_per_game: fmtNum(homeStats?.passing_yards_per_game),
        receiving_tds: fmtNum(homeStats?.passing_touchdowns, 0),
        yards_per_catch: fmtNum(homeStats?.passing_yards / (homeStats?.passing_completions || 1)),
        completion_pct: fmtPct(homeStats?.passing_completion_pct / 100)
      },
      away: {
        team: away.full_name || away.name,
        receiving_yards_per_game: fmtNum(awayStats?.passing_yards_per_game),
        receiving_tds: fmtNum(awayStats?.passing_touchdowns, 0),
        yards_per_catch: fmtNum(awayStats?.passing_yards / (awayStats?.passing_completions || 1)),
        completion_pct: fmtPct(awayStats?.passing_completion_pct / 100)
      }
    };
  },

  DEFENSIVE_PLAYMAKERS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Defensive Playmaking',
      home: {
        team: home.full_name || home.name,
        interceptions: fmtNum(homeStats?.defense_interceptions, 0),
        fumble_recoveries: fmtNum(homeStats?.defense_fumble_recoveries, 0),
        sacks: fmtNum(homeStats?.defense_sacks, 0),
        total_takeaways: fmtNum((homeStats?.defense_interceptions || 0) + (homeStats?.defense_fumble_recoveries || 0), 0)
      },
      away: {
        team: away.full_name || away.name,
        interceptions: fmtNum(awayStats?.defense_interceptions, 0),
        fumble_recoveries: fmtNum(awayStats?.defense_fumble_recoveries, 0),
        sacks: fmtNum(awayStats?.defense_sacks, 0),
        total_takeaways: fmtNum((awayStats?.defense_interceptions || 0) + (awayStats?.defense_fumble_recoveries || 0), 0)
      }
    };
  },

  TURNOVER_LUCK: async (bdlSport, home, away, season) => {
    try {
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
        ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
      ]);
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;

      if (!homeStats || !awayStats) {
        return { category: 'Turnover Analysis', error: 'Data unavailable — BDL returned no stats for one or both teams' };
      }

      const homeTakeaways = (homeStats.defense_interceptions || 0) + (homeStats.defense_fumble_recoveries || 0);
      const homeGiveaways = (homeStats.passing_interceptions || 0) + (homeStats.offense_fumbles_lost || 0);
      const awayTakeaways = (awayStats.defense_interceptions || 0) + (awayStats.defense_fumble_recoveries || 0);
      const awayGiveaways = (awayStats.passing_interceptions || 0) + (awayStats.offense_fumbles_lost || 0);

      return {
        category: 'Turnover Analysis',
        home: {
          team: home.full_name || home.name,
          takeaways: fmtNum(homeTakeaways, 0),
          giveaways: fmtNum(homeGiveaways, 0),
          turnover_diff: fmtNum(homeTakeaways - homeGiveaways, 0)
        },
        away: {
          team: away.full_name || away.name,
          takeaways: fmtNum(awayTakeaways, 0),
          giveaways: fmtNum(awayGiveaways, 0),
          turnover_diff: fmtNum(awayTakeaways - awayGiveaways, 0)
        }
      };
    } catch (err) {
      console.error(`[Stat Router] TURNOVER_LUCK error: ${err.message}`);
      return { category: 'Turnover Analysis', error: 'Data unavailable' };
    }
  },

  // ===== NFL EARLY/LATE DOWN & EXPLOSIVENESS STATS =====

  EARLY_DOWN_SUCCESS: async (bdlSport, home, away, season) => {
    // Early downs (1st & 2nd down) success rate - BDL doesn't have this directly
    // Use Gemini Grounding to get actual early down success rate from PFR/FO
    console.log(`[Stat Router] Fetching EARLY_DOWN_SUCCESS for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Early Down Success', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:pro-football-reference.com OR site:footballoutsiders.com
        ${seasonStr} NFL early down success rate first down second down efficiency ${home.name} ${away.name}.
        For each team:
        1. First down success rate (% of 1st downs gaining 4+ yards)
        2. Second down success rate
        3. Early down EPA (if available)
        4. Yards per first down
        5. Negative play rate on early downs`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from Pro Football Reference or Football Outsiders. Provide exact early down success metrics for both teams.'
      });
      
      return {
        category: 'Early Down Success Rate',
        source: 'Pro-Football-Reference / Football Outsiders via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `How do early down success rates compare between these teams?`,
        note: 'League average early down success rate is ~48%.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching EARLY_DOWN_SUCCESS:`, error.message);
      return { category: 'Early Down Success', error: 'Data unavailable' };
    }
  },

  LATE_DOWN_EFFICIENCY: async (bdlSport, home, away, season) => {
    // Late downs (3rd & 4th) - BDL has this!
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Late Down Efficiency (3rd & 4th Down)',
      home: {
        team: home.full_name || home.name,
        third_down_pct: fmtPct(homeStats?.misc_third_down_conv_pct / 100),
        fourth_down_pct: fmtPct(homeStats?.misc_fourth_down_conv_pct / 100),
        third_down_att: fmtNum(homeStats?.misc_third_down_conv_att, 0),
        third_down_made: fmtNum(homeStats?.misc_third_down_conv_made, 0),
        fourth_down_att: fmtNum(homeStats?.misc_fourth_down_conv_att, 0),
        fourth_down_made: fmtNum(homeStats?.misc_fourth_down_conv_made, 0)
      },
      away: {
        team: away.full_name || away.name,
        third_down_pct: fmtPct(awayStats?.misc_third_down_conv_pct / 100),
        fourth_down_pct: fmtPct(awayStats?.misc_fourth_down_conv_pct / 100),
        third_down_att: fmtNum(awayStats?.misc_third_down_conv_att, 0),
        third_down_made: fmtNum(awayStats?.misc_third_down_conv_made, 0),
        fourth_down_att: fmtNum(awayStats?.misc_fourth_down_conv_att, 0),
        fourth_down_made: fmtNum(awayStats?.misc_fourth_down_conv_made, 0)
      },
      INVESTIGATE: `How do 3rd down conversion rates compare between these teams?`,
      note: 'League average 3rd down conversion is ~40%.'
    };
  },

  EXPLOSIVE_ALLOWED: async (bdlSport, home, away, season) => {
    // Defensive version - how many explosive plays does each team ALLOW?
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Explosive Plays Allowed (Defense)',
      home: {
        team: home.full_name || home.name,
        opp_longest_pass: fmtNum(homeStats?.opp_passing_long, 0),
        opp_longest_rush: fmtNum(homeStats?.opp_rushing_long, 0),
        opp_yards_per_catch: fmtNum(homeStats?.opp_receiving_yards_per_reception, 1),
        opp_yards_per_carry: fmtNum(homeStats?.opp_rushing_yards_per_rush_attempt, 1)
      },
      away: {
        team: away.full_name || away.name,
        opp_longest_pass: fmtNum(awayStats?.opp_passing_long, 0),
        opp_longest_rush: fmtNum(awayStats?.opp_rushing_long, 0),
        opp_yards_per_catch: fmtNum(awayStats?.opp_receiving_yards_per_reception, 1),
        opp_yards_per_carry: fmtNum(awayStats?.opp_rushing_yards_per_rush_attempt, 1)
      },
      INVESTIGATE: `How do the explosive plays allowed compare between these defenses?`,
      note: 'Compare to EXPLOSIVE_PLAYS to see offensive vs defensive matchup.'
    };
  },

  FUMBLE_LUCK: async (bdlSport, home, away, season) => {
    // Fumble luck - fumbles forced vs fumbles lost (regression indicator)
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    // Fumble recovery rate is ~50% over time - deviations indicate luck
    const homeFumblesLost = homeStats?.offense_fumbles_lost || 0;
    const homeFumblesTotal = homeStats?.offense_fumbles || homeFumblesLost; // If no total, use lost
    const homeFumblesRecovered = homeFumblesTotal - homeFumblesLost;
    const homeRecoveryRate = homeFumblesTotal > 0 ? (homeFumblesRecovered / homeFumblesTotal) : 0.5;
    
    const awayFumblesLost = awayStats?.offense_fumbles_lost || 0;
    const awayFumblesTotal = awayStats?.offense_fumbles || awayFumblesLost;
    const awayFumblesRecovered = awayFumblesTotal - awayFumblesLost;
    const awayRecoveryRate = awayFumblesTotal > 0 ? (awayFumblesRecovered / awayFumblesTotal) : 0.5;
    
    // Defensive fumbles
    const homeDefForcedFumbles = homeStats?.defense_forced_fumbles || 0;
    const homeDefRecoveries = homeStats?.defense_fumble_recoveries || 0;
    const awayDefForcedFumbles = awayStats?.defense_forced_fumbles || 0;
    const awayDefRecoveries = awayStats?.defense_fumble_recoveries || 0;
    
    return {
      category: 'Fumble Luck Analysis',
      home: {
        team: home.full_name || home.name,
        off_fumbles_lost: fmtNum(homeFumblesLost, 0),
        off_fumbles_total: fmtNum(homeFumblesTotal, 0),
        off_recovery_rate: fmtPct(homeRecoveryRate),
        def_forced_fumbles: fmtNum(homeDefForcedFumbles, 0),
        def_recoveries: fmtNum(homeDefRecoveries, 0),
        luck_indicator: homeRecoveryRate > 0.55 ? 'LUCKY (may regress)' : homeRecoveryRate < 0.45 ? 'UNLUCKY (may improve)' : 'Average'
      },
      away: {
        team: away.full_name || away.name,
        off_fumbles_lost: fmtNum(awayFumblesLost, 0),
        off_fumbles_total: fmtNum(awayFumblesTotal, 0),
        off_recovery_rate: fmtPct(awayRecoveryRate),
        def_forced_fumbles: fmtNum(awayDefForcedFumbles, 0),
        def_recoveries: fmtNum(awayDefRecoveries, 0),
        luck_indicator: awayRecoveryRate > 0.55 ? 'LUCKY (may regress)' : awayRecoveryRate < 0.45 ? 'UNLUCKY (may improve)' : 'Average'
      },
      INVESTIGATE: `How do the fumble recovery rates compare to the ~50% long-term baseline?`,
      note: 'Long-term fumble recovery rate baseline is ~50%.'
    };
  },

  PASSING_EPA: async (bdlSport, home, away, season) => {
    // Passing efficiency metrics from BDL
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    // Calculate passer rating components
    const homeYPA = homeStats?.passing_yards_per_pass_attempt || 0;
    const homeTDPct = homeStats?.passing_touchdowns && homeStats?.passing_attempts 
      ? (homeStats.passing_touchdowns / homeStats.passing_attempts * 100) : 0;
    const homeINTPct = homeStats?.passing_interceptions && homeStats?.passing_attempts
      ? (homeStats.passing_interceptions / homeStats.passing_attempts * 100) : 0;
    
    const awayYPA = awayStats?.passing_yards_per_pass_attempt || 0;
    const awayTDPct = awayStats?.passing_touchdowns && awayStats?.passing_attempts
      ? (awayStats.passing_touchdowns / awayStats.passing_attempts * 100) : 0;
    const awayINTPct = awayStats?.passing_interceptions && awayStats?.passing_attempts
      ? (awayStats.passing_interceptions / awayStats.passing_attempts * 100) : 0;
    
    return {
      category: 'Passing Efficiency',
      data_scope: 'Season passing stats (not per-play EPA)',
      home: {
        team: home.full_name || home.name,
        yards_per_attempt: fmtNum(homeYPA, 1),
        completion_pct: fmtPct(homeStats?.passing_completion_pct / 100),
        td_pct: fmtPct(homeTDPct / 100),
        int_pct: fmtPct(homeINTPct / 100),
        passing_yards_per_game: fmtNum(homeStats?.passing_yards_per_game, 0),
        passing_tds: fmtNum(homeStats?.passing_touchdowns, 0),
        interceptions: fmtNum(homeStats?.passing_interceptions, 0),
        sacks_allowed: fmtNum(homeStats?.passing_times_sacked, 0)
      },
      away: {
        team: away.full_name || away.name,
        yards_per_attempt: fmtNum(awayYPA, 1),
        completion_pct: fmtPct(awayStats?.passing_completion_pct / 100),
        td_pct: fmtPct(awayTDPct / 100),
        int_pct: fmtPct(awayINTPct / 100),
        passing_yards_per_game: fmtNum(awayStats?.passing_yards_per_game, 0),
        passing_tds: fmtNum(awayStats?.passing_touchdowns, 0),
        interceptions: fmtNum(awayStats?.passing_interceptions, 0),
        sacks_allowed: fmtNum(awayStats?.passing_times_sacked, 0)
      },
      INVESTIGATE: `How do the QBs' YPA compare? League avg is ~7.0.`,
      note: 'Investigate: How does each QB\'s TD%/INT% compare? Check these against the opposing pass defense.'
    };
  },

  RUSHING_EPA: async (bdlSport, home, away, season) => {
    // Rushing efficiency metrics from BDL
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Rushing Efficiency',
      data_scope: 'Season rushing stats (not per-play EPA)',
      home: {
        team: home.full_name || home.name,
        yards_per_carry: fmtNum(homeStats?.rushing_yards_per_rush_attempt, 1),
        rushing_yards_per_game: fmtNum(homeStats?.rushing_yards_per_game, 0),
        rushing_tds: fmtNum(homeStats?.rushing_touchdowns, 0),
        rush_attempts_per_game: fmtNum(homeStats?.rushing_attempts_per_game, 1),
        longest_rush: fmtNum(homeStats?.rushing_long, 0)
      },
      away: {
        team: away.full_name || away.name,
        yards_per_carry: fmtNum(awayStats?.rushing_yards_per_rush_attempt, 1),
        rushing_yards_per_game: fmtNum(awayStats?.rushing_yards_per_game, 0),
        rushing_tds: fmtNum(awayStats?.rushing_touchdowns, 0),
        rush_attempts_per_game: fmtNum(awayStats?.rushing_attempts_per_game, 1),
        longest_rush: fmtNum(awayStats?.rushing_long, 0)
      },
      INVESTIGATE: `How do the teams' YPC compare? League avg is ~4.3. How does each rushing attack match up against the opposing run defense?`,
      note: 'Investigate: Does either team rely on high rush volume (25+ att/game)? How does that identity affect this matchup?'
    };
  },

  // ===== NFL MISSING STATS (Real Data via Gemini Grounding) =====

  // SOURCE: PFF (Pro Football Focus), Football Outsiders, ESPN
  OL_RANKINGS: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching OL_RANKINGS for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Offensive Line Rankings', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:nextgenstats.nfl.com OR site:pff.com OR site:footballoutsiders.com
        ${seasonStr} NFL offensive line rankings pass block win rate run blocking grades ${home.name} ${away.name}.
        For each team's offensive line:
        1. Pass block win rate (Next Gen Stats)
        2. Overall OL ranking/grade (PFF)
        3. Run blocking grade/efficiency
        4. Sacks allowed this season
        5. Adjusted Line Yards (Football Outsiders)`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from NFL Next Gen Stats for pass block win rate, and PFF/Football Outsiders for grades. Provide exact offensive line rankings and grades for both teams.'
      });
      
      return {
        category: 'Offensive Line Rankings',
        source: 'NFL Next Gen Stats / PFF / Football Outsiders via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `How do each team's OL rankings compare against the opposing DL? Is there a mismatch?`,
        note: 'Investigate: How does each OL perform under pressure? Check sack rate and pressure rate allowed.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching OL_RANKINGS:`, error.message);
      return { category: 'OL Rankings', error: 'Data unavailable' };
    }
  },

  // SOURCE: PFF, Football Outsiders, Pro Football Reference
  DL_RANKINGS: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching DL_RANKINGS for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Defensive Line Rankings', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:nextgenstats.nfl.com OR site:pff.com OR site:footballoutsiders.com
        ${seasonStr} NFL defensive line pass rush win rate pressure rate ${home.name} ${away.name}.
        For each team's defensive line:
        1. Pass rush win rate (Next Gen Stats)
        2. Overall DL ranking/grade (PFF)
        3. Pressure rate and sacks
        4. Run defense grade/Adjusted Line Yards allowed
        5. Key pass rushers and their individual win rates`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from NFL Next Gen Stats for pass rush win rate, and PFF/Football Outsiders for grades. Provide exact defensive line rankings and pass rush data for both teams.'
      });
      
      return {
        category: 'Defensive Line Rankings',
        source: 'NFL Next Gen Stats / PFF / Football Outsiders via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `How do each team's DL pressure rates compare against the opposing OL? What do the sack rates show?`,
        note: 'Investigate: How does each pass rush perform against quality OLs vs weak OLs? Check pressure rate and sack rate.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching DL_RANKINGS:`, error.message);
      return { category: 'DL Rankings', error: 'Data unavailable' };
    }
  },

  // SOURCE: Next Gen Stats (NFL.com), PFF, Pro Football Reference
  TIME_TO_THROW: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching TIME_TO_THROW for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Time to Throw', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:nfl.com/stats OR site:nextgenstats.nfl.com OR site:pro-football-reference.com
        ${seasonStr} NFL time to throw average QB release time ${home.name} ${away.name}.
        What is each QB's average time to throw?
        Include: average release time, % of quick throws (<2.5s), % of deep drops (>3s).
        Next Gen Stats data preferred.`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from NFL Next Gen Stats or Pro Football Reference. Provide exact time to throw data for both teams QBs.'
      });
      
      return {
        category: 'Time to Throw',
        source: 'NFL Next Gen Stats / Pro-Football-Reference via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `How does each QB's release time interact with the opposing pass rush?`,
        note: 'League average time to throw is ~2.6 seconds.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching TIME_TO_THROW:`, error.message);
      return { category: 'Time to Throw', error: 'Data unavailable' };
    }
  },

  // SOURCE: Pro Football Reference, Football Outsiders
  GOAL_LINE: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching GOAL_LINE for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Goal Line', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:pro-football-reference.com OR site:footballoutsiders.com
        ${seasonStr} NFL red zone efficiency goal to go inside 5 yard line ${home.name} ${away.name}.
        For each team:
        1. Goal line TD conversion rate (inside 5/10)
        2. Red zone TD % (offense and defense)
        3. Short yardage conversion rate (3rd/4th and 1-2)
        4. Stuffed rate on goal line`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from Pro Football Reference or Football Outsiders. Provide exact goal line and short yardage efficiency for both teams.'
      });
      
      return {
        category: 'Goal Line Efficiency',
        source: 'Pro-Football-Reference / Football Outsiders via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `How do goal line conversion rates compare between these teams?`,
        note: 'Goal line conversion data provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching GOAL_LINE:`, error.message);
      return { category: 'Goal Line', error: 'Data unavailable' };
    }
  },

  // SOURCE: Pro Football Reference, ESPN
  TWO_MINUTE_DRILL: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching TWO_MINUTE_DRILL for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Two Minute Drill', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:pro-football-reference.com OR site:espn.com
        ${seasonStr} NFL two minute drill efficiency end of half scoring ${home.name} ${away.name}.
        For each team:
        1. Points scored in final 2 minutes of halves
        2. Two minute drill scoring rate
        3. QB performance in hurry-up/no-huddle
        4. Game-winning drives this season`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from Pro Football Reference or ESPN. Provide exact two minute drill efficiency for both teams.'
      });
      
      return {
        category: 'Two Minute Drill',
        source: 'Pro-Football-Reference / ESPN via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `How do these teams perform in end-of-half situations?`,
        note: 'Points scored in final 2 minutes often decide games.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching TWO_MINUTE_DRILL:`, error.message);
      return { category: 'Two Minute Drill', error: 'Data unavailable' };
    }
  },

  // SOURCE: Pro Football Reference, ESPN
  KICKING: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching KICKING for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Kicking', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:pro-football-reference.com OR site:espn.com
        ${seasonStr} NFL kicking stats field goal percentage by distance ${home.name} ${away.name}.
        For each team's kicker:
        1. FG percentage overall
        2. FG percentage 40-49 yards
        3. FG percentage 50+ yards
        4. Punting average and inside 20 %
        5. Kicker name and any recent misses`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from Pro Football Reference or ESPN. Provide exact kicking and punting stats for both teams.'
      });
      
      return {
        category: 'Kicking & Special Teams',
        source: 'Pro-Football-Reference / ESPN via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `How do the kicking stats compare between these teams?`,
        note: 'Kicking stats provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching KICKING:`, error.message);
      return { category: 'Kicking', error: 'Data unavailable' };
    }
  },

  // SOURCE: Football Outsiders (DVOA), Pro Football Reference
  FIELD_POSITION: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching FIELD_POSITION for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Field Position', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:footballoutsiders.com OR site:pro-football-reference.com
        ${seasonStr} NFL average starting field position special teams ${home.name} ${away.name}.
        For each team:
        1. Average starting field position (offense)
        2. Average opponent starting field position (defense)
        3. Kickoff return average and TDs
        4. Punt return average
        5. Special Teams DVOA (if available)`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from Football Outsiders or Pro Football Reference. Provide exact field position and return game data for both teams.'
      });
      
      return {
        category: 'Field Position Battle',
        source: 'Football Outsiders / Pro-Football-Reference via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `How do the average starting field positions compare? Is there a significant gap?`,
        note: 'Investigate: How does each team\'s field position correlate with their scoring opportunities?'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching FIELD_POSITION:`, error.message);
      return { category: 'Field Position', error: 'Data unavailable' };
    }
  },

  // SOURCE: Pro Football Reference, ESPN
  PRIMETIME_RECORD: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching PRIMETIME_RECORD for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Primetime Record', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:pro-football-reference.com OR site:espn.com
        ${seasonStr} NFL primetime record Sunday Night Monday Night Thursday Night ${home.name} ${away.name}.
        For each team:
        1. Record in primetime games this season and last 3 years
        2. QB primetime record and stats
        3. Points per game in primetime vs regular games
        4. Any notable primetime wins/losses`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from Pro Football Reference or ESPN. Provide exact primetime game performance for both teams.'
      });
      
      return {
        category: 'Primetime Performance',
        source: 'Pro-Football-Reference / ESPN via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `What are each team's primetime records and splits?`,
        note: 'Primetime games have different dynamics - more rest, national audience, different prep time.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching PRIMETIME_RECORD:`, error.message);
      return { category: 'Primetime Record', error: 'Data unavailable' };
    }
  },

  // SOURCE: Pro Football Reference, ESPN - 4th Down Decision Analytics
  FOURTH_DOWN_TENDENCY: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching FOURTH_DOWN_TENDENCY for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Fourth Down Tendency', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:nextgenstats.nfl.com OR site:pro-football-reference.com OR site:nfl.com/stats
        ${seasonStr} NFL fourth down decisions go-for-it rate conversion percentage ${home.name} ${away.name}.
        For each team's coach/offense:
        1. 4th down GO rate (how often they go for it vs punt/FG)
        2. 4th down conversion percentage when they go
        3. 4th down attempts inside opponent territory
        4. Aggressiveness rank compared to league average
        5. 4th down behavior when trailing vs leading`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL analyst. Use data from NFL Next Gen Stats, Pro Football Reference, or NFL.com. Provide exact 4th down decision rates and conversion percentages for both teams. Include coaching tendencies on aggressiveness.'
      });
      
      return {
        category: 'Fourth Down Tendency',
        source: 'NFL Next Gen Stats / Pro-Football-Reference via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `How does each team's 4th down approach compare? What does the data show?`,
        CONTEXT_NOTE: `League average GO rate is ~20%. Compare each team's tendencies.`
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching FOURTH_DOWN_TENDENCY:`, error.message);
      return { category: 'Fourth Down Tendency', error: 'Data unavailable' };
    }
  },

  // SOURCE: ESPN, NFL.com - Upcoming Schedule Context for Trap/Sandwich Game Analysis
  SCHEDULE_CONTEXT: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching SCHEDULE_CONTEXT for ${away.name} @ ${home.name}`);
    
    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Schedule Context', note: 'Only available for NFL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `site:espn.com OR site:nfl.com
        ${seasonStr} NFL schedule ${home.name} next 2 games upcoming opponents AND ${away.name} next 2 games upcoming opponents.
        For each team:
        1. What was their LAST game (opponent, result, was it a big game?)
        2. What is their NEXT game after this one (opponent, date, significance)
        3. Is the next game a divisional rivalry or marquee matchup?
        4. Any bye week coming up soon?
        5. Are they playing a much tougher or much weaker opponent next week?`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NFL schedule analyst. Use ESPN or NFL.com schedule data. Identify if either team has a TRAP GAME scenario (big game next week causing potential look-ahead) or SANDWICH SPOT (between two marquee matchups). Be specific about opponent names and dates.'
      });
      
      return {
        category: 'Schedule Context (Trap/Sandwich Analysis)',
        source: 'ESPN / NFL.com via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATION_PROMPTS: {
          trap_game: `Does either team play a bigger game next week?`,
          sandwich_spot: `Is this game between two marquee matchups for either team?`,
          letdown_spot: `Did either team just win a big emotional game last week?`
        },
        CONTEXT_NOTE: `Trap games are NOT automatic fades - investigate if RECENT_FORM shows the team actually plays down in these spots.`,
        AWARENESS: `Schedule context is a SOFT factor. Use it to investigate, not prescribe.`
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching SCHEDULE_CONTEXT:`, error.message);
      return { category: 'Schedule Context', error: 'Data unavailable' };
    }
  },

  DIVISION_RECORD: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching DIVISION_RECORD for ${away.name} @ ${home.name}`);
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const homeSt = standings?.find(s => s.team?.id === home.id);
      const awaySt = standings?.find(s => s.team?.id === away.id);
      
      const sameDivision = homeSt?.team?.division === awaySt?.team?.division;
      
      return {
        category: 'Division Record',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          division: homeSt?.team?.division || 'N/A',
          division_record: homeSt?.division_record || 'N/A',
          conference_record: homeSt?.conference_record || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          division: awaySt?.team?.division || 'N/A',
          division_record: awaySt?.division_record || 'N/A',
          conference_record: awaySt?.conference_record || 'N/A'
        },
        is_division_game: sameDivision,
        INVESTIGATE: sameDivision
          ? `Division game. How have these teams performed against each other?`
          : `Non-division game. How do division records compare?`,
        note: 'Division and overall records provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching DIVISION_RECORD:`, error.message);
      return { category: 'Division Record', error: 'Data unavailable' };
    }
  },
  
  // ===== DERIVED STATS (single-value for clean display) =====
  PASSING_TDS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Passing Touchdowns',
      home: {
        team: home.full_name || home.name,
        passing_tds: fmtNum(homeStats?.passing_touchdowns, 0)
      },
      away: {
        team: away.full_name || away.name,
        passing_tds: fmtNum(awayStats?.passing_touchdowns, 0)
      }
    };
  },
  
  INTERCEPTIONS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Interceptions Thrown',
      home: {
        team: home.full_name || home.name,
        interceptions: fmtNum(homeStats?.passing_interceptions, 0)
      },
      away: {
        team: away.full_name || away.name,
        interceptions: fmtNum(awayStats?.passing_interceptions, 0)
      }
    };
  },
  
  RUSHING_TDS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Rushing Touchdowns',
      home: {
        team: home.full_name || home.name,
        rushing_tds: fmtNum(homeStats?.rushing_touchdowns, 0)
      },
      away: {
        team: away.full_name || away.name,
        rushing_tds: fmtNum(awayStats?.rushing_touchdowns, 0)
      }
    };
  },
  
  TOTAL_TDS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    const homeTotalTds = (homeStats?.passing_touchdowns || 0) + (homeStats?.rushing_touchdowns || 0);
    const awayTotalTds = (awayStats?.passing_touchdowns || 0) + (awayStats?.rushing_touchdowns || 0);
    
    return {
      category: 'Total Touchdowns',
      home: {
        team: home.full_name || home.name,
        total_tds: homeTotalTds.toString()
      },
      away: {
        team: away.full_name || away.name,
        total_tds: awayTotalTds.toString()
      }
    };
  },
  
  PASSING_YPG: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Passing Yards Per Game',
      home: {
        team: home.full_name || home.name,
        passing_ypg: fmtNum(homeStats?.passing_yards_per_game)
      },
      away: {
        team: away.full_name || away.name,
        passing_ypg: fmtNum(awayStats?.passing_yards_per_game)
      }
    };
  },

  // ===== SITUATIONAL =====
  REST_SITUATION: async (bdlSport, home, away, season, gameId, gameDate) => {
    // Fetch recent games for both teams to calculate rest situation
    console.log(`[Stat Router] Fetching REST_SITUATION for ${away.name} @ ${home.name}`);
    
    try {
      // Determine date range - look back 7 days from game date for current rest
      const targetDate = gameDate ? new Date(gameDate) : new Date();
      const endDateStr = targetDate.toISOString().split('T')[0];
      const startDate = new Date(targetDate);
      startDate.setDate(startDate.getDate() - 10); // Look back 10 days
      const startDateStr = startDate.toISOString().split('T')[0];
      
      // For B2B history, look back at entire season
      const seasonStart = new Date(season - 1, 9, 1); // Oct 1
      const seasonStartStr = seasonStart.toISOString().split('T')[0];
      
      // Fetch recent games AND season games for B2B history
      const [homeRecentGames, awayRecentGames, homeSeasonGames, awaySeasonGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [home.id], 
          start_date: startDateStr,
          end_date: endDateStr,
          per_page: 10 
        }),
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [away.id], 
          start_date: startDateStr,
          end_date: endDateStr,
          per_page: 10 
        }),
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [home.id], 
          start_date: seasonStartStr,
          end_date: endDateStr,
          per_page: 60 
        }),
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [away.id], 
          start_date: seasonStartStr,
          end_date: endDateStr,
          per_page: 60 
        })
      ]);
      
      // Use recent games for current rest calculation
      const homeGames = homeRecentGames;
      const awayGames = awayRecentGames;
      
      // Calculate rest for each team
      const calculateRest = (games, teamId, targetDateObj) => {
        const targetDateStr = targetDateObj.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        
        // Helper to get game date (handles both NBA's "date" and NHL's "game_date")
        const getGameDateStr = (g) => (g.game_date || g.date || '').split('T')[0];
        
        // Filter to completed games before today
        const completedGames = (games || [])
          .filter(g => {
            const gameStr = getGameDateStr(g);
            // NHL uses home_score/away_score, NBA/NFL use home_team_score/visitor_team_score
            const hasScore = (g.home_team_score || g.home_score || 0) > 0 || (g.visitor_team_score || g.away_score || 0) > 0;
            return gameStr < targetDateStr || (gameStr === targetDateStr && hasScore);
          })
          .sort((a, b) => new Date(getGameDateStr(b)) - new Date(getGameDateStr(a))); // Most recent first
        
        if (completedGames.length === 0) {
          return { daysRest: null, isBackToBack: false, lastGameDate: null, gamesInLast4Days: 0 };
        }
        
        const lastGame = completedGames[0];
        const lastGameDateStr = getGameDateStr(lastGame);
        const lastGameDate = new Date(lastGameDateStr + 'T12:00:00');
        const targetMidnight = new Date(targetDateStr + 'T12:00:00');
        
        const diffDays = Math.round((targetMidnight - lastGameDate) / (1000 * 60 * 60 * 24));
        const isBackToBack = diffDays <= 1;
        
        // Count games in last 4 days
        const fourDaysAgo = new Date(targetMidnight);
        fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
        const gamesInLast4Days = completedGames.filter(g => {
          const gDate = new Date(getGameDateStr(g) + 'T12:00:00');
          return gDate >= fourDaysAgo;
        }).length;
        
        return {
          daysRest: diffDays,
          isBackToBack,
          isHeavySchedule: gamesInLast4Days >= 3,
          gamesInLast4Days,
          lastGameDate: lastGameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        };
      };
      
      const homeRest = calculateRest(homeGames, home.id, targetDate);
      const awayRest = calculateRest(awayGames, away.id, targetDate);
      
      // Determine rest advantage
      let restAdvantage = 'EVEN';
      if (homeRest.daysRest !== null && awayRest.daysRest !== null) {
        if (homeRest.daysRest > awayRest.daysRest + 1) restAdvantage = 'HOME';
        else if (awayRest.daysRest > homeRest.daysRest + 1) restAdvantage = 'AWAY';
      }
      
      // Format status strings
      const formatStatus = (rest) => {
        if (rest.daysRest === null) return 'No recent games found';
        if (rest.isBackToBack) return `BACK-TO-BACK (played ${rest.lastGameDate})`;
        if (rest.isHeavySchedule) return `Heavy schedule (${rest.gamesInLast4Days} games in 4 days)`;
        if (rest.daysRest >= 3) return `Well-rested (${rest.daysRest} days)`;
        return `${rest.daysRest} day(s) rest`;
      };
      
      // Calculate B2B HISTORICAL performance for each team
      const calcB2BHistory = (seasonGames, teamId) => {
        const getGameDateStr = (g) => (g.game_date || g.date || '').split('T')[0];
        
        // Sort games by date
        const completed = (seasonGames || [])
          .filter(g => {
            const homeScore = g.home_team_score || g.home_score || 0;
            const awayScore = g.visitor_team_score || g.away_score || 0;
            return homeScore > 0 || awayScore > 0;
          })
          .sort((a, b) => new Date(getGameDateStr(a)) - new Date(getGameDateStr(b)));
        
        if (completed.length < 5) return null;
        
        let b2bWins = 0, b2bLosses = 0;
        const b2bGames = [];
        
        // Find B2B games (played day after previous game)
        for (let i = 1; i < completed.length; i++) {
          const prevDate = new Date(getGameDateStr(completed[i-1]));
          const currDate = new Date(getGameDateStr(completed[i]));
          const daysDiff = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));
          
          if (daysDiff === 1) {
            // This is a B2B game
            const game = completed[i];
            const isHome = (game.home_team?.id || game.home_team_id) === teamId;
            const teamScore = isHome 
              ? (game.home_team_score || game.home_score || 0)
              : (game.visitor_team_score || game.away_score || 0);
            const oppScore = isHome 
              ? (game.visitor_team_score || game.away_score || 0)
              : (game.home_team_score || game.home_score || 0);
            
            const won = teamScore > oppScore;
            if (won) b2bWins++;
            else b2bLosses++;
            
            b2bGames.push({
              date: getGameDateStr(game),
              result: won ? 'W' : 'L',
              margin: Math.abs(teamScore - oppScore)
            });
          }
        }
        
        const totalB2B = b2bWins + b2bLosses;
        if (totalB2B === 0) return { record: 'No B2Bs yet', win_pct: null, games: 0 };
        
        const winPct = b2bWins / totalB2B;
        const rating = winPct >= 0.500 ? 'HANDLES B2B WELL' :
                       winPct >= 0.350 ? 'AVERAGE on B2B' : 'STRUGGLES on B2B';
        
        // Get last 3 B2B results
        const recentB2B = b2bGames.slice(-3).reverse().map(g => g.result).join('-');
        
        return {
          record: `${b2bWins}-${b2bLosses}`,
          win_pct: `${(winPct * 100).toFixed(0)}%`,
          games: totalB2B,
          rating,
          recent_b2b: recentB2B || 'N/A',
          avg_margin: b2bGames.length > 0 
            ? (b2bGames.reduce((s, g) => s + g.margin, 0) / b2bGames.length).toFixed(1)
            : 'N/A'
        };
      };
      
      const homeB2BHistory = calcB2BHistory(homeSeasonGames, home.id);
      const awayB2BHistory = calcB2BHistory(awaySeasonGames, away.id);
      
      return {
        category: 'Rest & Schedule Situation',
        source: 'Ball Don\'t Lie API (calculated)',
        home: {
          team: home.full_name || home.name,
          days_rest: homeRest.daysRest,
          status: formatStatus(homeRest),
          is_back_to_back: homeRest.isBackToBack,
          is_heavy_schedule: homeRest.isHeavySchedule || false,
          last_game: homeRest.lastGameDate,
          b2b_history: homeB2BHistory
        },
        away: {
          team: away.full_name || away.name,
          days_rest: awayRest.daysRest,
          status: formatStatus(awayRest),
          is_back_to_back: awayRest.isBackToBack,
          is_heavy_schedule: awayRest.isHeavySchedule || false,
          last_game: awayRest.lastGameDate,
          b2b_history: awayB2BHistory
        },
        rest_advantage: restAdvantage,
        INVESTIGATE: homeRest.isBackToBack || awayRest.isBackToBack
          ? `How has this team historically performed on back-to-backs? Check b2b_history.`
          : null,
        note: 'Back-to-backs and heavy schedules can impact performance. League average B2B win rate is ~40%.'
      };
      
    } catch (error) {
      console.error(`[Stat Router] Error fetching REST_SITUATION:`, error.message);
      return {
        category: 'Rest & Schedule Situation',
        error: 'Unable to calculate rest data',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  // ===== CATCH-ALL for unimplemented tokens =====
  DEFAULT: async (bdlSport, home, away) => {
    return {
      error: 'Stat not yet implemented',
      home: { team: home.full_name || home.name },
      away: { team: away.full_name || away.name }
    };
  },

  // ===== NHL SPECIFIC FETCHERS (BETA) =====
  
  POWER_PLAY_PCT: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Power Play Percentage',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        power_play_pct: homeRates?.ppPct ? fmtPct(homeRates.ppPct) : 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        power_play_pct: awayRates?.ppPct ? fmtPct(awayRates.ppPct) : 'N/A'
      },
      note: 'League average PP% is ~20%.'
    };
  },
  
  PENALTY_KILL_PCT: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Penalty Kill Percentage',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        penalty_kill_pct: homeRates?.pkPct ? fmtPct(homeRates.pkPct) : 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        penalty_kill_pct: awayRates?.pkPct ? fmtPct(awayRates.pkPct) : 'N/A'
      },
      note: 'League average PK% is ~80%.'
    };
  },
  
  SPECIAL_TEAMS: async (bdlSport, home, away, season) => {
    // NFL branch: BDL NFL doesn't expose kicking/punting stats, return data_scope note
    if (bdlSport === 'americanfootball_nfl' || bdlSport === 'americanfootball_ncaaf') {
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
        ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
      ]);
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;

      return {
        category: 'Special Teams (Football)',
        data_scope: 'BDL does not expose kicking/punting/return stats for NFL/NCAAF — use Gemini Grounding for special teams data',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          note: 'Kicking/punting data unavailable from BDL'
        },
        away: {
          team: away.full_name || away.name,
          note: 'Kicking/punting data unavailable from BDL'
        }
      };
    }

    // NHL branch: use deriveNhlTeamRates for PP% and PK%
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);

    return {
      category: 'Special Teams (PP% + PK%)',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        power_play_pct: homeRates?.ppPct ? fmtPct(homeRates.ppPct) : 'N/A',
        penalty_kill_pct: homeRates?.pkPct ? fmtPct(homeRates.pkPct) : 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        power_play_pct: awayRates?.ppPct ? fmtPct(awayRates.ppPct) : 'N/A',
        penalty_kill_pct: awayRates?.pkPct ? fmtPct(awayRates.pkPct) : 'N/A'
      },
      interpretation: `Compare ${home.name} PP% vs ${away.name} PK% and vice versa for scoring edges`
    };
  },
  
  GOALS_FOR: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Goals For Per Game',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        goals_for_per_game: fmtNum(homeRates?.goalsForPerGame)
      },
      away: {
        team: away.full_name || away.name,
        goals_for_per_game: fmtNum(awayRates?.goalsForPerGame)
      }
    };
  },
  
  GOALS_AGAINST: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Goals Against Per Game',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        goals_against_per_game: fmtNum(homeRates?.goalsAgainstPerGame)
      },
      away: {
        team: away.full_name || away.name,
        goals_against_per_game: fmtNum(awayRates?.goalsAgainstPerGame)
      },
      note: 'Lower is better for defense'
    };
  },
  
  SHOTS_FOR: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Shots For Per Game (Possession Proxy)',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        shots_for_per_game: fmtNum(homeRates?.shotsForPerGame)
      },
      away: {
        team: away.full_name || away.name,
        shots_for_per_game: fmtNum(awayRates?.shotsForPerGame)
      },
      note: 'Shot volume data provided for comparison.'
    };
  },
  
  SHOTS_AGAINST: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Shots Against Per Game',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        shots_against_per_game: fmtNum(homeRates?.shotsAgainstPerGame)
      },
      away: {
        team: away.full_name || away.name,
        shots_against_per_game: fmtNum(awayRates?.shotsAgainstPerGame)
      },
      note: 'Goals against average provided for comparison.'
    };
  },
  
  SHOT_DIFFERENTIAL: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    const homeDiff = (homeRates?.shotsForPerGame || 0) - (homeRates?.shotsAgainstPerGame || 0);
    const awayDiff = (awayRates?.shotsForPerGame || 0) - (awayRates?.shotsAgainstPerGame || 0);
    
    return {
      category: 'Shot Differential (Corsi Proxy)',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        shots_for: fmtNum(homeRates?.shotsForPerGame),
        shots_against: fmtNum(homeRates?.shotsAgainstPerGame),
        differential: fmtNum(homeDiff, 1)
      },
      away: {
        team: away.full_name || away.name,
        shots_for: fmtNum(awayRates?.shotsForPerGame),
        shots_against: fmtNum(awayRates?.shotsAgainstPerGame),
        differential: fmtNum(awayDiff, 1)
      },
      interpretation: homeDiff > awayDiff 
        ? `${home.name} controls possession better (+${fmtNum(homeDiff - awayDiff, 1)} shots/game)`
        : `${away.name} controls possession better (+${fmtNum(awayDiff - homeDiff, 1)} shots/game)`
    };
  },
  
  FACEOFF_PCT: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Faceoff Win Percentage',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        faceoff_pct: homeRates?.faceoffWinPct ? fmtPct(homeRates.faceoffWinPct) : 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        faceoff_pct: awayRates?.faceoffWinPct ? fmtPct(awayRates.faceoffWinPct) : 'N/A'
      },
      note: 'Faceoff wins correlate with puck possession and zone time'
    };
  },
  
  GOALIE_STATS: async (bdlSport, home, away, season) => {
    // For NHL, try to get goalie stats from player leaders
    try {
      const leaders = await ballDontLieService.getLeadersGeneric(bdlSport, { season, type: 'save_pct' });
      
      // Find goalies for each team
      const homeGoalies = (leaders || []).filter(l => 
        l.player?.team?.id === home.id || l.team?.id === home.id
      );
      const awayGoalies = (leaders || []).filter(l => 
        l.player?.team?.id === away.id || l.team?.id === away.id
      );
      
      return {
        category: 'Goaltending Stats',
        data_scope: 'Save percentage only (GAA not available from BDL player leaders endpoint)',
        source: 'Ball Don\'t Lie API (Player Leaders)',
        home: {
          team: home.full_name || home.name,
          goalies: homeGoalies.length > 0
            ? homeGoalies.slice(0, 2).map(g => ({
                name: g.player?.full_name || `${g.player?.first_name} ${g.player?.last_name}`,
                save_pct: g.value ? fmtPct(g.value) : 'N/A'
              }))
            : [{ note: 'Goalie data unavailable - check scout report' }]
        },
        away: {
          team: away.full_name || away.name,
          goalies: awayGoalies.length > 0
            ? awayGoalies.slice(0, 2).map(g => ({
                name: g.player?.full_name || `${g.player?.first_name} ${g.player?.last_name}`,
                save_pct: g.value ? fmtPct(g.value) : 'N/A'
              }))
            : [{ note: 'Goalie data unavailable - check scout report' }]
        },
        note: 'Compare both goalies\' SV% — league avg is ~.910. Is there a significant gap between the starters?'
      };
    } catch (e) {
      return {
        category: 'Goaltending Stats',
        error: 'Goalie data unavailable',
        home: { team: home.full_name || home.name, note: 'Check scout report for goalie info' },
        away: { team: away.full_name || away.name, note: 'Check scout report for goalie info' }
      };
    }
  },
  
  GOAL_DIFFERENTIAL: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    const homeDiff = (homeRates?.goalsForPerGame || 0) - (homeRates?.goalsAgainstPerGame || 0);
    const awayDiff = (awayRates?.goalsForPerGame || 0) - (awayRates?.goalsAgainstPerGame || 0);
    
    return {
      category: 'Goal Differential',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        goals_for: fmtNum(homeRates?.goalsForPerGame),
        goals_against: fmtNum(homeRates?.goalsAgainstPerGame),
        differential: fmtNum(homeDiff, 2)
      },
      away: {
        team: away.full_name || away.name,
        goals_for: fmtNum(awayRates?.goalsForPerGame),
        goals_against: fmtNum(awayRates?.goalsAgainstPerGame),
        differential: fmtNum(awayDiff, 2)
      },
      interpretation: homeDiff > awayDiff 
        ? `${home.name} has stronger goal differential (+${fmtNum(homeDiff - awayDiff, 2)}/game)`
        : `${away.name} has stronger goal differential (+${fmtNum(awayDiff - homeDiff, 2)}/game)`
    };
  },

  // ===== NHL ENHANCED FETCHERS =====
  
  // NHL Standings with home/road records, streak, and playoff position
  NHL_STANDINGS: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'icehockey_nhl') return null;
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const findTeam = (teamId) => standings.find(s => s.team?.id === teamId);
      const homeStanding = findTeam(home.id);
      const awayStanding = findTeam(away.id);
      
      const formatStanding = (standing, team) => {
        if (!standing) return { team: team.full_name || team.name, error: 'Standings data unavailable' };
        return {
          team: team.full_name || team.name,
          record: `${standing.wins}-${standing.losses}-${standing.ot_losses || 0}`,
          points: standing.points || 0,
          points_pct: standing.points_pctg ? fmtPct(standing.points_pctg) : 'N/A',
          home_record: standing.home_record || 'N/A',
          road_record: standing.road_record || 'N/A',
          streak: standing.streak || 'N/A',
          goal_differential: standing.goal_differential || 0,
          division: standing.division_name || 'N/A',
          conference: standing.conference_name || 'N/A'
        };
      };
      
      return {
        category: 'NHL Standings & Records',
        source: 'Ball Don\'t Lie API',
        home: formatStanding(homeStanding, home),
        away: formatStanding(awayStanding, away),
        note: 'Home/road records and streaks are critical for NHL betting'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_STANDINGS:`, error.message);
      return { category: 'NHL Standings', error: 'Data unavailable' };
    }
  },
  
  // NHL Home/Away Splits from standings
  NHL_HOME_AWAY_SPLITS: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'icehockey_nhl') return null;
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const findTeam = (teamId) => standings.find(s => s.team?.id === teamId);
      const homeStanding = findTeam(home.id);
      const awayStanding = findTeam(away.id);
      
      // Parse record strings like "27-13-1"
      const parseRecord = (recordStr) => {
        if (!recordStr || recordStr === 'N/A') return { wins: 0, losses: 0, otl: 0 };
        const parts = recordStr.split('-').map(n => parseInt(n) || 0);
        return { wins: parts[0] || 0, losses: parts[1] || 0, otl: parts[2] || 0 };
      };
      
      const homeTeamHome = parseRecord(homeStanding?.home_record);
      const homeTeamRoad = parseRecord(homeStanding?.road_record);
      const awayTeamHome = parseRecord(awayStanding?.home_record);
      const awayTeamRoad = parseRecord(awayStanding?.road_record);
      
      // Key insight: home team's HOME record vs away team's ROAD record
      const homeAdvantage = homeTeamHome.wins - homeTeamHome.losses;
      const awayRoadStruggle = awayTeamRoad.wins - awayTeamRoad.losses;
      
      let interpretation = '';
      if (homeAdvantage > 5 && awayRoadStruggle < 0) {
        interpretation = `STRONG HOME EDGE: ${home.name} is ${homeStanding?.home_record} at home vs ${away.name}'s ${awayStanding?.road_record} on road`;
      } else if (awayRoadStruggle > 5) {
        interpretation = `ROAD WARRIOR: ${away.name} is ${awayStanding?.road_record} on the road - home ice less impactful`;
      } else {
        interpretation = `Standard splits - evaluate other factors`;
      }
      
      return {
        category: 'Home/Away Splits',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          home_record: homeStanding?.home_record || 'N/A',
          road_record: homeStanding?.road_record || 'N/A',
          note: 'Playing at HOME tonight'
        },
        away: {
          team: away.full_name || away.name,
          home_record: awayStanding?.home_record || 'N/A',
          road_record: awayStanding?.road_record || 'N/A',
          note: 'Playing on ROAD tonight'
        },
        interpretation,
        note: 'NHL home teams have last change advantage - investigate how each team performs home vs road'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_HOME_AWAY_SPLITS:`, error.message);
      return { category: 'Home/Away Splits', error: 'Data unavailable' };
    }
  },
  
  // NHL Recent Form with L5/L10 analysis including opponent quality
  NHL_RECENT_FORM: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'icehockey_nhl') return null;
    
    try {
      // Get last 45 days of games for both teams
      const today = new Date();
      const dates = [];
      for (let i = 0; i < 45; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
      }
      
      // Get standings for opponent quality context
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      const standingsMap = {};
      (standings || []).forEach(s => {
        if (s.team?.id) standingsMap[s.team.id] = s;
      });
      
      // Fetch games for both teams
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 100 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 100 })
      ]);
      
      const analyzeRecentForm = (games, teamId, teamName) => {
        if (!games || games.length === 0) return { team: teamName, error: 'No recent games found' };
        
        // Sort by date descending and filter completed games
        const completedGames = games
          .filter(g => g.game_state === 'OFF' || g.game_state === 'FINAL' || g.status === 'Final')
          .sort((a, b) => new Date(b.game_date || b.date) - new Date(a.game_date || a.date));
        
        const l5Games = completedGames.slice(0, 5);
        const l10Games = completedGames.slice(0, 10);
        
        const analyzeGames = (gameList) => {
          let wins = 0, losses = 0, otLosses = 0;
          let goalsFor = 0, goalsAgainst = 0;
          const gameDetails = [];
          
          gameList.forEach(g => {
            const isHome = g.home_team?.id === teamId;
            const teamScore = isHome ? g.home_score : g.away_score;
            const oppScore = isHome ? g.away_score : g.home_score;
            const oppTeam = isHome ? g.away_team : g.home_team;
            const oppStanding = standingsMap[oppTeam?.id];
            
            goalsFor += teamScore || 0;
            goalsAgainst += oppScore || 0;
            
            const margin = (teamScore || 0) - (oppScore || 0);
            let result = 'W';
            if (margin > 0) wins++;
            else if (margin < 0) {
              // Check if OT loss (need to infer from game data)
              losses++;
              result = 'L';
            }
            
            gameDetails.push({
              opponent: oppTeam?.full_name || oppTeam?.name || 'Unknown',
              result: `${result} ${teamScore}-${oppScore}`,
              margin,
              opponent_record: oppStanding ? `${oppStanding.wins}-${oppStanding.losses}-${oppStanding.ot_losses || 0}` : 'N/A',
              opponent_points: oppStanding?.points || 'N/A',
              home_away: isHome ? 'H' : 'A'
            });
          });
          
          const record = `${wins}-${losses}${otLosses > 0 ? `-${otLosses}` : ''}`;
          const avgGF = gameList.length > 0 ? (goalsFor / gameList.length).toFixed(1) : '0';
          const avgGA = gameList.length > 0 ? (goalsAgainst / gameList.length).toFixed(1) : '0';
          
          // Calculate opponent quality
          const avgOppPoints = gameDetails.reduce((sum, g) => sum + (g.opponent_points || 0), 0) / gameDetails.length;
          let scheduleStrength = 'AVERAGE';
          if (avgOppPoints > 90) scheduleStrength = 'TOUGH';
          else if (avgOppPoints < 70) scheduleStrength = 'SOFT';
          
          return { record, wins, losses, avgGF, avgGA, scheduleStrength, games: gameDetails };
        };
        
        const l5Analysis = analyzeGames(l5Games);
        const l10Analysis = analyzeGames(l10Games);
        
        // Trend analysis
        let trend = 'STABLE';
        if (l5Analysis.wins >= 4) trend = 'HOT';
        else if (l5Analysis.losses >= 4) trend = 'COLD';
        else if (l5Analysis.wins > l10Analysis.wins / 2) trend = 'IMPROVING';
        else if (l5Analysis.losses > l10Analysis.losses / 2) trend = 'DECLINING';
        
        return {
          team: teamName,
          l5: {
            record: l5Analysis.record,
            avg_goals_for: l5Analysis.avgGF,
            avg_goals_against: l5Analysis.avgGA,
            schedule_strength: l5Analysis.scheduleStrength,
            recent_games: l5Analysis.games.slice(0, 5)
          },
          l10: {
            record: l10Analysis.record,
            avg_goals_for: l10Analysis.avgGF,
            avg_goals_against: l10Analysis.avgGA,
            schedule_strength: l10Analysis.scheduleStrength
          },
          trend
        };
      };
      
      const homeForm = analyzeRecentForm(homeGames, home.id, home.full_name || home.name);
      const awayForm = analyzeRecentForm(awayGames, away.id, away.full_name || away.name);
      
      return {
        category: 'Recent Form (L5 & L10)',
        source: 'Ball Don\'t Lie API',
        home: homeForm,
        away: awayForm,
        interpretation: `${home.name}: ${homeForm.trend} (L5: ${homeForm.l5?.record || 'N/A'}) | ${away.name}: ${awayForm.trend} (L5: ${awayForm.l5?.record || 'N/A'})`,
        note: 'L5 trends with opponent quality context - investigate WHY not just WHAT'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_RECENT_FORM:`, error.message);
      return { category: 'Recent Form', error: 'Data unavailable' };
    }
  },
  
  // NHL Hot Players using box scores
  NHL_HOT_PLAYERS: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'icehockey_nhl') return null;
    
    try {
      // Get last 14 days of box scores
      const today = new Date();
      const dates = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
      }
      
      // Fetch box scores for both teams
      const boxScores = await ballDontLieService.getNhlRecentBoxScores(dates, {
        team_ids: [home.id, away.id]
      });
      
      if (!boxScores || boxScores.length === 0) {
        return { category: 'Hot Players', error: 'No recent box score data available' };
      }
      
      // Aggregate player stats
      const playerStats = {};
      boxScores.forEach(bs => {
        const playerId = bs.player?.id;
        const teamId = bs.team?.id;
        if (!playerId) return;
        
        if (!playerStats[playerId]) {
          playerStats[playerId] = {
            name: bs.player?.full_name || `${bs.player?.first_name} ${bs.player?.last_name}`,
            position: bs.position || bs.player?.position_code,
            teamId,
            games: 0,
            goals: 0,
            assists: 0,
            points: 0,
            shots: 0,
            plusMinus: 0
          };
        }
        
        playerStats[playerId].games++;
        playerStats[playerId].goals += bs.goals || 0;
        playerStats[playerId].assists += bs.assists || 0;
        playerStats[playerId].points += bs.points || 0;
        playerStats[playerId].shots += bs.shots_on_goal || 0;
        playerStats[playerId].plusMinus += bs.plus_minus || 0;
      });
      
      // Convert to array and calculate PPG
      const players = Object.values(playerStats).map(p => ({
        ...p,
        ppg: p.games > 0 ? (p.points / p.games).toFixed(2) : '0.00'
      }));
      
      // Filter by team and sort by points
      const homeHotPlayers = players
        .filter(p => p.teamId === home.id && p.games >= 3 && p.position !== 'G')
        .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
        .slice(0, 5);
      
      const awayHotPlayers = players
        .filter(p => p.teamId === away.id && p.games >= 3 && p.position !== 'G')
        .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
        .slice(0, 5);
      
      const formatPlayer = (p) => ({
        name: p.name,
        position: p.position,
        games: p.games,
        goals: p.goals,
        assists: p.assists,
        points: p.points,
        ppg: p.ppg,
        plus_minus: p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus.toString()
      });
      
      return {
        category: 'Hot Players (Last 14 Days)',
        source: 'Ball Don\'t Lie API (Box Scores)',
        home: {
          team: home.full_name || home.name,
          hot_players: homeHotPlayers.map(formatPlayer),
          note: homeHotPlayers.length > 0 && parseFloat(homeHotPlayers[0].ppg) >= 1.0
            ? `${homeHotPlayers[0].name} is HOT (${homeHotPlayers[0].ppg} PPG)`
            : 'No standout hot players'
        },
        away: {
          team: away.full_name || away.name,
          hot_players: awayHotPlayers.map(formatPlayer),
          note: awayHotPlayers.length > 0 && parseFloat(awayHotPlayers[0].ppg) >= 1.0
            ? `${awayHotPlayers[0].name} is HOT (${awayHotPlayers[0].ppg} PPG)`
            : 'No standout hot players'
        },
        note: 'Players with 1.0+ PPG over last 14 days are considered "hot"'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_HOT_PLAYERS:`, error.message);
      return { category: 'Hot Players', error: 'Data unavailable' };
    }
  },
  
  // NHL Head-to-Head History
  NHL_H2H_HISTORY: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'icehockey_nhl') return null;
    
    try {
      // Get games between these two teams (current + last season)
      const seasons = [season, season - 1];
      const games = await ballDontLieService.getGames(bdlSport, {
        team_ids: [home.id],
        seasons,
        per_page: 100
      });
      
      // Filter to only games between these two teams
      const h2hGames = (games || [])
        .filter(g => {
          const isH2H = (g.home_team?.id === home.id && g.away_team?.id === away.id) ||
                        (g.home_team?.id === away.id && g.away_team?.id === home.id);
          const isComplete = g.game_state === 'OFF' || g.game_state === 'FINAL' || g.status === 'Final';
          return isH2H && isComplete;
        })
        .sort((a, b) => new Date(b.game_date || b.date) - new Date(a.game_date || a.date))
        .slice(0, 5);
      
      if (h2hGames.length === 0) {
        return {
          category: 'Head-to-Head History',
          h2h_available: false,
          home: { team: home.full_name || home.name },
          away: { team: away.full_name || away.name },
          note: `NO H2H DATA: ${home.full_name || home.name} and ${away.full_name || away.name} have no recent H2H games in our data.`,
          ANTI_HALLUCINATION: 'CRITICAL: You have ZERO H2H data. DO NOT claim historical records, winning streaks, or dominance narratives.'
        };
      }
      
      let homeWins = 0, awayWins = 0;
      const meetings = h2hGames.map(g => {
        const homeInGame = g.home_team?.id === home.id;
        const homeScore = homeInGame ? g.home_score : g.away_score;
        const awayScore = homeInGame ? g.away_score : g.home_score;
        
        if (homeScore > awayScore) homeWins++;
        else awayWins++;
        
        return {
          date: g.game_date || g.date,
          venue: homeInGame ? 'Home' : 'Away',
          score: `${home.name} ${homeScore} - ${awayScore} ${away.name}`,
          winner: homeScore > awayScore ? home.name : away.name,
          margin: Math.abs(homeScore - awayScore)
        };
      });
      
      // Calculate average margin
      const avgMargin = meetings.reduce((sum, m) => sum + m.margin, 0) / meetings.length;
      
      // ===== NHL SWEEP CONTEXT DETECTION =====
      // Detect when one team is sweeping an elite opponent (3-0 or better)
      // Uses points percentage instead of win% (NHL has OT losses worth 1 point)
      let sweepContext = null;
      const gamesPlayed = meetings.length;
      const isCompleteSweep = (homeWins === gamesPlayed && gamesPlayed >= 3) || 
                              (awayWins === gamesPlayed && gamesPlayed >= 3);
      
      if (isCompleteSweep) {
        try {
          // Determine dominant and swept teams
          const dominantTeam = homeWins === gamesPlayed ? home : away;
          const dominantTeamName = homeWins === gamesPlayed ? home.full_name || home.name : away.full_name || away.name;
          const sweptTeam = homeWins === gamesPlayed ? away : home;
          const sweptTeamName = homeWins === gamesPlayed ? away.full_name || away.name : home.full_name || home.name;
          
          // Fetch NHL standings to get points percentage
          const standings = await ballDontLieService.getNhlStandings(season);
          
          const sweptTeamStanding = standings?.find(s => s.team?.id === sweptTeam.id);
          const dominantTeamStanding = standings?.find(s => s.team?.id === dominantTeam.id);
          
          if (sweptTeamStanding) {
            // NHL uses points percentage: points / (games * 2) * 100
            // Some APIs provide points directly, others provide wins/losses/ot_losses
            const sweptPoints = sweptTeamStanding.points || 
              ((sweptTeamStanding.wins || 0) * 2 + (sweptTeamStanding.ot_losses || 0));
            const sweptGamesPlayed = sweptTeamStanding.games_played || 
              ((sweptTeamStanding.wins || 0) + (sweptTeamStanding.losses || 0) + (sweptTeamStanding.ot_losses || 0));
            
            if (sweptGamesPlayed > 0) {
              const sweptPointsPct = (sweptPoints / (sweptGamesPlayed * 2)) * 100;
              const sweptRecord = `${sweptTeamStanding.wins || 0}-${sweptTeamStanding.losses || 0}-${sweptTeamStanding.ot_losses || 0}`;
              
              // Check if division rivals
              const sweptDivision = sweptTeamStanding?.division_name || sweptTeamStanding?.team?.division;
              const dominantDivision = dominantTeamStanding?.division_name || dominantTeamStanding?.team?.division;
              const isDivisionRival = sweptDivision && dominantDivision && sweptDivision === dominantDivision;
              
              // NHL Sweep Context thresholds:
              // - 65%+ points pct: STRONG trap alert
              // - 58-65% (or 58%+ for division rivals): CAUTION flag
              const strongThreshold = 65;
              const cautionThreshold = isDivisionRival ? 58 : 65;
              
              // Margin context for NHL (goals, not points)
              const marginNote = avgMargin >= 3 
                ? `Dominant margins (avg +${avgMargin.toFixed(1)} goals) — but goaltending variance and line adjustments typically intervene.`
                : avgMargin >= 1.5
                ? `Solid margins (avg +${avgMargin.toFixed(1)} goals) — real edge, but NHL games are tight.`
                : `Close games (avg +${avgMargin.toFixed(1)} goals) — series has been competitive.`;
              
              let alertLevel = null;
              let sweepNote = null;
              
              if (sweptPointsPct >= strongThreshold) {
                alertLevel = 'STRONG';
                sweepNote = `NHL SWEEP CONTEXT: ${sweptTeamName} is ${sweptRecord} (${sweptPointsPct.toFixed(1)}% points)${isDivisionRival ? ' and a division rival' : ''} but 0-${gamesPlayed} vs ${dominantTeamName}. Sweeping an elite NHL team is historically rare — goaltending variance and coaching line adjustments typically intervene. ${marginNote} Ask yourself: "Am I betting that an elite team will get swept ${gamesPlayed + 1}-0?"`;
              } else if (sweptPointsPct >= cautionThreshold) {
                alertLevel = 'CAUTION';
                sweepNote = `NHL SWEEP CONTEXT: ${sweptTeamName} is ${sweptRecord} (${sweptPointsPct.toFixed(1)}% points)${isDivisionRival ? ' — a division rival' : ''} and 0-${gamesPlayed} vs ${dominantTeamName}. Playoff-caliber teams rarely get swept. ${marginNote}`;
              }
              
              if (alertLevel) {
                sweepContext = {
                  triggered: true,
                  alert_level: alertLevel,
                  sport: 'NHL',
                  games_in_sweep: gamesPlayed,
                  dominant_team: dominantTeamName,
                  swept_team: sweptTeamName,
                  swept_team_record: sweptRecord,
                  swept_team_points_pct: `${sweptPointsPct.toFixed(1)}%`,
                  is_division_rival: isDivisionRival,
                  division: isDivisionRival ? sweptDivision : null,
                  avg_margin: avgMargin.toFixed(1),
                  margin_context: marginNote,
                  sweep_note: sweepNote
                };
                console.log(`[Stat Router] NHL SWEEP CONTEXT (${alertLevel}): ${dominantTeamName} is ${gamesPlayed}-0 vs ${sweptTeamName} (${sweptPointsPct.toFixed(1)}% points${isDivisionRival ? ', division rival' : ''})`);
              }
            }
          }
        } catch (sweepErr) {
          console.log(`[Stat Router] NHL sweep context check failed (non-fatal): ${sweepErr.message}`);
        }
      }
      
      return {
        category: 'Head-to-Head History',
        source: 'Ball Don\'t Lie API',
        h2h_available: true,
        games_found: meetings.length,
        home: {
          team: home.full_name || home.name,
          h2h_record: `${homeWins}-${awayWins}`,
          h2h_wins: homeWins
        },
        away: {
          team: away.full_name || away.name,
          h2h_record: `${awayWins}-${homeWins}`,
          h2h_wins: awayWins
        },
        recent_meetings: meetings,
        avg_margin: avgMargin.toFixed(1),
        sweep_context: sweepContext,
        interpretation: homeWins > awayWins
          ? `${home.name} has won ${homeWins} of last ${meetings.length} meetings`
          : awayWins > homeWins 
            ? `${away.name} has won ${awayWins} of last ${meetings.length} meetings`
            : `Series is even at ${homeWins}-${awayWins}`,
        note: 'H2H meetings provided for comparison.',
        ANTI_HALLUCINATION: `DATA BOUNDARY: You have ONLY ${meetings.length} verified H2H game(s). You may cite these specific games. DO NOT claim historical streaks or multi-year records beyond this data.`
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_H2H_HISTORY:`, error.message);
      return { 
        category: 'Head-to-Head History', 
        h2h_available: false,
        error: 'Data unavailable',
        ANTI_HALLUCINATION: 'CRITICAL: H2H fetch FAILED. DO NOT mention H2H in your analysis.'
      };
    }
  },

  // ===== NHL ADVANCED STATS (REAL DATA - via Gemini Grounding) =====

  // CORSI FOR PERCENTAGE (Real Possession Metric)
  // SOURCE: Natural Stat Trick (naturalstattrick.com) - the gold standard for NHL advanced stats
  CORSI_FOR_PCT: async (bdlSport, home, away, season) => {
    // Use full_name with fallback to name to prevent "undefined @ undefined" logs
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching CORSI_FOR_PCT for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Corsi For %', note: 'Only available for NHL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      // Use specific site searches as recommended for best results
      const query = `"Natural Stat Trick" OR "MoneyPuck" ${seasonStr} NHL season team stats.
        Search for: ${homeName} and ${awayName} Corsi For percentage CF% 5v5.
        What is each team's Corsi For % at 5v5 for the current season?
        Include: CF%, CA/60, CF/60, shot attempt differential.
        Higher CF% = better possession/more shot attempts.
        Return ONLY factual data, no internal reasoning.`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NHL analytics expert. Use data from Natural Stat Trick or MoneyPuck. Provide exact Corsi For percentage and possession data for both teams. Return ONLY the data, no chain-of-thought reasoning.',
        maxTokens: 1500
      });
      
      return {
        category: 'Corsi For % (Possession)',
        source: 'Natural Stat Trick / MoneyPuck via Gemini',
        home: { team: homeName },
        away: { team: awayName },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `How do the CF% numbers compare between these teams?`,
        note: 'League average is 50%. CF% is the best possession proxy in hockey.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching CORSI_FOR_PCT:`, error.message);
      return { category: 'Corsi For %', error: 'Data unavailable' };
    }
  },

  // EXPECTED GOALS (xG) - Real Metric
  // SOURCE: MoneyPuck, Natural Stat Trick, Evolving Hockey
  EXPECTED_GOALS: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching EXPECTED_GOALS for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Expected Goals', note: 'Only available for NHL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `"MoneyPuck" OR "Natural Stat Trick" ${seasonStr} NHL season expected goals xG team stats.
        Search for: ${homeName} and ${awayName} expected goals xGF xGA 5v5.
        What is each team's:
        1. Expected Goals For (xGF) per 60 minutes
        2. Expected Goals Against (xGA) per 60 minutes
        3. Expected Goals differential (xGF - xGA)
        4. Actual goals vs expected (over/underperforming xG)
        Return ONLY factual data, no internal reasoning.`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NHL analytics expert. Use data from MoneyPuck or Natural Stat Trick. Provide exact expected goals (xG) data for both teams. Return ONLY the data, no chain-of-thought reasoning.',
        maxTokens: 1500
      });
      
      return {
        category: 'Expected Goals (xG)',
        source: 'MoneyPuck / Natural Stat Trick via Gemini',
        home: { team: homeName },
        away: { team: awayName },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `How does xG compare to actual goals for each team?`,
        note: 'xG accounts for shot location and type.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching EXPECTED_GOALS:`, error.message);
      return { category: 'Expected Goals', error: 'Data unavailable' };
    }
  },

  // PDO (Luck Indicator) - Real Metric
  // SOURCE: Natural Stat Trick, Hockey Reference
  PDO: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching PDO for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'PDO', note: 'Only available for NHL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `"Natural Stat Trick" ${seasonStr} NHL season PDO team stats.
        Search for: ${homeName} and ${awayName} PDO shooting percentage save percentage 5v5.
        What is each team's PDO (shooting % + save %) for the CURRENT ${seasonStr} season?
        Include: PDO value, 5v5 shooting %, 5v5 save %.
        PDO above 1.010 suggests good luck, below 0.990 suggests bad luck.
        Return ONLY factual data for the current season, no internal reasoning or old data.`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NHL analytics expert. Use ONLY Natural Stat Trick data for the CURRENT season. Provide exact PDO (shooting% + save%) for both teams. Return ONLY the data, no chain-of-thought reasoning. Do not include data from previous seasons.',
        maxTokens: 1500
      });
      
      return {
        category: 'PDO (Luck/Regression Indicator)',
        source: 'Natural Stat Trick via Gemini',
        home: { team: homeName },
        away: { team: awayName },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `How far from the 1.000 baseline is each team's PDO?`,
        note: 'PDO baseline is 1.000 (shooting% + save%). Values provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching PDO:`, error.message);
      return { category: 'PDO', error: 'Data unavailable' };
    }
  },

  // HIGH DANGER CHANCES - Real Metric
  // SOURCE: Natural Stat Trick (primary source for scoring chances)
  HIGH_DANGER_CHANCES: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching HIGH_DANGER_CHANCES for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'High Danger Chances', note: 'Only available for NHL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `"Natural Stat Trick" ${seasonStr} NHL season high danger chances team stats.
        Search for: ${homeName} and ${awayName} HDCF HDCA 5v5 scoring chances.
        What is each team's:
        1. High Danger Chances For (HDCF) per 60
        2. High Danger Chances Against (HDCA) per 60
        3. High Danger Chance % (HDCF%)
        4. Scoring Chance % (SCF%)
        Return ONLY factual data, no internal reasoning.`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NHL analytics expert. Use data from Natural Stat Trick. Provide exact high danger scoring chances data for both teams. Return ONLY the data, no chain-of-thought reasoning.',
        maxTokens: 1500
      });
      
      return {
        category: 'High Danger Scoring Chances',
        source: 'Natural Stat Trick via Gemini',
        home: { team: homeName },
        away: { team: awayName },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `How do the high danger chance numbers compare between these teams?`,
        note: 'HDCF% baseline is 50%. Data provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching HIGH_DANGER_CHANCES:`, error.message);
      return { category: 'High Danger Chances', error: 'Data unavailable' };
    }
  },

  // SCORING FIRST - Calculated from game data
  // SOURCE: Hockey Reference, NHL.com
  SCORING_FIRST: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching SCORING_FIRST for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Scoring First', note: 'Only available for NHL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `"Hockey Reference" OR "NHL.com" ${seasonStr} NHL season scoring first stats.
        Search for: ${homeName} and ${awayName} record when scoring first goal.
        What is each team's:
        1. Record when scoring first
        2. Record when opponent scores first
        3. First period goals for/against
        4. Win % when leading after 1st period
        Return ONLY factual data, no internal reasoning.`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NHL analyst. Use data from Hockey Reference or NHL.com. Provide exact scoring first statistics and first period data for both teams. Return ONLY the data, no chain-of-thought reasoning.',
        maxTokens: 1500
      });
      
      return {
        category: 'Scoring First & Fast Starts',
        source: 'Hockey Reference / NHL.com via Gemini',
        home: { team: homeName },
        away: { team: awayName },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `How do these teams perform when scoring first vs trailing first?`,
        note: 'Scoring first records provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching SCORING_FIRST:`, error.message);
      return { category: 'Scoring First', error: 'Data unavailable' };
    }
  },

  // LINE COMBINATIONS - Real Data
  // SOURCE: Daily Faceoff, Left Wing Lock (the best for current line combos)
  LINE_COMBINATIONS: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching LINE_COMBINATIONS for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Line Combinations', note: 'Only available for NHL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `"Daily Faceoff" OR "Left Wing Lock" ${seasonStr} NHL line combinations projected lines.
        Search for: ${homeName} and ${awayName} forward lines defense pairings.
        What are each team's:
        1. Top 6 forward lines (1st and 2nd line with player names)
        2. Top 4 defensemen pairings
        3. Starting goalie (expected)
        4. Power play units (PP1)
        Return ONLY factual lineup data, no internal reasoning.`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NHL lineup analyst. Use data from Daily Faceoff or Left Wing Lock. Provide current projected line combinations for both teams with player names. Return ONLY the data, no chain-of-thought reasoning.',
        maxTokens: 2000
      });
      
      return {
        category: 'Line Combinations',
        source: 'Daily Faceoff / Left Wing Lock via Gemini',
        home: { team: homeName },
        away: { team: awayName },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `Have either team's line combinations changed recently?`,
        note: 'First line matchups often decide games. Check which lines match up.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching LINE_COMBINATIONS:`, error.message);
      return { category: 'Line Combinations', error: 'Data unavailable' };
    }
  },

  // OVERTIME RECORD - Calculated
  OVERTIME_RECORD: async (bdlSport, home, away, season) => {
    const homeNameOT = home?.full_name || home?.name || 'Unknown Home';
    const awayNameOT = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching OVERTIME_RECORD for ${awayNameOT} @ ${homeNameOT}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Overtime Record', note: 'Only available for NHL' };
    }
    
    try {
      // Get season games for both teams
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 50 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 50 })
      ]);
      
      const calcOTRecord = (games, teamId) => {
        let otWins = 0, otLosses = 0, soWins = 0, soLosses = 0;
        
        for (const g of games || []) {
          if (g.game_state !== 'OFF' && g.game_state !== 'FINAL' && g.status !== 'Final') continue;
          
          // Check if OT game (period > 3)
          const isOT = g.period > 3 || g.overtime;
          if (!isOT) continue;
          
          const isHome = g.home_team?.id === teamId;
          const teamScore = isHome ? g.home_score : g.away_score;
          const oppScore = isHome ? g.away_score : g.home_score;
          const won = teamScore > oppScore;
          
          // Check if shootout (could check specific SO indicator if available)
          const isSO = g.period > 4 || g.shootout;
          
          if (isSO) {
            if (won) soWins++;
            else soLosses++;
          } else {
            if (won) otWins++;
            else otLosses++;
          }
        }
        
        return {
          ot_wins: otWins,
          ot_losses: otLosses,
          so_wins: soWins,
          so_losses: soLosses,
          total_extra_time: otWins + otLosses + soWins + soLosses,
          ot_win_pct: (otWins + otLosses) > 0 ? `${((otWins / (otWins + otLosses)) * 100).toFixed(0)}%` : 'N/A'
        };
      };
      
      const homeOT = calcOTRecord(homeGames, home.id);
      const awayOT = calcOTRecord(awayGames, away.id);
      
      return {
        category: 'Overtime & Shootout Record',
        source: 'Ball Don\'t Lie API (calculated)',
        home: {
          team: home.full_name || home.name,
          ...homeOT,
          rating: homeOT.ot_wins >= 3 ? 'CLUTCH in extras' : 'Average in extras'
        },
        away: {
          team: away.full_name || away.name,
          ...awayOT,
          rating: awayOT.ot_wins >= 3 ? 'CLUTCH in extras' : 'Average in extras'
        },
        INVESTIGATE: `How do these teams perform in overtime and shootouts?`,
        note: 'Overtime and shootout records provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching OVERTIME_RECORD:`, error.message);
      return { category: 'Overtime Record', error: 'Data unavailable' };
    }
  },

  // LUCK_INDICATORS - Combined luck metrics
  // SOURCE: Natural Stat Trick, MoneyPuck (for xG vs actual goals)
  LUCK_INDICATORS: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching LUCK_INDICATORS for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Luck Indicators', note: 'Only available for NHL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `"Natural Stat Trick" OR "MoneyPuck" ${seasonStr} NHL luck regression PDO xG.
        Search for: ${homeName} and ${awayName} goals vs expected.
        For each team analyze:
        1. PDO (shooting % + save %) - is it above/below 1.000?
        2. Goals scored vs expected goals (GF - xGF)
        3. Goals allowed vs expected (GA - xGA)
        4. 5v5 shooting percentage vs league average (9%)
        5. 5v5 save percentage vs league average (91%)`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NHL analytics expert. Use data from Natural Stat Trick or MoneyPuck. Analyze exact luck indicators and regression potential for both teams.'
      });
      
      return {
        category: 'Luck Indicators (Regression Watch)',
        source: 'Natural Stat Trick / MoneyPuck via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `How do PDO and Goals vs xG compare? Is either team significantly over- or under-performing expected numbers?`,
        note: 'PDO baseline is 1.000. xG data provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching LUCK_INDICATORS:`, error.message);
      return { category: 'Luck Indicators', error: 'Data unavailable' };
    }
  },

  // ===== NEW NHL FETCHERS (Standings Context, Depth, Variance) =====

  // POINTS_PCT - Points percentage from BDL standings
  POINTS_PCT: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching POINTS_PCT for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Points Percentage', note: 'Only available for NHL' };
    }
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const findTeam = (teamId) => standings.find(s => s.team?.id === teamId);
      const homeStanding = findTeam(home.id);
      const awayStanding = findTeam(away.id);
      
      const formatStanding = (standing, team) => {
        if (!standing) return { team: team.name, error: 'Standing not found' };
        const pointsPct = standing.points_pctg || standing.points_pct || 
          (standing.points / ((standing.games_played || 82) * 2));
        return {
          team: team.full_name || team.name,
          points: standing.points,
          points_pct: `${(pointsPct * 100).toFixed(1)}%`,
          games_played: standing.games_played,
          regulation_wins: standing.regulation_wins,
          ot_losses: standing.ot_losses,
          goal_diff: standing.goal_differential || (standing.goals_for - standing.goals_against),
          playoff_position: pointsPct >= 0.550 ? 'Playoff pace' : pointsPct >= 0.500 ? 'Bubble' : 'Below playoff line'
        };
      };
      
      return {
        category: 'Points Percentage (Playoff Context)',
        source: 'Ball Don\'t Lie API',
        home: formatStanding(homeStanding, home),
        away: formatStanding(awayStanding, away),
        INVESTIGATE: `How do these teams' points percentages compare?`,
        note: 'NHL uses points percentage (not win%) due to OT losses worth 1 point.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching POINTS_PCT:`, error.message);
      return { category: 'Points Percentage', error: 'Data unavailable' };
    }
  },

  // STREAK - Current win/loss streak
  STREAK: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching STREAK for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Current Streak', note: 'Only available for NHL' };
    }
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const findTeam = (teamId) => standings.find(s => s.team?.id === teamId);
      const homeStanding = findTeam(home.id);
      const awayStanding = findTeam(away.id);
      
      return {
        category: 'Current Streak',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          streak: homeStanding?.streak || 'N/A',
          hot_cold: homeStanding?.streak?.startsWith('W') && parseInt(homeStanding?.streak?.slice(1)) >= 3
            ? 'HOT' : homeStanding?.streak?.startsWith('L') && parseInt(homeStanding?.streak?.slice(1)) >= 3
            ? 'COLD' : 'Neutral'
        },
        away: {
          team: away.full_name || away.name,
          streak: awayStanding?.streak || 'N/A',
          hot_cold: awayStanding?.streak?.startsWith('W') && parseInt(awayStanding?.streak?.slice(1)) >= 3
            ? 'HOT' : awayStanding?.streak?.startsWith('L') && parseInt(awayStanding?.streak?.slice(1)) >= 3
            ? 'COLD' : 'Neutral'
        },
        note: 'Current streak data provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching STREAK:`, error.message);
      return { category: 'Current Streak', error: 'Data unavailable' };
    }
  },

  // PLAYOFF_POSITION - Playoff race context
  PLAYOFF_POSITION: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching PLAYOFF_POSITION for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Playoff Position', note: 'Only available for NHL' };
    }
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      // Group by division/conference for playoff context
      const divisionGroups = {};
      for (const s of standings) {
        const div = s.division_name || 'Unknown';
        if (!divisionGroups[div]) divisionGroups[div] = [];
        divisionGroups[div].push(s);
      }
      
      // Sort each division by points
      for (const div of Object.keys(divisionGroups)) {
        divisionGroups[div].sort((a, b) => (b.points || 0) - (a.points || 0));
      }
      
      const getPlayoffContext = (teamId) => {
        for (const [div, teams] of Object.entries(divisionGroups)) {
          const idx = teams.findIndex(t => t.team?.id === teamId);
          if (idx !== -1) {
            const team = teams[idx];
            const rank = idx + 1;
            const pointsBehind = rank > 1 ? (teams[0].points || 0) - (team.points || 0) : 0;
            return {
              division: div,
              division_rank: rank,
              points_behind_leader: pointsBehind,
              playoff_spot: rank <= 3 ? 'Division spot' : rank <= 5 ? 'Wild card race' : 'Outside looking in',
              home_record: team.home_record,
              road_record: team.road_record
            };
          }
        }
        return { error: 'Team not found in standings' };
      };
      
      return {
        category: 'Playoff Position Context',
        source: 'Ball Don\'t Lie API',
        home: { team: home.full_name || home.name, ...getPlayoffContext(home.id) },
        away: { team: away.full_name || away.name, ...getPlayoffContext(away.id) },
        INVESTIGATE: `What is each team's playoff race context?`,
        note: 'Top 3 in each division + 2 wild cards per conference make playoffs.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching PLAYOFF_POSITION:`, error.message);
      return { category: 'Playoff Position', error: 'Data unavailable' };
    }
  },

  // ONE_GOAL_GAMES - Close game record (1-goal margins)
  ONE_GOAL_GAMES: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching ONE_GOAL_GAMES for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'One-Goal Games', note: 'Only available for NHL' };
    }
    
    try {
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 50 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 50 })
      ]);
      
      const calcOneGoalRecord = (games, teamId) => {
        let wins = 0, losses = 0, total = 0;
        
        for (const g of games || []) {
          if (g.game_state !== 'OFF' && g.game_state !== 'FINAL' && g.status !== 'Final') continue;
          
          const margin = Math.abs((g.home_score || 0) - (g.away_score || 0));
          if (margin !== 1) continue; // Only 1-goal games
          
          total++;
          const isHome = g.home_team?.id === teamId;
          const teamScore = isHome ? g.home_score : g.away_score;
          const oppScore = isHome ? g.away_score : g.home_score;
          
          if (teamScore > oppScore) wins++;
          else losses++;
        }
        
        const winPct = total > 0 ? ((wins / total) * 100).toFixed(0) : 0;
        return {
          one_goal_record: `${wins}-${losses}`,
          one_goal_games: total,
          one_goal_win_pct: `${winPct}%`,
          clutch_rating: winPct >= 60 ? 'CLUTCH' : winPct <= 40 ? 'Struggles in close games' : 'Average'
        };
      };
      
      return {
        category: 'One-Goal Game Record',
        source: 'Ball Don\'t Lie API (calculated)',
        home: { team: home.full_name || home.name, ...calcOneGoalRecord(homeGames, home.id) },
        away: { team: away.full_name || away.name, ...calcOneGoalRecord(awayGames, away.id) },
        INVESTIGATE: `How do the one-goal game records compare? How far from 50% is each team?`,
        note: 'One-goal game records provided for comparison. 50% is the baseline.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching ONE_GOAL_GAMES:`, error.message);
      return { category: 'One-Goal Games', error: 'Data unavailable' };
    }
  },

  // REGULATION_WIN_PCT - Regulation wins vs total wins
  REGULATION_WIN_PCT: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching REGULATION_WIN_PCT for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Regulation Win %', note: 'Only available for NHL' };
    }
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const findTeam = (teamId) => standings.find(s => s.team?.id === teamId);
      const homeStanding = findTeam(home.id);
      const awayStanding = findTeam(away.id);
      
      const calcRegWinPct = (standing, team) => {
        if (!standing) return { team: team.name, error: 'Standing not found' };
        const regWins = standing.regulation_wins || 0;
        const totalWins = standing.wins || 0;
        const otLosses = standing.ot_losses || 0;
        const regWinPct = totalWins > 0 ? ((regWins / totalWins) * 100).toFixed(0) : 0;
        
        return {
          team: team.full_name || team.name,
          regulation_wins: regWins,
          total_wins: totalWins,
          ot_losses: otLosses,
          reg_win_pct: `${regWinPct}%`,
          dominance: regWinPct >= 75 ? 'Dominant - wins in regulation' :
                    regWinPct <= 50 ? 'Relies on extras' : 'Average'
        };
      };
      
      return {
        category: 'Regulation Win Percentage',
        source: 'Ball Don\'t Lie API',
        home: calcRegWinPct(homeStanding, home),
        away: calcRegWinPct(awayStanding, away),
        INVESTIGATE: `How do regulation win percentages compare between these teams?`,
        note: 'ROW (Regulation + OT Wins) is used as playoff tiebreaker.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching REGULATION_WIN_PCT:`, error.message);
      return { category: 'Regulation Win %', error: 'Data unavailable' };
    }
  },

  // MARGIN_VARIANCE - Goal differential consistency
  MARGIN_VARIANCE: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching MARGIN_VARIANCE for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Margin Variance', note: 'Only available for NHL' };
    }
    
    try {
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 30 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 30 })
      ]);
      
      const calcVariance = (games, teamId) => {
        const margins = [];
        let blowoutWins = 0, blowoutLosses = 0;
        
        for (const g of games || []) {
          if (g.game_state !== 'OFF' && g.game_state !== 'FINAL' && g.status !== 'Final') continue;
          
          const isHome = g.home_team?.id === teamId;
          const teamScore = isHome ? g.home_score : g.away_score;
          const oppScore = isHome ? g.away_score : g.home_score;
          const margin = teamScore - oppScore;
          margins.push(margin);
          
          if (margin >= 3) blowoutWins++;
          else if (margin <= -3) blowoutLosses++;
        }
        
        if (margins.length === 0) return { error: 'No games found' };
        
        const avgMargin = margins.reduce((a, b) => a + b, 0) / margins.length;
        const variance = margins.reduce((sum, m) => sum + Math.pow(m - avgMargin, 2), 0) / margins.length;
        const stdDev = Math.sqrt(variance);
        
        return {
          avg_margin: avgMargin.toFixed(1),
          std_deviation: stdDev.toFixed(2),
          blowout_wins: blowoutWins,
          blowout_losses: blowoutLosses,
          games_analyzed: margins.length,
          profile: stdDev >= 2.5 ? 'HIGH VARIANCE - boom or bust' :
                  stdDev <= 1.5 ? 'CONSISTENT - tight margins' : 'Average variance'
        };
      };
      
      return {
        category: 'Margin Variance (Consistency)',
        source: 'Ball Don\'t Lie API (calculated)',
        home: { team: home.full_name || home.name, ...calcVariance(homeGames, home.id) },
        away: { team: away.full_name || away.name, ...calcVariance(awayGames, away.id) },
        INVESTIGATE: `How do the margin variance numbers compare between these teams?`,
        note: 'Margin variance and standard deviation provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching MARGIN_VARIANCE:`, error.message);
      return { category: 'Margin Variance', error: 'Data unavailable' };
    }
  },

  // SHOOTING_REGRESSION - Player shooting % regression indicators
  SHOOTING_REGRESSION: async (bdlSport, home, away, season) => {
    const homeName = home?.full_name || home?.name || 'Unknown Home';
    const awayName = away?.full_name || away?.name || 'Unknown Away';
    console.log(`[Stat Router] Fetching SHOOTING_REGRESSION for ${awayName} @ ${homeName}`);
    
    if (bdlSport !== 'icehockey_nhl') {
      return { category: 'Shooting Regression', note: 'Only available for NHL' };
    }
    
    try {
      const seasonStr = getCurrentSeasonString();
      const query = `"Natural Stat Trick" ${seasonStr} NHL shooting percentage team stats.
        Search for: ${homeName} and ${awayName} shooting percentage stats.
        What is each team's:
        1. 5v5 shooting percentage (league avg is ~9%)
        2. 5v5 save percentage (league avg is ~91%)
        3. Any players with unsustainably high (>15%) or low (<5%) shooting %
        4. Goals vs expected goals (over/underperforming)`;
      
      const groundingResult = await geminiGroundingSearch(query, {
        systemMessage: 'You are an NHL analytics expert. Identify shooting percentage regression candidates for both teams.'
      });
      
      return {
        category: 'Shooting % Regression Watch',
        source: 'Natural Stat Trick / Hockey Reference via Gemini',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        grounding_data: groundingResult?.data || groundingResult?.content || 'Data unavailable',
        INVESTIGATE: `How do each team's shooting percentages compare to the ~9% league average?`,
        note: 'League average 5v5 shooting% is ~9%. Data provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching SHOOTING_REGRESSION:`, error.message);
      return { category: 'Shooting Regression', error: 'Data unavailable' };
    }
  },

  // ===== WEATHER (NFL/NCAAF) - Returns weather data for Gary to evaluate =====
  WEATHER: async (bdlSport, home, away, season, options = {}) => {
    const homeName = home.full_name || home.name;
    const awayName = away.full_name || away.name;
    
    // Only applicable for football
    if (bdlSport !== 'americanfootball_nfl' && bdlSport !== 'americanfootball_ncaaf') {
      return {
        category: 'Weather',
        note: 'Weather data is primarily relevant for outdoor football games.',
        home: { team: homeName },
        away: { team: awayName }
      };
    }

    const sport = bdlSport === 'americanfootball_ncaaf' ? 'NCAAF' : 'NFL';
    console.log(`[Stat Router] WEATHER check for ${awayName} @ ${homeName} (${sport})`);

    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const weather = await getGroundedWeather(homeName, awayName, dateStr);

      if (!weather) {
        console.log(`[Stat Router] WEATHER: No data available`);
        return {
          category: 'Weather',
          note: 'Weather data unavailable for this game.',
          home: { team: homeName },
          away: { team: awayName }
        };
      }

      // Dome games
      if (weather.is_dome) {
        return {
          category: 'Weather',
          conditions: 'Indoor/Dome Stadium',
          note: 'Indoor stadium - controlled environment.',
          home: { team: homeName },
          away: { team: awayName }
        };
      }

      const temp = weather.temperature;
      const wind = weather.wind_speed;
      const conditions = (weather.conditions || 'Clear').toLowerCase();

      // Flag notably cold or windy conditions for context
      const notableConditions = [];
      if (temp && temp < 25) notableConditions.push(`Cold: ${temp}°F`);
      if (wind && wind >= 15) notableConditions.push(`Wind: ${wind} mph`);
      if (conditions.includes('snow') || conditions.includes('rain') || conditions.includes('storm')) {
        notableConditions.push(`Precipitation: ${weather.conditions}`);
      }

      console.log(`[Stat Router] WEATHER: ${temp}°F, ${wind || 'light'} mph wind, ${conditions}`);

      // Determine forecast certainty based on conditions
      // Rain/snow forecasts are less reliable than temperature/wind
      const isPrecipitationForecast = conditions.includes('rain') || conditions.includes('snow') || conditions.includes('storm');
      const forecastNote = isPrecipitationForecast 
        ? 'FORECAST UNCERTAINTY: Precipitation forecasts can change. If your analysis relies heavily on rain/snow, acknowledge this uncertainty - conditions may differ at game time.'
        : 'Current forecast for game time. Temperature and wind forecasts are generally more reliable than precipitation.';

      // Return weather data for Gary to evaluate
      return {
        category: 'Weather',
        temperature: temp ? `${temp}°F` : 'N/A',
        wind_speed: wind ? `${wind} mph` : 'Light',
        conditions: weather.conditions || 'Clear',
        notable_conditions: notableConditions.length > 0 ? notableConditions : null,
        forecast_reliability: isPrecipitationForecast ? 'UNCERTAIN' : 'MODERATE',
        note: forecastNote,
        home: { team: homeName },
        away: { team: awayName }
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching weather:`, error.message);
      return {
        category: 'Weather',
        note: 'Weather data unavailable.',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  // ===== QB WEATHER HISTORY (NFL only - uses Gemini Grounding) =====
  QB_WEATHER_HISTORY: async (bdlSport, home, away, season, options = {}) => {
    // Only applicable for NFL
    if (bdlSport !== 'americanfootball_nfl') {
      return {
        category: 'QB Weather History',
        note: 'Only available for NFL games',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }

    console.log(`[Stat Router] Fetching QB_WEATHER_HISTORY for ${away.name} @ ${home.name}`);

    try {
      // First, get weather for the game via Gemini Grounding
      const dateStr = new Date().toISOString().slice(0, 10);
      const weather = await getGroundedWeather(
        home.full_name || home.name,
        away.full_name || away.name,
        dateStr
      );

      if (!weather || weather.isDome) {
        return {
          category: 'QB Weather History',
          note: weather?.isDome ? 'Indoor/dome stadium - weather not a factor' : 'Weather data unavailable',
          home: { team: home.full_name || home.name },
          away: { team: away.full_name || away.name },
          weather_conditions: weather?.isDome ? 'Indoor' : 'Unknown'
        };
      }

      // Check if weather is adverse enough to matter
      const temp = weather.temperature;
      const windStr = weather.wind || '';
      const windSpeed = parseInt((windStr.match(/(\d+)/) || [])[1]) || 0;
      const conditions = (weather.conditions || '').toLowerCase();
      const isAdverse = (temp && temp < 40) || 
                        (windSpeed > 15) || 
                        conditions.includes('snow') || 
                        conditions.includes('rain');

      if (!isAdverse) {
        return {
          category: 'QB Weather History',
          note: 'Weather conditions are normal - no significant impact expected',
          home: { team: home.full_name || home.name },
          away: { team: away.full_name || away.name },
          weather_conditions: `${temp}°F, ${windStr}, ${weather.conditions}`,
          impact: 'minimal'
        };
      }

      // Use Gemini Grounding for QB weather performance history
      const qbQuery = `NFL QB weather performance history for ${away.full_name || away.name} @ ${home.full_name || home.name}:

Weather conditions: ${temp}°F, ${windStr}, ${conditions}

For each team's starting QB:
1. Name of current starting QB
2. Career games in similar conditions (cold/snow/rain/wind)
3. Career record in adverse weather
4. Completion percentage in cold/adverse weather
5. Assessment: Does this QB perform better or worse in bad weather?

Be factual with historical stats where available.`;

      const qbResult = await geminiGroundingSearch(qbQuery, { temperature: 1.0, maxTokens: 1500 });

      return {
        category: 'QB Cold/Adverse Weather History',
        weather_conditions: `${temp}°F, ${windStr}, ${weather.conditions}`,
        home: {
          team: home.full_name || home.name,
          analysis: qbResult?.success ? qbResult.data : 'Weather analysis unavailable'
        },
        away: {
          team: away.full_name || away.name,
          analysis: qbResult?.success ? qbResult.data : 'Weather analysis unavailable'
        },
        note: 'Historical QB performance in similar weather conditions via Gemini Grounding'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching QB weather history:`, error.message);
      return {
        category: 'QB Weather History',
        error: error.message,
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        note: 'Unable to fetch QB weather performance data'
      };
    }
  }
};

// Add aliases for tokens that use the same fetcher
const ALIASES = {
  // ═══════════════════════════════════════════════════════════════════════════
  // NHL ALIASES - All advanced stats now have REAL fetchers!
  // ═══════════════════════════════════════════════════════════════════════════
  // CORSI_FOR_PCT - has real fetcher (Gemini Grounding)
  // EXPECTED_GOALS - has real fetcher (Gemini Grounding)
  // PDO - has real fetcher (Gemini Grounding)
  // HIGH_DANGER_CHANCES - has real fetcher (Gemini Grounding)
  // SCORING_FIRST - has real fetcher (Gemini Grounding)
  // LINE_COMBINATIONS - has real fetcher (Gemini Grounding)
  // OVERTIME_RECORD - has real fetcher (calculated)
  // LUCK_INDICATORS - has real fetcher (Gemini Grounding)
  // ═══════════════════════════════════════════════════════════════════════════
  SHOT_METRICS: 'SHOT_DIFFERENTIAL', // Semantically equivalent
  SHOT_QUALITY: 'HIGH_DANGER_CHANCES', // Now points to real fetcher!
  SAVE_PCT: 'GOALIE_STATS',
  GOALS_AGAINST_AVG: 'GOALIE_STATS',
  GOALIE_MATCHUP: 'GOALIE_STATS',
  PP_OPPORTUNITIES: 'SPECIAL_TEAMS',
  BACK_TO_BACK: 'REST_SITUATION',
  HOME_ICE: 'HOME_AWAY_SPLITS',
  ROAD_PERFORMANCE: 'HOME_AWAY_SPLITS',
  POSSESSION_METRICS: 'CORSI_FOR_PCT', // Now points to real possession metric!
  TOP_SCORERS: 'TOP_PLAYERS',
  DIVISION_STANDING: 'STANDINGS',
  // NHL-specific aliases for new fetchers (auto-routed via sportSpecificToken)
  NHL_HOME_ICE: 'NHL_HOME_AWAY_SPLITS',
  NHL_ROAD_PERFORMANCE: 'NHL_HOME_AWAY_SPLITS',
  NHL_BACK_TO_BACK: 'REST_SITUATION',
  NHL_STREAK: 'NHL_STANDINGS',
  NHL_RECORD: 'NHL_STANDINGS',
  NHL_SCORING_LEADERS: 'NHL_HOT_PLAYERS',
  NHL_POINT_LEADERS: 'NHL_HOT_PLAYERS',
  NHL_HEAD_TO_HEAD: 'NHL_H2H_HISTORY',
  NHL_SERIES_HISTORY: 'NHL_H2H_HISTORY',
  NHL_L5: 'NHL_RECENT_FORM',
  NHL_L10: 'NHL_RECENT_FORM',
  NHL_MOMENTUM: 'NHL_RECENT_FORM',
  // ═══════════════════════════════════════════════════════════════════════════
  // ALL REAL FETCHERS - Every token below has a dedicated implementation!
  // ═══════════════════════════════════════════════════════════════════════════
  // PACE_LAST_10 - has real fetcher (BDL advanced pace + L10 games calculated)
  // PACE_HOME_AWAY - has real fetcher (BDL advanced pace + game splits calculated)
  // OPP_EFG_PCT - has real fetcher (BDL opponent stats type=opponent)
  // OPP_TOV_RATE - has real fetcher (BDL opponent stats type=opponent)
  // OPP_FT_RATE - has real fetcher (BDL opponent stats type=opponent)
  // THREE_PT_DEFENSE - has real fetcher (BDL opponent stats type=opponent)
  // DREB_RATE - has real fetcher (BDL advanced dreb_pct + opponent oreb)
  // PAINT_DEFENSE - has real fetcher (BDL defense stats type=defense + advanced + base)
  // PAINT_SCORING - has real fetcher (BDL scoring type breakdown)
  // MIDRANGE - has real fetcher (Gemini Grounding)
  // TRANSITION_DEFENSE - has real fetcher (BDL defense stats type=defense: opp_pts_fb, opp_pts_off_tov)
  // LINEUP_NET_RATINGS - has real fetcher (Gemini Grounding)
  // TRAVEL_SITUATION - has real fetcher (calculated)
  // MINUTES_TREND - has real fetcher (BDL player season averages MPG)
  // BLOWOUT_TENDENCY - has real fetcher (calculated)
  // CONFERENCE_STATS - has real fetcher (BDL standings)
  // NON_CONF_STRENGTH - has real fetcher (calculated)
  // EFFICIENCY_TREND - has real fetcher (L5 vs season)
  // SCHEDULE_STRENGTH - has real fetcher (opponent records)
  // ═══════════════════════════════════════════════════════════════════════════
  
  EFFICIENCY_LAST_10: 'EFFICIENCY_TREND', // Semantically equivalent
  PERIMETER_DEFENSE: 'THREE_PT_DEFENSE', // Semantically equivalent
  QUARTER_SPLITS: 'QUARTER_SCORING', // Fixed - now points to real quarter data!
  // LINEUP_DATA only available once game starts (BDL limitation) - not useful for pre-game
  LINEUP_DATA: 'TOP_PLAYERS',
  // NBA-specific aliases for quarter scoring (point to NFL implementations - same BDL structure)
  FIRST_HALF_SCORING: 'FIRST_HALF_TRENDS',
  SECOND_HALF_SCORING: 'SECOND_HALF_TRENDS',
  BACK_TO_BACK: 'REST_SITUATION',
  TEMPO_CONTROL: 'PACE',
  TWO_PT_SHOOTING: 'EFG_PCT', // eFG% includes 2PT context
  HOME_COURT_VALUE: 'HOME_AWAY_SPLITS', // Related - home splits show home value
  // ROAD_PERFORMANCE - now has separate context in HOME_AWAY_SPLITS
  EXPERIENCE: 'TOP_PLAYERS', // Related - top players shows experience
  VS_RANKED: 'VS_ELITE_TEAMS', // Points to real fetcher
  CLOSE_GAME_RECORD: 'CLUTCH_STATS', // Points to real fetcher
  // NFL/NCAAF aliases removed - each token should return unique data
  // Keeping only essential NCAAF aliases that don't have BDL data
  SP_PLUS_RATINGS: 'NET_RATING',
  SP_PLUS_TREND: 'NET_RATING',
  FEI_RATINGS: 'NET_RATING',
  TALENT_COMPOSITE: 'TOP_PLAYERS',
  BLUE_CHIP_RATIO: 'TOP_PLAYERS',
  TRANSFER_PORTAL: 'TOP_PLAYERS',
  // NCAAF schedule strength aliases - these are CRITICAL for CFP analysis
  STRENGTH_OF_SCHEDULE: 'NCAAF_STRENGTH_OF_SCHEDULE',
  OPPONENT_ADJUSTED: 'NCAAF_OPPONENT_ADJUSTED',
  CONFERENCE_STRENGTH: 'NCAAF_CONFERENCE_STRENGTH',
  VS_POWER_OPPONENTS: 'NCAAF_VS_POWER_OPPONENTS',
  TRAVEL_FATIGUE: 'NCAAF_TRAVEL_FATIGUE',
  // NCAAF-specific advanced stat aliases (BDL doesn't have these - use Gemini Grounding)
  NCAAF_SP_PLUS_RATINGS: 'NCAAF_SP_PLUS',
  NCAAF_FPI_RATINGS: 'NCAAF_FPI',
  NCAAF_FEI_RATINGS: 'NCAAF_FPI',
  NCAAF_EPA: 'NCAAF_EPA_ADVANCED',
  NCAAF_SUCCESS_RATE: 'NCAAF_EPA_ADVANCED',
  NCAAF_HAVOC: 'NCAAF_HAVOC_RATE',
  NCAAF_EXPLOSIVE_PLAYS: 'NCAAF_EXPLOSIVENESS',
  NCAAF_RUSH_EFFICIENCY: 'NCAAF_RUSHING_EFFICIENCY',
  NCAAF_PASS_EFFICIENCY: 'NCAAF_PASSING_EFFICIENCY',
  NCAAF_REDZONE: 'NCAAF_RED_ZONE'
};

// Resolve aliases
for (const [alias, target] of Object.entries(ALIASES)) {
  if (!FETCHERS[alias] && FETCHERS[target]) {
    FETCHERS[alias] = FETCHERS[target];
  }
}

// Default handler for unknown tokens
for (const token of Object.keys(ALIASES)) {
  if (!FETCHERS[token]) {
    FETCHERS[token] = FETCHERS.DEFAULT;
  }
}

// Helper functions
async function fetchTopPlayersForTeam(bdlSport, team, season) {
  try {
    // For NCAAB, use the player_season_stats endpoint which gives season averages directly
    // This is more reliable than aggregating per-game stats
    if (bdlSport === 'basketball_ncaab') {
      const seasonStats = await ballDontLieService.getNcaabPlayerSeasonStats({
        teamIds: [team.id],
        season
      });
      
      if (!seasonStats || seasonStats.length === 0) {
        // Fallback to per-game stats if season stats unavailable
        const gameStats = await ballDontLieService.getPlayerStats(bdlSport, {
          seasons: [season],
          team_ids: [team.id],
          per_page: 10
        });
        
        if (!gameStats || gameStats.length === 0) {
          return [{ note: 'No player stats available' }];
        }
        
        // Aggregate per-game stats
        const playerMap = new Map();
        gameStats.forEach(g => {
          const playerId = g.player?.id;
          if (!playerId) return;
          if (!playerMap.has(playerId)) {
            playerMap.set(playerId, {
              player: g.player,
              games: 0,
              pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
              fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0
            });
          }
          const p = playerMap.get(playerId);
          p.games++;
          p.pts += g.pts || 0;
          p.reb += g.reb || 0;
          p.ast += g.ast || 0;
          p.stl += g.stl || 0;
          p.blk += g.blk || 0;
          p.fgm += g.fgm || 0;
          p.fga += g.fga || 0;
          p.fg3m += g.fg3m || 0;
          p.fg3a += g.fg3a || 0;
          p.ftm += g.ftm || 0;
          p.fta += g.fta || 0;
        });
        
        const sorted = Array.from(playerMap.values())
          .filter(p => p.games >= 3)
          .sort((a, b) => (b.pts / b.games) - (a.pts / a.games))
          .slice(0, 5);
        
        return sorted.map(p => ({
          name: `${p.player?.first_name || ''} ${p.player?.last_name || ''}`.trim(),
          position: p.player?.position || 'N/A',
          games: p.games,
          ppg: fmtNum(p.pts / p.games),
          rpg: fmtNum(p.reb / p.games),
          apg: fmtNum(p.ast / p.games),
          fg_pct: p.fga > 0 ? fmtNum((p.fgm / p.fga) * 100) + '%' : 'N/A',
          fg3_pct: p.fg3a > 0 ? fmtNum((p.fg3m / p.fg3a) * 100) + '%' : 'N/A'
        }));
      }
      
      // Use season stats directly - this is the preferred path
      const sorted = seasonStats
        .filter(p => p.games_played >= 3)
        .sort((a, b) => (b.pts || 0) - (a.pts || 0)) // pts is total points, higher = more production
        .slice(0, 5);
      
      return sorted.map(p => {
        const games = p.games_played || 1;
        return {
          name: `${p.player?.first_name || ''} ${p.player?.last_name || ''}`.trim(),
          position: p.player?.position || 'N/A',
          games: games,
          // Season stats gives totals, calculate per-game
          ppg: fmtNum((p.pts || 0) / games),
          rpg: fmtNum((p.reb || 0) / games),
          apg: fmtNum((p.ast || 0) / games),
          spg: fmtNum((p.stl || 0) / games),
          bpg: fmtNum((p.blk || 0) / games),
          fg_pct: p.fg_pct ? fmtNum(p.fg_pct) + '%' : 'N/A',
          fg3_pct: p.fg3_pct ? fmtNum(p.fg3_pct) + '%' : 'N/A',
          ft_pct: p.ft_pct ? fmtNum(p.ft_pct) + '%' : 'N/A',
          min_pg: fmtNum(p.min || 0)
        };
      });
    }
    
    // Default path for other sports
    const seasonStats = await ballDontLieService.getPlayerStats(bdlSport, {
      seasons: [season],
      team_ids: [team.id],
      per_page: 10
    });
    
    if (!seasonStats || seasonStats.length === 0) {
      return [{ note: 'No player stats available' }];
    }
    
    // Sort by points or relevant stat
    const sorted = seasonStats
      .filter(p => p.games_played > 0)
      .sort((a, b) => (b.pts || b.points || 0) - (a.pts || a.points || 0))
      .slice(0, 5);
    
    return sorted.map(p => ({
      name: `${p.player?.first_name || ''} ${p.player?.last_name || ''}`.trim(),
      position: p.player?.position || 'N/A',
      games: p.games_played,
      ppg: fmtNum(p.pts_per_game || p.points_per_game || (p.pts / p.games_played)),
      rpg: fmtNum(p.reb_per_game || p.rebounds_per_game || (p.reb / p.games_played)),
      apg: fmtNum(p.ast_per_game || p.assists_per_game || (p.ast / p.games_played))
    }));
  } catch (error) {
    console.warn(`[Stat Router] Error fetching players for ${team.name}:`, error.message);
    return [{ note: 'Player stats unavailable' }];
  }
}

function formatRecentGames(games, teamName, standingsMap = null) {
  if (!games || games.length === 0) {
    return { record: 'N/A', games: [], note: 'No recent game data available' };
  }
  
  // Filter to only completed games - handle NBA, NCAAB, and NFL field names
  // Per BDL API docs:
  // - NFL: status: 'Final', uses home_team_score/visitor_team_score
  // - NBA: status: 'Final', uses home_team_score/visitor_team_score  
  // - NCAAB: status: 'post', period_detail: 'Final', uses home_score/away_score
  const completedGames = games.filter(g => {
    // NFL and NBA use 'Final', NCAAB uses 'post' or period_detail='Final'
    const hasStatus = isGameCompleted(g.status) || g.period_detail?.toLowerCase() === 'final';
    const hasNBAScore = g.home_team_score !== null && g.home_team_score !== undefined;
    const hasNCAABScore = g.home_score !== null && g.home_score !== undefined;
    // Ensure game date is in the past (avoids including scheduled games)
    const gameDate = new Date(g.date);
    const isPast = gameDate < new Date();
    return hasStatus && (hasNBAScore || hasNCAABScore) && isPast;
  });
  
  if (completedGames.length === 0) {
    return { record: 'N/A', games: [], note: 'No completed games found' };
  }
  
  // Helper function to process N games
  const processGames = (gamesToProcess) => {
    let wins = 0, losses = 0, ties = 0;
    let closeWins = 0, closeLosses = 0, blowoutWins = 0, blowoutLosses = 0;
    let totalOppWins = 0, oppsWithRecords = 0;
    
    const gameDetails = gamesToProcess.map(g => {
      // Handle both nested object and string team names
      const homeTeamName = g.home_team?.name || g.home_team?.full_name || g.home_team;
      const awayTeamName = g.visitor_team?.name || g.visitor_team?.full_name || g.away_team?.name || g.away_team;
      const homeTeamId = g.home_team?.id;
      const awayTeamId = g.visitor_team?.id || g.away_team?.id;
      
      // Normalize for comparison
      const normalizedTeamName = String(teamName).toLowerCase();
      const normalizedHome = String(homeTeamName).toLowerCase();
      const normalizedAway = String(awayTeamName).toLowerCase();
      
      const isHome = normalizedHome.includes(normalizedTeamName) || normalizedTeamName.includes(normalizedHome);
      
      // Handle both NBA and NCAAB field names for scores
      const homeScore = g.home_team_score ?? g.home_score ?? 0;
      const awayScore = g.visitor_team_score ?? g.away_score ?? 0;
      
      const teamScore = isHome ? homeScore : awayScore;
      const oppScore = isHome ? awayScore : homeScore;
      const opponent = isHome ? awayTeamName : homeTeamName;
      const opponentId = isHome ? awayTeamId : homeTeamId;
      
      // Calculate margin
      const margin = teamScore - oppScore;
      const absMargin = Math.abs(margin);
      
      // Classify game type
      let gameType = 'comfortable';
      if (absMargin <= 7) gameType = 'CLOSE';
      else if (absMargin >= 14) gameType = 'BLOWOUT';
      
      let result = 'T';
      if (teamScore > oppScore) {
        wins++;
        result = 'W';
        if (gameType === 'CLOSE') closeWins++;
        else if (gameType === 'BLOWOUT') blowoutWins++;
      } else if (oppScore > teamScore) {
        losses++;
        result = 'L';
        if (gameType === 'CLOSE') closeLosses++;
        else if (gameType === 'BLOWOUT') blowoutLosses++;
      } else {
        ties++;
      }
      
      // Get opponent record from standings if available
      let oppRecord = null;
      let oppWins = null;
      if (standingsMap && opponentId) {
        const oppStanding = standingsMap.get(opponentId);
        if (oppStanding) {
          oppRecord = oppStanding.overall_record || `${oppStanding.wins || 0}-${oppStanding.losses || 0}`;
          oppWins = oppStanding.wins || 0;
          totalOppWins += oppWins;
          oppsWithRecords++;
        }
      }
      
      // Format date
      const gameDate = g.date ? new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      
      return {
        result,
        score: `${teamScore}-${oppScore}`,
        margin: margin,
        absMargin: absMargin,
        gameType: gameType,
        opponent: opponent || 'Unknown',
        opponentRecord: oppRecord,
        opponentWins: oppWins,
        location: isHome ? 'Home' : 'Away',
        date: gameDate,
        week: g.week || null,
        display: `${result} ${teamScore}-${oppScore} (${margin > 0 ? '+' : ''}${margin}) ${isHome ? 'vs' : '@'} ${opponent}${oppRecord ? ` (${oppRecord})` : ''}${gameDate ? ` - ${gameDate}` : ''}`
      };
    });
    
    const record = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
    const streak = gameDetails.map(g => g.result).join('');
    
    // Build enhanced analysis
    const avgOppWins = oppsWithRecords > 0 ? (totalOppWins / oppsWithRecords).toFixed(1) : null;
    const playoffCaliberOpps = gameDetails.filter(g => g.opponentWins && g.opponentWins >= 8).length;
    
    return {
      record,
      streak,
      games: gameDetails,
      analysis: {
        wins, losses, ties,
        closeWins,
        closeLosses,
        blowoutWins,
        blowoutLosses,
        avgOpponentWins: avgOppWins,
        playoffCaliberOpponents: playoffCaliberOpps
      }
    };
  };
  
  // Process L5 and L10
  const l5Games = completedGames.slice(0, 5);
  const l10Games = completedGames.slice(0, 10);
  
  const l5Data = processGames(l5Games);
  const l10Data = processGames(l10Games);
  
  // Build narrative context for Gary (based on L5)
  const narrativeParts = [];
  const { closeLosses, closeWins, blowoutLosses, losses, wins, avgOpponentWins } = l5Data.analysis;
  
  if (closeLosses >= 2) {
    narrativeParts.push(`${closeLosses} of ${losses} L5 losses were CLOSE (≤7 pts) - NOT a freefall`);
  }
  if (closeWins >= 2) {
    narrativeParts.push(`${closeWins} of ${wins} L5 wins were close - investigate sustainability`);
  }
  if (blowoutLosses >= 2) {
    narrativeParts.push(`${blowoutLosses} BLOWOUT losses (14+ pts) in L5 - concerning trend`);
  }
  if (avgOpponentWins && parseFloat(avgOpponentWins) >= 7) {
    narrativeParts.push(`Tough L5 schedule: avg opponent has ${avgOpponentWins} wins`);
  }
  if (avgOpponentWins && parseFloat(avgOpponentWins) <= 4) {
    narrativeParts.push(`Easy L5 schedule: avg opponent has only ${avgOpponentWins} wins`);
  }
  
  // Compare L5 vs L10 trend
  const l5WinPct = l5Data.analysis.wins / (l5Data.analysis.wins + l5Data.analysis.losses) || 0;
  const l10WinPct = l10Data.analysis.wins / (l10Data.analysis.wins + l10Data.analysis.losses) || 0;
  const trendDiff = l5WinPct - l10WinPct;
  
  if (trendDiff >= 0.2) {
    narrativeParts.push(`TRENDING UP: L5 (${l5Data.record}) is better than L10 (${l10Data.record})`);
  } else if (trendDiff <= -0.2) {
    narrativeParts.push(`TRENDING DOWN: L5 (${l5Data.record}) is worse than L10 (${l10Data.record})`);
  }
  
  // ===== NEW: LAST 2-3 GAMES MICRO-TREND =====
  // Games are sorted most recent first, so index 0 is the latest game
  const last3Games = l5Data.games.slice(0, 3);
  const last3Results = last3Games.map(g => g.result).join('');
  const last3Wins = last3Games.filter(g => g.result === 'W').length;
  const last3Losses = last3Games.filter(g => g.result === 'L').length;
  
  // Detect "turning the corner" patterns
  let microTrend = null;
  if (last3Results === 'WWW') {
    microTrend = 'HOT: Won last 3 games';
  } else if (last3Results === 'LLL') {
    microTrend = 'COLD: Lost last 3 games';
  } else if (last3Wins >= 2 && l5Data.analysis.losses >= 3) {
    microTrend = 'TURNING CORNER? Won ' + last3Wins + ' of last 3 despite rough L5';
  } else if (last3Losses >= 2 && l5Data.analysis.wins >= 3) {
    microTrend = 'SLIPPING? Lost ' + last3Losses + ' of last 3 despite good L5';
  }
  
  if (microTrend) {
    narrativeParts.push(microTrend);
  }
  
  // ===== NEW: STREAK SNAP DETECTION =====
  // Look at L10 to find if they snapped a losing streak
  const l10Results = l10Data.games.map(g => g.result);
  let currentStreak = 0;
  let streakType = l10Results[0]; // W or L
  for (let i = 0; i < l10Results.length; i++) {
    if (l10Results[i] === streakType) currentStreak++;
    else break;
  }
  
  // Check for streak snap pattern: current win streak after losses
  if (streakType === 'W' && currentStreak >= 2) {
    // Count consecutive losses after the current wins
    let priorLosses = 0;
    for (let i = currentStreak; i < l10Results.length; i++) {
      if (l10Results[i] === 'L') priorLosses++;
      else break;
    }
    if (priorLosses >= 3) {
      narrativeParts.push(`STREAK SNAPPED: Won last ${currentStreak} after ${priorLosses}-game losing streak - INVESTIGATE what changed`);
    }
  }
  
  // Check for opposite: losing after wins
  if (streakType === 'L' && currentStreak >= 2) {
    let priorWins = 0;
    for (let i = currentStreak; i < l10Results.length; i++) {
      if (l10Results[i] === 'W') priorWins++;
      else break;
    }
    if (priorWins >= 3) {
      narrativeParts.push(`MOMENTUM LOST: Lost last ${currentStreak} after ${priorWins}-game win streak - INVESTIGATE what changed`);
    }
  }
  
  // ===== NEW: MARGIN TREND IN LOSSES =====
  // Are losses getting closer? (sign of improvement even during losing)
  const recentLosses = l5Data.games.filter(g => g.result === 'L');
  if (recentLosses.length >= 2) {
    // Margins are negative for losses, so -3 is "closer" than -15
    // Games are sorted most recent first
    const lossMargins = recentLosses.map(g => g.margin); // e.g., [-3, -8, -15] (most recent first)
    
    // Check if losses are getting closer (margins trending toward 0)
    // Compare first half of losses to second half
    const recentLossAvg = lossMargins.slice(0, Math.ceil(lossMargins.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(lossMargins.length / 2);
    const olderLossAvg = lossMargins.slice(Math.ceil(lossMargins.length / 2)).reduce((a, b) => a + b, 0) / Math.floor(lossMargins.length / 2) || recentLossAvg;
    
    // If recent losses are closer (less negative), team is improving
    if (recentLossAvg > olderLossAvg + 3) {
      narrativeParts.push(`LOSSES GETTING CLOSER: Recent losses avg ${Math.abs(recentLossAvg).toFixed(0)} pts, older losses avg ${Math.abs(olderLossAvg).toFixed(0)} pts - team may be improving`);
    } else if (olderLossAvg > recentLossAvg + 5) {
      narrativeParts.push(`LOSSES GETTING WORSE: Recent losses avg ${Math.abs(recentLossAvg).toFixed(0)} pts, older losses avg ${Math.abs(olderLossAvg).toFixed(0)} pts - concerning trend`);
    }
  }
  
  return {
    // L5 Summary (primary)
    record: l5Data.record,
    last_5: l5Data.streak,
    games: l5Data.games,
    summary: l5Data.games.map(g => g.display).join(' | '),
    analysis: l5Data.analysis,
    
    // L10 Summary (extended view)
    L10: {
      record: l10Data.record,
      streak: l10Data.streak,
      gamesPlayed: l10Data.games.length,
      summary: l10Data.games.slice(0, 10).map(g => g.display).join(' | '),
      analysis: l10Data.analysis
    },
    
    // Trend comparison
    trend: {
      L5_win_pct: (l5WinPct * 100).toFixed(0) + '%',
      L10_win_pct: (l10WinPct * 100).toFixed(0) + '%',
      direction: trendDiff >= 0.2 ? 'UP' : trendDiff <= -0.2 ? 'DOWN' : 'STABLE',
      note: trendDiff >= 0.2 ? 'Recent form better than extended form' : 
            trendDiff <= -0.2 ? 'Recent form worse than extended form' : 
            'Consistent performance over L5 and L10'
    },
    
    // NEW: Last 2-3 games micro-trend (most recent indicator)
    micro_trend: {
      last_3_results: last3Results,
      last_3_record: `${last3Wins}-${last3Losses}`,
      last_3_margins: last3Games.map(g => g.margin),
      signal: microTrend || 'No clear micro-trend',
    },
    
    narrative: narrativeParts.length > 0 ? narrativeParts.join('. ') : 'No significant patterns detected.',
  };
}

function buildPaceAnalysis(homeStats, awayStats) {
  const homePace = homeStats?.pace || 0;
  const awayPace = awayStats?.pace || 0;
  const gap = Math.abs(homePace - awayPace);
  const projected = ((homePace + awayPace) / 2).toFixed(1);
  return `Pace differential: ${gap.toFixed(1)} possessions. Projected pace: ${projected}`;
}

function interpretTurnoverMargin(homeStats, awayStats) {
  const homeDiff = homeStats?.misc_turnover_differential || 0;
  const awayDiff = awayStats?.misc_turnover_differential || 0;
  
  const parts = [];
  if (Math.abs(homeDiff) > 6) {
    parts.push(`${homeStats?.team?.name || 'Home'}: turnover differential ${homeDiff > 0 ? '+' : ''}${homeDiff} — investigate`);
  }
  if (Math.abs(awayDiff) > 6) {
    parts.push(`${awayStats?.team?.name || 'Away'}: turnover differential ${awayDiff > 0 ? '+' : ''}${awayDiff} — investigate`);
  }

  return parts.length > 0 ? parts.join('; ') : 'Both teams near expected turnover rates';
}

/**
 * Introspection helpers (used for debugging / smoke testing token menus)
 */
export function listAvailableStatTokens() {
  return Object.keys(FETCHERS);
}

export default { fetchStats, listAvailableStatTokens };
