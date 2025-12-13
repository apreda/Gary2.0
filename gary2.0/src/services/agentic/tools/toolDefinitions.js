/**
 * OpenAI Function Calling Tool Definitions
 * 
 * This defines the "menu" of stats Gary can request.
 * Each token maps to a specific data fetch in statRouter.js
 */

// NBA Stat Tokens
const NBA_TOKENS = [
  // Standings & Records
  'STANDINGS', 'TEAM_RECORD', 'CONFERENCE_STANDING',
  // Pace & Tempo
  'PACE', 'PACE_LAST_10', 'PACE_HOME_AWAY',
  // Efficiency
  'OFFENSIVE_RATING', 'DEFENSIVE_RATING', 'NET_RATING', 'EFFICIENCY_LAST_10',
  // Four Factors
  'EFG_PCT', 'TURNOVER_RATE', 'OREB_RATE', 'FT_RATE',
  'OPP_EFG_PCT', 'OPP_TOV_RATE',
  // Shooting Zones
  'THREE_PT_SHOOTING', 'PAINT_SCORING', 'MIDRANGE',
  // Defense
  'PAINT_DEFENSE', 'PERIMETER_DEFENSE', 'TRANSITION_DEFENSE',
  // Situational
  'REST_SITUATION', 'CLUTCH_STATS', 'QUARTER_SPLITS',
  // Players
  'TOP_PLAYERS', 'INJURIES', 'LINEUP_DATA', 'USAGE_RATES',
  // History
  'H2H_HISTORY', 'RECENT_FORM', 'HOME_AWAY_SPLITS', 'VS_ELITE_TEAMS', 'ATS_TRENDS',
  // Advanced
  'LUCK_ADJUSTED', 'SCHEDULE_STRENGTH'
];

// NFL Stat Tokens
const NFL_TOKENS = [
  // Efficiency (EPA)
  'OFFENSIVE_EPA', 'DEFENSIVE_EPA', 'PASSING_EPA', 'RUSHING_EPA', 'EPA_LAST_5',
  // Success Rate
  'SUCCESS_RATE_OFFENSE', 'SUCCESS_RATE_DEFENSE', 'EARLY_DOWN_SUCCESS', 'LATE_DOWN_EFFICIENCY',
  // Explosiveness
  'EXPLOSIVE_PLAYS', 'EXPLOSIVE_ALLOWED',
  // Line Play
  'OL_RANKINGS', 'DL_RANKINGS', 'PRESSURE_RATE', 'TIME_TO_THROW',
  // Turnover Analysis
  'TURNOVER_MARGIN', 'TURNOVER_LUCK', 'FUMBLE_LUCK',
  // Situational
  'RED_ZONE_OFFENSE', 'RED_ZONE_DEFENSE', 'GOAL_LINE', 'TWO_MINUTE_DRILL',
  // Special Teams
  'SPECIAL_TEAMS', 'KICKING', 'FIELD_POSITION',
  // Players
  'QB_STATS', 'RB_STATS', 'WR_TE_STATS', 'DEFENSIVE_PLAYMAKERS', 'INJURIES',
  // Context
  'WEATHER', 'REST_SITUATION', 'DIVISION_RECORD', 'PRIMETIME_RECORD',
  // Historical
  'H2H_HISTORY', 'ATS_TRENDS', 'RECENT_FORM'
];

// NCAAB Stat Tokens
const NCAAB_TOKENS = [
  // Adjusted Efficiency
  'ADJ_OFFENSIVE_EFF', 'ADJ_DEFENSIVE_EFF', 'ADJ_EFFICIENCY_MARGIN', 'EFFICIENCY_TREND',
  // Tempo
  'TEMPO', 'TEMPO_CONTROL',
  // Four Factors
  'EFG_PCT', 'OPP_EFG_PCT', 'TURNOVER_RATE', 'OPP_TOV_RATE',
  'OREB_RATE', 'DREB_RATE', 'FT_RATE', 'OPP_FT_RATE',
  // Shooting
  'THREE_PT_SHOOTING', 'THREE_PT_DEFENSE', 'TWO_PT_SHOOTING',
  // Context
  'HOME_COURT_VALUE', 'ROAD_PERFORMANCE', 'CONFERENCE_STATS', 'NON_CONF_STRENGTH',
  // Players
  'TOP_PLAYERS', 'INJURIES', 'EXPERIENCE', 'BENCH_DEPTH',
  // Historical
  'RECENT_FORM', 'H2H_HISTORY', 'VS_RANKED', 'CLOSE_GAME_RECORD', 'ATS_TRENDS'
];

// NCAAF Stat Tokens
const NCAAF_TOKENS = [
  // SP+ / Advanced
  'SP_PLUS_RATINGS', 'SP_PLUS_TREND', 'FEI_RATINGS',
  // Efficiency
  'OFFENSIVE_EPA', 'DEFENSIVE_EPA', 'SUCCESS_RATE', 'EXPLOSIVENESS',
  // Havoc
  'HAVOC_RATE', 'HAVOC_ALLOWED',
  // Talent
  'TALENT_COMPOSITE', 'BLUE_CHIP_RATIO', 'TRANSFER_PORTAL',
  // Line Play
  'OL_RANKINGS', 'DL_RANKINGS', 'STUFF_RATE',
  // Situational
  'RED_ZONE', 'THIRD_DOWN', 'FOURTH_DOWN',
  // Special Teams
  'SPECIAL_TEAMS_RATING', 'FIELD_POSITION',
  // Context
  'MOTIVATION_CONTEXT', 'WEATHER', 'HOME_FIELD', 'NIGHT_GAME',
  // Players
  'QB_STATS', 'RB_STATS', 'WR_STATS', 'DEFENSIVE_STARS', 'INJURIES',
  // Historical
  'RECENT_FORM', 'CONFERENCE_RECORD', 'VS_RANKED', 'ATS_TRENDS'
];

// NHL Stat Tokens (BETA - uses BDL + Perplexity for advanced stats)
const NHL_TOKENS = [
  // Standings & Records
  'STANDINGS', 'TEAM_RECORD', 'CONFERENCE_STANDING', 'DIVISION_STANDING',
  // Special Teams (critical in hockey)
  'POWER_PLAY_PCT', 'PENALTY_KILL_PCT', 'SPECIAL_TEAMS', 'PP_OPPORTUNITIES',
  // Scoring
  'GOALS_FOR', 'GOALS_AGAINST', 'GOAL_DIFFERENTIAL', 'SCORING_FIRST',
  // Shot Metrics (Corsi proxy)
  'SHOTS_FOR', 'SHOTS_AGAINST', 'SHOT_DIFFERENTIAL', 'SHOT_QUALITY',
  // Advanced (via Perplexity)
  'CORSI_FOR_PCT', 'EXPECTED_GOALS', 'PDO', 'HIGH_DANGER_CHANCES',
  // Goaltending
  'GOALIE_STATS', 'SAVE_PCT', 'GOALS_AGAINST_AVG', 'GOALIE_MATCHUP',
  // Situational
  'REST_SITUATION', 'BACK_TO_BACK', 'HOME_ICE', 'ROAD_PERFORMANCE',
  // Faceoffs & Possession
  'FACEOFF_PCT', 'POSSESSION_METRICS',
  // Players
  'TOP_SCORERS', 'TOP_PLAYERS', 'INJURIES', 'LINE_COMBINATIONS',
  // Historical
  'H2H_HISTORY', 'RECENT_FORM', 'HOME_AWAY_SPLITS', 'ATS_TRENDS',
  // Luck/Regression
  'LUCK_INDICATORS', 'CLOSE_GAME_RECORD', 'OVERTIME_RECORD'
];

// EPL Stat Tokens (BETA - uses BDL + Perplexity for advanced analytics)
const EPL_TOKENS = [
  // Standings & Records
  'STANDINGS', 'TEAM_RECORD', 'LEAGUE_POSITION', 'HOME_RECORD', 'AWAY_RECORD',
  // Goals & Scoring
  'GOALS_FOR', 'GOALS_AGAINST', 'GOAL_DIFFERENTIAL', 'CLEAN_SHEETS',
  // Advanced Metrics (via Perplexity)
  'EXPECTED_GOALS', 'XG_DIFFERENCE', 'XG_OVERPERFORMANCE', 'SHOT_QUALITY',
  // Possession & Passing
  'POSSESSION_PCT', 'PASS_ACCURACY', 'TOUCHES_IN_BOX', 'CROSSES',
  // Defensive Metrics
  'TACKLES', 'INTERCEPTIONS', 'CLEARANCES', 'SAVES',
  // Attack Metrics
  'SHOTS_ON_TARGET', 'SHOTS_TOTAL', 'BIG_CHANCES_CREATED', 'BIG_CHANCES_MISSED',
  // Set Pieces
  'CORNERS', 'FREE_KICKS', 'PENALTIES_WON', 'PENALTIES_CONCEDED',
  // Discipline
  'YELLOW_CARDS', 'RED_CARDS', 'FOULS',
  // Form & Momentum
  'RECENT_FORM', 'HOME_FORM', 'AWAY_FORM', 'LAST_5_RESULTS',
  // Players
  'TOP_SCORERS', 'TOP_ASSISTS', 'INJURIES', 'KEY_PLAYERS',
  // Historical
  'H2H_HISTORY', 'HEAD_TO_HEAD', 'DRAW_FREQUENCY',
  // Context
  'FIXTURE_CONGESTION', 'EUROPEAN_FOOTBALL', 'MOTIVATION'
];

// Combine all tokens by sport
const ALL_TOKENS_BY_SPORT = {
  NBA: NBA_TOKENS,
  NFL: NFL_TOKENS,
  NCAAB: NCAAB_TOKENS,
  NCAAF: NCAAF_TOKENS,
  NHL: NHL_TOKENS,
  EPL: EPL_TOKENS
};

// Get all unique tokens across all sports
const ALL_TOKENS = [...new Set([
  ...NBA_TOKENS,
  ...NFL_TOKENS,
  ...NCAAB_TOKENS,
  ...NCAAF_TOKENS,
  ...NHL_TOKENS,
  ...EPL_TOKENS
])];

/**
 * OpenAI Tool Definition for fetch_stats function
 * This is the schema that tells OpenAI what Gary can request
 */
export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "fetch_stats",
      description: `Fetches specific statistical data for the matchup analysis. 
Use this to request the exact stats you need to verify your hypothesis.
Only request stats that are directly relevant to your analysis - don't request everything.
Typical analysis needs 2-5 stat categories.`,
      parameters: {
        type: "object",
        properties: {
          sport: {
            type: "string",
            enum: ["NBA", "NFL", "NCAAB", "NCAAF", "NHL", "EPL"],
            description: "The sport league"
          },
          token: {
            type: "string",
            enum: ALL_TOKENS,
            description: "The specific stat category to fetch"
          },
          team: {
            type: "string",
            description: "Optional: specific team to focus on (if omitted, returns both teams)"
          }
        },
        required: ["sport", "token"]
      }
    }
  }
];

/**
 * Get available tokens for a specific sport
 */
export function getTokensForSport(sport) {
  return ALL_TOKENS_BY_SPORT[sport] || [];
}

/**
 * Format tokens as a display string for the prompt
 */
export function formatTokenMenu(sport) {
  const tokens = getTokensForSport(sport);
  if (!tokens.length) return '';
  
  // Group tokens by category for better readability
  const grouped = {};
  tokens.forEach(token => {
    // Extract category from token name (before first underscore or whole name)
    let category = 'General';
    if (token.includes('_')) {
      const parts = token.split('_');
      if (['OFFENSIVE', 'DEFENSIVE', 'PASSING', 'RUSHING'].includes(parts[0])) {
        category = 'Efficiency';
      } else if (['THREE', 'TWO', 'PAINT', 'PERIMETER'].includes(parts[0])) {
        category = 'Shooting/Defense';
      } else if (['TOP', 'QB', 'RB', 'WR'].includes(parts[0])) {
        category = 'Players';
      } else if (['H2H', 'ATS', 'RECENT', 'VS'].includes(parts[0])) {
        category = 'Historical';
      } else if (['REST', 'WEATHER', 'HOME', 'MOTIVATION'].includes(parts[0])) {
        category = 'Situational';
      } else if (['ADJ', 'SP', 'FEI', 'LUCK'].includes(parts[0])) {
        category = 'Advanced';
      } else if (['RED', 'GOAL', 'THIRD', 'FOURTH', 'CLUTCH'].includes(parts[0])) {
        category = 'Situational';
      } else if (['OL', 'DL', 'PRESSURE', 'HAVOC'].includes(parts[0])) {
        category = 'Line Play';
      } else if (['TURNOVER', 'FUMBLE'].includes(parts[0])) {
        category = 'Turnovers';
      } else if (['SPECIAL', 'KICKING', 'FIELD'].includes(parts[0])) {
        category = 'Special Teams';
      } else {
        category = parts[0].charAt(0) + parts[0].slice(1).toLowerCase();
      }
    } else {
      category = 'Core';
    }
    
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(token);
  });
  
  let output = '';
  for (const [category, categoryTokens] of Object.entries(grouped)) {
    output += `\n${category}: ${categoryTokens.map(t => `[${t}]`).join(' ')}`;
  }
  
  return output.trim();
}

export { NBA_TOKENS, NFL_TOKENS, NCAAB_TOKENS, NCAAF_TOKENS, NHL_TOKENS, ALL_TOKENS };

