import { isGeminiToken, getAuthoritativeSource, clearStatRouterCache, DEPRECATED_TOKENS, sportToBdlKey, normalizeSportName, findTeam } from './statRouterCommon.js';
import { ballDontLieService } from '../../../ballDontLieService.js';
import { nbaSeason, nhlSeason, nflSeason, ncaabSeason, mlbSeason } from '../../../../utils/dateUtils.js';
import { nbaFetchers } from './nbaFetchers.js';
import { nhlFetchers } from './nhlFetchers.js';
import { nflFetchers } from './nflFetchers.js';
import { ncaabFetchers } from './ncaabFetchers.js';
import { ncaafFetchers } from './ncaafFetchers.js';
import { mlbFetchers } from './mlbFetchers.js';

// Merge all fetchers into one object
const FETCHERS = {
  ...nbaFetchers,
  ...ncaabFetchers,
  ...ncaafFetchers,
  ...nflFetchers,
  ...nhlFetchers,
  ...mlbFetchers,
};

// Aliases — maps alternate token names to real fetcher names.
// Only kept where investigation prompts or investigation factors reference the alias name.
const ALIASES = {
  // NHL: goalie aliases (SAVE_PCT, GOALS_AGAINST_AVG, GOALIE_MATCHUP are in investigation factors)
  SAVE_PCT: 'GOALIE_STATS',
  GOALS_AGAINST_AVG: 'GOALIE_STATS',
  GOALIE_MATCHUP: 'GOALIE_STATS',
  BACK_TO_BACK: 'REST_SITUATION',
  DIVISION_STANDING: 'STANDINGS',
  // NBA/shared
  EFFICIENCY_LAST_10: 'EFFICIENCY_TREND',
  FIRST_HALF_SCORING: 'FIRST_HALF_TRENDS',
  SECOND_HALF_SCORING: 'SECOND_HALF_TRENDS',
  CLOSE_GAME_RECORD: 'CLUTCH_STATS',
  // NCAAF: investigation factors reference these names, fetchers use different names
  NCAAF_SP_PLUS_RATINGS: 'NCAAF_SP_PLUS',
  NCAAF_FPI_RATINGS: 'NCAAF_FPI',
  NCAAF_EPA: 'NCAAF_EPA_ADVANCED',
  NCAAF_SUCCESS_RATE: 'NCAAF_EPA_ADVANCED',
  NCAAF_HAVOC: 'NCAAF_HAVOC_RATE',
  NCAAF_EXPLOSIVE_PLAYS: 'NCAAF_EXPLOSIVENESS',
  NCAAF_RUSH_EFFICIENCY: 'NCAAF_RUSHING_EFFICIENCY',
  NCAAF_PASS_EFFICIENCY: 'NCAAF_PASSING_EFFICIENCY',
  NCAAF_REDZONE: 'NCAAF_RED_ZONE',
  // MLB: route the generic H2H_HISTORY name to MLB_H2H. Without this, MLB usage
  // of H2H_HISTORY fell through to the NBA-shaped fetcher which needs home.id
  // (BDL team id) — MLB code path constructs home with only full_name/name, so
  // team_ids became [undefined] and the BDL SDK threw on .toString() of null.
  MLB_H2H_HISTORY: 'MLB_H2H'
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
  } else if (normalizedSportForSeason.includes('mlb') || normalizedSportForSeason.includes('baseball')) {
    defaultSeason = mlbSeason();
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

    // MLB: Skip BDL team lookup — MLB fetchers use MLB Stats API + grounding for team data.
    const isMLB = bdlSport === 'baseball_mlb';
    let home, away;
    if (isMLB) {
      // Create lightweight team objects with the names — MLB fetchers handle their own lookups
      home = { full_name: homeTeam, name: homeTeam };
      away = { full_name: awayTeam, name: awayTeam };
    } else {
      const teams = await ballDontLieService.getTeams(bdlSport);
      home = findTeam(teams, homeTeam);
      away = findTeam(teams, awayTeam);

      if (!home || !away) {
        return { error: `Could not find teams: ${homeTeam} or ${awayTeam}`, token };
      }
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
