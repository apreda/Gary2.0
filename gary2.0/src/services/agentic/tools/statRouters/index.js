import { isGeminiToken, getAuthoritativeSource, clearStatRouterCache, DEPRECATED_TOKENS, sportToBdlKey, normalizeSportName, findTeam } from './statRouterCommon.js';
import { ballDontLieService } from '../../../ballDontLieService.js';
import { nbaSeason, nhlSeason, nflSeason, ncaabSeason } from '../../../../utils/dateUtils.js';
import { nbaFetchers } from './nbaFetchers.js';
import { nhlFetchers } from './nhlFetchers.js';
import { nflFetchers } from './nflFetchers.js';
import { ncaabFetchers } from './ncaabFetchers.js';
import { ncaafFetchers } from './ncaafFetchers.js';

// Merge all fetchers into one object
const FETCHERS = {
  ...nbaFetchers,
  ...ncaabFetchers,
  ...ncaafFetchers,
  ...nflFetchers,
  ...nhlFetchers,
};

// Aliases
const ALIASES = {
  // ═══════════════════════════════════════════════════════════════════════════
  // NHL ALIASES - All advanced stats now have REAL fetchers!
  // ═══════════════════════════════════════════════════════════════════════════
  SHOT_METRICS: 'SHOT_DIFFERENTIAL',
  SHOT_QUALITY: 'HIGH_DANGER_CHANCES',
  SAVE_PCT: 'GOALIE_STATS',
  GOALS_AGAINST_AVG: 'GOALIE_STATS',
  GOALIE_MATCHUP: 'GOALIE_STATS',
  PP_OPPORTUNITIES: 'SPECIAL_TEAMS',
  BACK_TO_BACK: 'REST_SITUATION',
  HOME_ICE: 'HOME_AWAY_SPLITS',
  ROAD_PERFORMANCE: 'HOME_AWAY_SPLITS',
  POSSESSION_METRICS: 'CORSI_FOR_PCT',
  TOP_SCORERS: 'TOP_PLAYERS',
  DIVISION_STANDING: 'STANDINGS',
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
  EFFICIENCY_LAST_10: 'EFFICIENCY_TREND',
  PERIMETER_DEFENSE: 'THREE_PT_DEFENSE',
  QUARTER_SPLITS: 'QUARTER_SCORING',
  LINEUP_DATA: 'TOP_PLAYERS',
  FIRST_HALF_SCORING: 'FIRST_HALF_TRENDS',
  SECOND_HALF_SCORING: 'SECOND_HALF_TRENDS',
  TEMPO_CONTROL: 'PACE',
  TWO_PT_SHOOTING: 'EFG_PCT',
  HOME_COURT_VALUE: 'HOME_AWAY_SPLITS',
  EXPERIENCE: 'TOP_PLAYERS',
  VS_RANKED: 'VS_ELITE_TEAMS',
  CLOSE_GAME_RECORD: 'CLUTCH_STATS',
  SP_PLUS_RATINGS: 'NET_RATING',
  SP_PLUS_TREND: 'NET_RATING',
  FEI_RATINGS: 'NET_RATING',
  TALENT_COMPOSITE: 'TOP_PLAYERS',
  BLUE_CHIP_RATIO: 'TOP_PLAYERS',
  TRANSFER_PORTAL: 'TOP_PLAYERS',
  STRENGTH_OF_SCHEDULE: 'NCAAF_STRENGTH_OF_SCHEDULE',
  OPPONENT_ADJUSTED: 'NCAAF_OPPONENT_ADJUSTED',
  CONFERENCE_STRENGTH: 'NCAAF_CONFERENCE_STRENGTH',
  VS_POWER_OPPONENTS: 'NCAAF_VS_POWER_OPPONENTS',
  TRAVEL_FATIGUE: 'NCAAF_TRAVEL_FATIGUE',
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

// Register aliases
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

/**
 * Fetch stats for a given sport, token, and teams
 */
export async function fetchStats(sport, token, homeTeam, awayTeam, options = {}) {
  const bdlSport = sportToBdlKey(sport);
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
    defaultSeason = nbaSeason();
  }
  const season = options.season || defaultSeason;
  const normalizedSport = normalizeSportName(sport);

  console.log(`[Stat Router] Fetching ${token} for ${awayTeam} @ ${homeTeam} (${sport})`);

  // Check for deprecated tokens
  const sportSpecificToken = `${normalizedSport}_${token}`;
  if (DEPRECATED_TOKENS.includes(token) || DEPRECATED_TOKENS.includes(sportSpecificToken)) {
    console.log(`[Stat Router] Skipping ${token} - deprecated token, using Gemini Grounding context instead`);
    return {
      token, sport,
      homeValue: 'N/A (use Gemini Grounding context)',
      awayValue: 'N/A (use Gemini Grounding context)',
      note: 'Advanced analytics provided via Gemini Grounding in Scout Report'
    };
  }

  // Sport-aware token overrides
  if (token === 'CLOSE_GAME_RECORD' && bdlSport === 'icehockey_nhl') {
    token = 'ONE_GOAL_GAMES';
    console.log(`[Stat Router] Redirecting CLOSE_GAME_RECORD → ONE_GOAL_GAMES for NHL`);
  }

  try {
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

export function listAvailableStatTokens() {
  return Object.keys(FETCHERS).filter(k => k !== 'DEFAULT' && !DEPRECATED_TOKENS.includes(k)).sort();
}

export { isGeminiToken, getAuthoritativeSource, clearStatRouterCache, FETCHERS };
export default { fetchStats, listAvailableStatTokens };
