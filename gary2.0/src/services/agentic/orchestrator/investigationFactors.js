/**
 * Investigation Factors — per-sport factor-to-token mapping
 *
 * Used by Flash research assistant for coverage validation
 * and by the test suite for factor structure verification.
 *
 * Pure data + pure functions. Zero external imports.
 */

export const INVESTIGATION_FACTORS = {
  // NFL: 18 factor categories
  americanfootball_nfl: {
    EFFICIENCY: ['OFFENSIVE_EPA', 'DEFENSIVE_EPA', 'PASSING_EPA', 'RUSHING_EPA', 'SUCCESS_RATE_OFFENSE', 'SUCCESS_RATE_DEFENSE'],
    DOWN_EFFICIENCY: ['EARLY_DOWN_SUCCESS', 'LATE_DOWN_EFFICIENCY'], // Critical for drives
    TRENCHES: ['OL_RANKINGS', 'DL_RANKINGS', 'PRESSURE_RATE', 'TIME_TO_THROW'],
    QB_SITUATION: ['QB_STATS', 'PLAYER_GAME_LOGS'], // QB performance and game logs
    SKILL_PLAYERS: ['RB_STATS', 'WR_TE_STATS', 'DEFENSIVE_PLAYMAKERS'], // Key playmakers
    TURNOVERS: ['TURNOVER_MARGIN', 'TURNOVER_LUCK', 'FUMBLE_LUCK'],
    RED_ZONE: ['RED_ZONE_OFFENSE', 'RED_ZONE_DEFENSE', 'GOAL_LINE'],
    EXPLOSIVE_PLAYS: ['EXPLOSIVE_PLAYS', 'EXPLOSIVE_ALLOWED'],
    SPECIAL_TEAMS: ['SPECIAL_TEAMS', 'KICKING', 'FIELD_POSITION'],
    RECENT_FORM: ['RECENT_FORM', 'EPA_LAST_5'],
    INJURIES: ['INJURIES'], // From scout report + player logs
    SCHEDULE: ['REST_SITUATION', 'HOME_AWAY_SPLITS', 'SCHEDULE_CONTEXT'],
    STANDINGS_CONTEXT: ['STANDINGS', 'DIVISION_RECORD'], // Playoff picture, standings
    H2H_DIVISION: ['H2H_HISTORY'],
    MOTIVATION: ['PRIMETIME_RECORD'], // SNF/MNF/TNF performance
    COACHING: ['FOURTH_DOWN_TENDENCY', 'TWO_MINUTE_DRILL'],
    SCORING_TRENDS: ['QUARTER_SCORING', 'FIRST_HALF_TRENDS', 'SECOND_HALF_TRENDS'],
    VARIANCE_CONSISTENCY: ['VARIANCE_CONSISTENCY'] // Point differential variance, upset potential
  },

  // NBA: 11 factor categories
  basketball_nba: {
    EFFICIENCY: ['NET_RATING', 'OFFENSIVE_RATING', 'DEFENSIVE_RATING'],
    PACE_TEMPO: ['PACE', 'PACE_LAST_10', 'PACE_HOME_AWAY'],
    FOUR_FACTORS: ['EFG_PCT', 'TURNOVER_RATE', 'OREB_RATE', 'FT_RATE', 'DREB_RATE'],
    SHOOTING_STYLE: ['THREE_PT_SHOOTING'], // Scoring profile (paint/mid/3pt/fastbreak %) is in scout report via BDL V2
    STANDINGS_CONTEXT: ['STANDINGS', 'CONFERENCE_STANDING'],
    RECENT_FORM: ['RECENT_FORM', 'EFFICIENCY_TREND', 'FIRST_HALF_SCORING', 'SECOND_HALF_SCORING'],
    INJURIES: ['INJURIES'],
    SCHEDULE: ['REST_SITUATION', 'BACK_TO_BACK', 'TRAVEL_SITUATION', 'SCHEDULE_STRENGTH'],
    H2H: ['H2H_HISTORY', 'VS_ELITE_TEAMS'],
    PLAYER_PERFORMANCE: ['PLAYER_GAME_LOGS', 'TOP_PLAYERS', 'USAGE_RATES'],
    ROSTER_CONTEXT: ['BENCH_DEPTH', 'CLUTCH_STATS', 'BLOWOUT_TENDENCY', 'LUCK_ADJUSTED']
  },

  // NHL: 17 factor categories
  icehockey_nhl: {
    POSSESSION: ['CORSI_FOR_PCT', 'EXPECTED_GOALS', 'SHOT_DIFFERENTIAL', 'HIGH_DANGER_CHANCES', 'SHOT_QUALITY'],
    SHOT_VOLUME: ['SHOTS_FOR', 'SHOTS_AGAINST', 'SHOT_METRICS'], // Raw shot data
    SPECIAL_TEAMS: ['POWER_PLAY_PCT', 'PENALTY_KILL_PCT', 'SPECIAL_TEAMS', 'PP_OPPORTUNITIES'],
    GOALTENDING: ['GOALIE_STATS', 'SAVE_PCT', 'GOALS_AGAINST_AVG', 'GOALIE_MATCHUP'],
    SCORING: ['GOALS_FOR', 'GOALS_AGAINST', 'GOAL_DIFFERENTIAL'],
    LUCK_REGRESSION: ['PDO', 'LUCK_INDICATORS', 'SHOOTING_REGRESSION'], // Regression indicators + shooting % regression
    CLOSE_GAMES: ['CLOSE_GAME_RECORD', 'OVERTIME_RECORD', 'ONE_GOAL_GAMES'], // Clutch performance
    RECENT_FORM: ['RECENT_FORM', 'PLAYER_GAME_LOGS'],
    PLAYER_PERFORMANCE: ['TOP_SCORERS', 'TOP_PLAYERS', 'LINE_COMBINATIONS', 'HOT_PLAYERS'],
    INJURIES: ['INJURIES'],
    SCHEDULE: ['REST_SITUATION', 'BACK_TO_BACK'],
    HOME_AWAY: ['HOME_AWAY_SPLITS', 'HOME_ICE', 'ROAD_PERFORMANCE'],
    H2H_DIVISION: ['H2H_HISTORY', 'DIVISION_STANDING', 'FACEOFF_PCT', 'POSSESSION_METRICS'],
    // NEW FACTORS (from BDL NHL API)
    STANDINGS_CONTEXT: ['STANDINGS', 'POINTS_PCT', 'STREAK', 'PLAYOFF_POSITION'], // Playoff picture
    SCORING_TRENDS: ['QUARTER_SCORING', 'FIRST_HALF_TRENDS', 'SECOND_HALF_TRENDS'], // Period-by-period patterns (uses shared period/half fetchers)
    ROSTER_DEPTH: ['TOP_PLAYERS', 'PLAYER_GAME_LOGS'], // Depth analysis from player stats
    VARIANCE_CONSISTENCY: ['REGULATION_WIN_PCT', 'MARGIN_VARIANCE'] // Consistency metrics
  },

  // NCAAB: 15 factor categories
  // Scout report provides CONTEXT: injuries, roster depth, standings, rankings, recent form, H2H, venue
  // Advanced stats (Barttorvik, Four Factors, Splits, L5 Efficiency) are investigation tokens
  basketball_ncaab: {
    BARTTORVIK_EFFICIENCY: ['NCAAB_BARTTORVIK', 'NCAAB_OFFENSIVE_RATING', 'NCAAB_DEFENSIVE_RATING', 'NET_RATING'],
    FOUR_FACTORS: ['NCAAB_FOUR_FACTORS', 'NCAAB_EFG_PCT', 'NCAAB_TS_PCT', 'TURNOVER_RATE', 'OREB_RATE', 'FT_RATE'],
    SCORING_SHOOTING: ['SCORING', 'FG_PCT', 'THREE_PT_SHOOTING'],
    DEFENSIVE_STATS: ['STEALS', 'BLOCKS'],
    TEMPO: ['NCAAB_TEMPO'],
    L5_EFFICIENCY: ['NCAAB_L5_EFFICIENCY'],
    RECENT_FORM: ['RECENT_FORM', 'PLAYER_GAME_LOGS'],
    PLAYER_PERFORMANCE: ['PLAYER_GAME_LOGS', 'TOP_PLAYERS'],
    INJURIES: ['INJURIES'],     // Baseline in scout report; token for deeper investigation
    SCHEDULE: ['REST_SITUATION', 'SCHEDULE_STRENGTH'],
    HOME_AWAY: ['HOME_AWAY_SPLITS', 'NCAAB_VENUE'],
    H2H: ['H2H_HISTORY'],          // H2H in scout report; token for additional matchup data
    STANDINGS_CONTEXT: [],  // Conference standings in scout report — preloaded
    RANKINGS: []  // AP/Coaches rankings in scout report — preloaded
  },

  // NCAAF: 16 factor categories
  // NOTE: BDL has limited NCAAF data - advanced stats (SP+, FPI, EPA) come from Gemini grounding
  americanfootball_ncaaf: {
    ADVANCED_EFFICIENCY: ['NCAAF_SP_PLUS_RATINGS', 'NCAAF_FPI_RATINGS', 'NCAAF_EPA'],
    SUCCESS_RATE: ['NCAAF_SUCCESS_RATE'],
    TRENCHES: ['NCAAF_PASS_EFFICIENCY', 'NCAAF_RUSH_EFFICIENCY', 'OL_RANKINGS', 'DL_RANKINGS', 'PRESSURE_RATE'],
    OFFENSE: ['NCAAF_PASSING_OFFENSE', 'NCAAF_RUSHING_OFFENSE', 'NCAAF_TOTAL_OFFENSE'],
    DEFENSE: ['NCAAF_DEFENSE'],
    QB_SITUATION: ['QB_STATS', 'TOP_PLAYERS', 'PLAYER_GAME_LOGS'],
    HAVOC: ['NCAAF_HAVOC', 'NCAAF_TURNOVER_MARGIN', 'TURNOVER_LUCK'],
    EXPLOSIVE_PLAYS: ['NCAAF_EXPLOSIVE_PLAYS'],
    RED_ZONE: ['NCAAF_REDZONE'],
    RECENT_FORM: ['RECENT_FORM', 'SCORING'],
    CLOSE_GAMES: ['CLOSE_GAME_RECORD'], // Clutch performance
    INJURIES: ['INJURIES', 'TOP_PLAYERS'], // Critical for opt-outs
    HOME_FIELD: ['HOME_AWAY_SPLITS'],
    MOTIVATION: [], // Bowl game, rivalry, playoff implications — use fetch_narrative_context
    SCHEDULE_QUALITY: ['NCAAF_STRENGTH_OF_SCHEDULE', 'NCAAF_CONFERENCE_STRENGTH', 'NCAAF_VS_POWER_OPPONENTS']
  },

  // MLB/WBC: 7 factor categories
  baseball_mlb: {
    STARTING_PITCHING: ['MLB_STARTING_PITCHERS'],
    BULLPEN: ['MLB_BULLPEN'],
    HITTING: ['MLB_KEY_HITTERS', 'MLB_LINEUP', 'TOP_PLAYERS'],
    STANDINGS: ['STANDINGS', 'MLB_WBC_RESULTS'],
    ODDS: ['MLB_ODDS'],
    REST_SCHEDULE: ['REST_SITUATION', 'RECENT_FORM'],
    INJURIES: ['INJURIES'],
  }
};

/**
 * Get investigated factors based on tokens called
 * @param {Array} toolCallHistory - Array of tool calls with token property
 * @param {string} sport - Sport key
 * @param {Array} preloadedFactors - Factors already covered by scout report (e.g., INJURIES)
 * @returns {Object} - { covered: [...], missing: [...], coverage: 0.0-1.0 }
 */
export function getInvestigatedFactors(toolCallHistory, sport, preloadedFactors = []) {
  const factors = INVESTIGATION_FACTORS[sport];
  if (!factors) {
    throw new Error(`[HARD FAIL] Unknown sport "${sport}" — no investigation factors defined. Add factors to INVESTIGATION_FACTORS or fix the sport key.`);
  }

  // Get all unique tokens called that returned real data (not errors/proxies with no data)
  const calledTokens = toolCallHistory
    .filter(t => t.token && t.quality !== 'unavailable')
    .map(t => t.token);

  // Convert preloadedFactors to a Set for fast lookup
  const preloaded = new Set(preloadedFactors);

  const covered = [];
  const missing = [];

  for (const [factorName, requiredTokens] of Object.entries(factors)) {
    // Factor is covered if:
    // 1. It's in preloadedFactors (e.g., INJURIES from scout report), OR
    // 2. ANY of its required tokens were called (using PREFIX matching for player-specific tokens)
    //    e.g., PLAYER_GAME_LOGS:Donovan Mitchell matches PLAYER_GAME_LOGS
    const isPreloaded = preloaded.has(factorName);
    const isCalled = requiredTokens.some(token =>
      calledTokens.some(called =>
        called === token || called.startsWith(token + ':') || called.startsWith(token + '_')
      )
    );

    if (isPreloaded || isCalled) {
      covered.push(factorName);
    } else {
      missing.push(factorName);
    }
  }

  const totalFactors = Object.keys(factors).length;
  const coverage = covered.length / totalFactors;

  return { covered, missing, coverage, totalFactors };
}

/**
 * Get human-readable token hints for a missing factor
 * e.g., "DEFENSIVE_STATS (call: REBOUNDS or STEALS or BLOCKS)"
 */
export function getTokenHints(sport, factorName) {
  const factors = INVESTIGATION_FACTORS[sport];
  if (!factors || !factors[factorName]) return factorName;
  const tokens = factors[factorName];
  return `${factorName} (call: ${tokens.join(' or ')})`;
}

/**
 * Build factor checklist prompt for a sport
 * @param {string} sport - Sport key
 * @returns {string} - Checklist prompt
 */
export function buildFactorChecklist(sport) {
  const factors = INVESTIGATION_FACTORS[sport];
  if (!factors) return '';

  // Collect all available tokens for reference (constitution has the awareness list)
  const allTokens = [];
  for (const tokens of Object.values(factors)) {
    allTokens.push(...tokens.filter(t => t));
  }
  if (allTokens.length === 0) return '';

  return `\n**Available stat tokens for investigation:** ${allTokens.join(', ')}\n`;
}
