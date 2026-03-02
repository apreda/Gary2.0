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
 * │   (SCORING_FIRST removed)                                                 │
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

import { ballDontLieService } from '../../../ballDontLieService.js';
import { geminiGroundingSearch, getGroundedWeather } from '../../scoutReport/scoutReportBuilder.js';
import { isGameCompleted, formatStatValue, safeStatValue } from '../../sharedUtils.js';
// Highlightly stripped to venue-only — H2H now uses BDL directly
import { getNcaabVenue } from '../../../ncaabVenueService.js';
import { nbaSeason, nhlSeason, nflSeason, ncaabSeason } from '../../../../utils/dateUtils.js';
import { getTeamRatings as getBarttovikRatings } from '../../../ncaabMetricsService.js';

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

// NHL: Stats that require Gemini (most now use MoneyPuck/NHL API directly)
const NHL_GEMINI_TOKENS = [
  // These tokens NOW use MoneyPuck CSV + NHL API (no Grounding needed):
  // CORSI_FOR_PCT, EXPECTED_GOALS, PDO, HIGH_DANGER_CHANCES,
  // NHL_GSAX, NHL_HIGH_DANGER_SV_PCT, LUCK_INDICATORS, SHOOTING_REGRESSION
  // SCORING_FIRST removed — no API source and not needed
  'LINE_COMBINATIONS',    // Projected lines - site:dailyfaceoff.com
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
  
  // NHL sources (most now use MoneyPuck/NHL API directly — only LINE_COMBINATIONS still uses Grounding)
  if (token === 'LINE_COMBINATIONS') {
    return 'site:dailyfaceoff.com OR site:leftwinglock.com OR site:nhl.com';
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

    const structureNote = `Top 2: ${top2Usage.toFixed(0)}%, Top 3: ${top3Usage.toFixed(0)}% combined usage`;

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
        topPlayers = playerStats.slice(0, 10).map(ps => ({
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

async function fetchTopPlayersForTeam(bdlSport, team, season) {
  if (!team || !team.id) {
    throw new Error(`[HARD FAIL] fetchTopPlayersForTeam called with undefined/invalid team (bdlSport=${bdlSport}, season=${season}). This indicates a team resolution bug upstream — the team name could not be mapped to a BDL team ID.`);
  }
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
    
    // NHL: Use team roster + individual season stats (BDL NHL doesn't support generic getPlayerStats)
    if (bdlSport === 'icehockey_nhl') {
      const roster = await ballDontLieService.getNhlTeamPlayers(team.id, season);
      if (!roster || roster.length === 0) {
        return [{ note: 'No NHL player stats available' }];
      }
      // Fetch season stats for all skaters (exclude goalies for scoring stats)
      const skaters = roster.filter(p => (p.position || '').toUpperCase() !== 'G').slice(0, 22);
      const statsPromises = skaters.map(p => ballDontLieService.getNhlPlayerSeasonStats(p.id, season).catch(() => []));
      const allStats = await Promise.all(statsPromises);
      const playerStats = skaters.map((p, i) => {
        const stats = allStats[i] || [];
        const statMap = {};
        for (const s of stats) { if (s.name && s.value != null) statMap[s.name] = s.value; }
        return {
          player: p,
          goals: Number(statMap.goals || 0),
          assists: Number(statMap.assists || 0),
          points: Number(statMap.goals || 0) + Number(statMap.assists || 0),
          games: Number(statMap.games_played || 0)
        };
      }).filter(p => p.games > 0);
      const sorted = playerStats.sort((a, b) => b.points - a.points).slice(0, 12);
      return sorted.map(p => ({
        name: `${p.player?.first_name || ''} ${p.player?.last_name || ''}`.trim(),
        position: p.player?.position || 'N/A',
        games: p.games,
        points: p.points,
        goals: p.goals,
        assists: p.assists,
        ppg: fmtNum(p.points / p.games),
        gpg: fmtNum(p.goals / p.games)
      }));
    }

    // Default path for other sports (NBA, NFL)
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
      
      let result = 'T';
      if (teamScore > oppScore) {
        wins++;
        result = 'W';
        if (absMargin <= 7) closeWins++;
        else if (absMargin >= 14) blowoutWins++;
      } else if (oppScore > teamScore) {
        losses++;
        result = 'L';
        if (absMargin <= 7) closeLosses++;
        else if (absMargin >= 14) blowoutLosses++;
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
      }
    };
  };
  
  // Process L5 and L10
  const l5Games = completedGames.slice(0, 5);
  const l10Games = completedGames.slice(0, 10);
  
  const l5Data = processGames(l5Games);
  const l10Data = processGames(l10Games);
  
  // Compare L5 vs L10 trend
  const l5WinPct = l5Data.analysis.wins / (l5Data.analysis.wins + l5Data.analysis.losses) || 0;
  const l10WinPct = l10Data.analysis.wins / (l10Data.analysis.wins + l10Data.analysis.losses) || 0;
  const trendDiff = l5WinPct - l10WinPct;

  // Last 3 games (most recent first)
  const last3Games = l5Data.games.slice(0, 3);
  const last3Results = last3Games.map(g => g.result).join('');
  const last3Wins = last3Games.filter(g => g.result === 'W').length;
  const last3Losses = last3Games.filter(g => g.result === 'L').length;

  return {
    record: l5Data.record,
    last_5: l5Data.streak,
    games: l5Data.games,
    summary: l5Data.games.map(g => g.display).join(' | '),
    analysis: l5Data.analysis,

    L10: {
      record: l10Data.record,
      streak: l10Data.streak,
      gamesPlayed: l10Data.games.length,
      summary: l10Data.games.slice(0, 10).map(g => g.display).join(' | '),
      analysis: l10Data.analysis
    },

    trend: {
      L5_win_pct: (l5WinPct * 100).toFixed(0) + '%',
      L10_win_pct: (l10WinPct * 100).toFixed(0) + '%',
      diff: (trendDiff * 100).toFixed(0) + '%'
    },

    last_3: {
      results: last3Results,
      record: `${last3Wins}-${last3Losses}`,
      margins: last3Games.map(g => g.margin),
    },
  };
}

function buildPaceAnalysis(homeStats, awayStats) {
  const homePace = homeStats?.pace || 0;
  const awayPace = awayStats?.pace || 0;
  const gap = Math.abs(homePace - awayPace);
  const projected = ((homePace + awayPace) / 2).toFixed(1);
  return `Pace differential: ${gap.toFixed(1)} possessions. Projected pace: ${projected}`;
}




export { getCurrentSeasonString, sportToBdlKey, normalizeSportName, findTeam, fmtNum, fmtPct, fetchBothTeamSeasonStats, fetchNBATeamScoringStats, fetchNBATeamAdvancedStats, fetchNBALeaders, fetchNBATeamBaseStats, fetchNBATeamOpponentStats, fetchNBATeamDefenseStats, fetchTopPlayersForTeam, formatRecentGames, buildPaceAnalysis, BDL_API_KEY, DEPRECATED_TOKENS, SPORT_SPECIFIC_ROUTING, _nbaBaseStatsCache, _nbaAdvancedStatsCache, _nbaOpponentStatsCache, _nbaDefenseStatsCache, _nbaTeamScoringStatsCache };

// Re-export imported dependencies for fetcher sub-modules
export { geminiGroundingSearch, getGroundedWeather } from '../../scoutReport/scoutReportBuilder.js';
export { isGameCompleted } from '../../sharedUtils.js';
export { getNcaabVenue } from '../../../ncaabVenueService.js';
export { getTeamRatings as getBarttovikRatings } from '../../../ncaabMetricsService.js';
