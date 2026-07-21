import { isGeminiToken, getAuthoritativeSource, clearStatRouterCache, DEPRECATED_TOKENS, sportToBdlKey, normalizeSportName, findTeam } from './statRouterCommon.js';
import { ballDontLieService } from '../../../ballDontLieService.js';
import { nbaSeason, nhlSeason, nflSeason, ncaabSeason, mlbSeason } from '../../../../utils/dateUtils.js';
import { nbaFetchers } from './nbaFetchers.js';
import { nhlFetchers } from './nhlFetchers.js';
import { nflFetchers } from './nflFetchers.js';
import { ncaabFetchers } from './ncaabFetchers.js';
import { ncaafFetchers } from './ncaafFetchers.js';
import { mlbFetchers } from './mlbFetchers.js';

// Merge all fetchers into one object — WITH OWNERSHIP (Jul 6 2026 audit).
// Sports share structure, never each other's data paths: every token records
// which sport defined it, collisions warn loudly instead of silently letting
// merge order pick a winner, and dispatch refuses to execute a token across
// sport families (see SHARED_TOKENS for the deliberate exceptions).
const SPORT_SOURCES = {
  nba: nbaFetchers,
  ncaab: ncaabFetchers,
  ncaaf: ncaafFetchers,
  nfl: nflFetchers,
  nhl: nhlFetchers,
  mlb: mlbFetchers,
};
const SPORT_FAMILY = { nba: 'basketball', ncaab: 'basketball', nfl: 'americanfootball', ncaaf: 'americanfootball', nhl: 'icehockey', mlb: 'baseball' };
// Tokens that take bdlSport and route internally — genuinely sport-agnostic,
// reachable from any sport (NHL reaches STANDINGS/REST_SITUATION via aliases).
const SHARED_TOKENS = new Set(['DEFAULT', 'REST_SITUATION', 'STANDINGS', 'H2H_HISTORY']);
const FETCHERS = {};
const TOKEN_OWNER = {};
for (const [ownerSport, map] of Object.entries(SPORT_SOURCES)) {
  for (const [token, fn] of Object.entries(map)) {
    if (FETCHERS[token] && !SHARED_TOKENS.has(token)) {
      console.warn(`[Stat Router] ⚠️ TOKEN COLLISION: "${token}" defined by both ${TOKEN_OWNER[token]} and ${ownerSport} — ${ownerSport} wins the merge. Namespace it.`);
    }
    FETCHERS[token] = fn;
    TOKEN_OWNER[token] = ownerSport;
  }
}
// Neutral unknown-token handler (both nba and mlb used to define their own
// DEFAULT and merge order picked mlb's, so NBA runs got a baseball message).
FETCHERS.DEFAULT = async (bdlSport, _home, _away) => ({
  homeValue: 'N/A',
  awayValue: 'N/A',
  comparison: `Stat token not implemented for ${bdlSport}`,
  source: 'N/A',
});

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

// Register aliases (alias inherits the target's ownership)
for (const [alias, target] of Object.entries(ALIASES)) {
  if (!FETCHERS[alias] && FETCHERS[target]) {
    FETCHERS[alias] = FETCHERS[target];
    TOKEN_OWNER[alias] = TOKEN_OWNER[target];
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
    // Never borrow another sport's season/endpoints for an unmapped sport.
    throw new Error(`[HARD FAIL] Unknown sport "${sport}" in fetchStats — no season/endpoint mapping. Add the sport explicitly; never default to another sport's routes.`);
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
    let resolvedKey = token;
    if (FETCHERS[sportSpecificToken]) {
      fetcher = FETCHERS[sportSpecificToken];
      resolvedKey = sportSpecificToken;
      console.log(`[Stat Router] Using sport-specific fetcher: ${sportSpecificToken}`);
    } else {
      fetcher = FETCHERS[token];
    }

    if (!fetcher) {
      return { error: `Unknown stat token: ${token}`, token };
    }

    // CROSS-SPORT GUARD (Jul 6 2026 audit): never execute another sport family's
    // fetcher. A hallucinated or mis-routed token gets a loud, self-explanatory
    // error back to Gary instead of silently fetching the wrong sport's data.
    const tokenOwner = TOKEN_OWNER[resolvedKey];
    const currentFamily = (bdlSport || '').split('_')[0];
    if (tokenOwner && !SHARED_TOKENS.has(resolvedKey) && SPORT_FAMILY[tokenOwner] !== currentFamily) {
      console.warn(`[Stat Router] 🛑 Cross-sport block: ${resolvedKey} belongs to ${tokenOwner.toUpperCase()}, requested during a ${sport} run`);
      return { error: `Stat token ${token} belongs to ${tokenOwner.toUpperCase()} — not available for ${sport}. Use this sport's own tokens.`, token };
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
