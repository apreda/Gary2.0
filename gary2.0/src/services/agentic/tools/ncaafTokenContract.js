/** College-only tool contract. Every advertised token has a deterministic
 * college adapter; provider unavailability remains explicit in its response. */
export const NCAAF_CANONICAL_TOKENS = [
  'NCAAF_OL_RANKINGS',
  'NCAAF_DL_RANKINGS',
  'NCAAF_PASSING_OFFENSE',
  'NCAAF_RUSHING_OFFENSE',
  'NCAAF_TOTAL_OFFENSE',
  'NCAAF_DEFENSE',
  'NCAAF_SCORING',
  'NCAAF_TURNOVER_MARGIN',
  'NCAAF_RECENT_FORM',
  'NCAAF_HOME_AWAY_SPLITS',
  'NCAAF_CLOSE_GAME_RECORD',
  'NCAAF_INJURIES',
  'NCAAF_PASS_EFFICIENCY',
  'NCAAF_RUSH_EFFICIENCY',
  'NCAAF_PLAYER_GAME_LOGS',
  'NCAAF_RANKINGS_CONTEXT',
  'NCAAF_HAVOC',
  'NCAAF_PRESSURE_RATE',
  'NCAAF_SP_PLUS_RATINGS',
  'NCAAF_FPI_RATINGS',
  'NCAAF_STRENGTH_OF_SCHEDULE',
  'NCAAF_CONFERENCE_STRENGTH',
  'NCAAF_VS_POWER_OPPONENTS',
  'NCAAF_QB_STATS',
  'NCAAF_TURNOVER_LUCK',
  'NCAAF_SUCCESS_RATE',
  'NCAAF_EXPLOSIVE_PLAYS',
  'NCAAF_EPA',
  'NCAAF_REDZONE',
];

// Alternate names requested by the investigation checklist. Explosiveness
// includes offense AND defense; its response states the actual CFBD metric.
export const NCAAF_TOKEN_ALIASES = {
  NCAAF_SCHEDULE_STRENGTH: 'NCAAF_STRENGTH_OF_SCHEDULE',
  NCAAF_EXPLOSIVE_ALLOWED: 'NCAAF_EXPLOSIVE_PLAYS',
};
export const NCAAF_TOKENS = [...new Set([
  ...NCAAF_CANONICAL_TOKENS,
  ...Object.keys(NCAAF_TOKEN_ALIASES),
  ...NCAAF_CANONICAL_TOKENS.map(token => token.slice(6)),
  ...Object.keys(NCAAF_TOKEN_ALIASES).map(token => token.slice(6)),
  'H2H_HISTORY',
])];
