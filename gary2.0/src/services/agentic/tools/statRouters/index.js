import { isGeminiToken, getAuthoritativeSource, clearStatRouterCache, DEPRECATED_TOKENS, sportToBdlKey, normalizeSportName, findTeam } from './statRouterCommon.js';
import { ballDontLieService } from '../../../ballDontLieService.js';
import { nbaSeason, nflSeason, ncaafSeason, mlbSeason } from '../../../../utils/dateUtils.js';
import { nbaFetchers } from './nbaFetchers.js';
import { nflFetchers } from './nflFetchers.js';
import { ncaafFetchers } from './ncaafFetchers.js';
import { mlbFetchers } from './mlbFetchers.js';
import { NCAAF_TOKEN_ALIASES } from '../ncaafTokenContract.js';

// Merge all fetchers into one object — WITH OWNERSHIP (Jul 6 2026 audit).
// Sports share structure, never each other's data paths: every token records
// which sport defined it, collisions warn loudly instead of silently letting
// merge order pick a winner, and dispatch refuses to execute a token across
// sport families (see SHARED_TOKENS for the deliberate exceptions).
const SPORT_SOURCES = {
  nba: nbaFetchers,
  ncaaf: ncaafFetchers,
  nfl: nflFetchers,
  mlb: mlbFetchers,
};
const SPORT_FAMILY = { nba: 'basketball', nfl: 'americanfootball', ncaaf: 'americanfootball', mlb: 'baseball' };

/**
 * LEAGUE ISOLATION — stricter than family (founder ruling, Aug 25 2026).
 *
 * The family guard stops baseball from executing a basketball fetcher. It does
 * NOT stop the NFL and college football from executing each other's, because
 * both are "americanfootball" — and for a while they did: NCAAF's checklist
 * declared OL_RANKINGS and DL_RANKINGS, no NCAAF_ variant existed, and the
 * dispatcher handed college matchups to the NFL implementation.
 *
 * The founder's ruling is that these two are as separate as the NFL and
 * baseball: same sport, different league, different players, nothing shared.
 * A shared fetcher with an `if (ncaaf)` branch inside it is not separation —
 * it is one blast radius wearing two labels.
 *
 * So the pairs named here may never cross even though they share a family.
 * (The NCAAB half of the old basketball-pair debt died with the NCAAB lane,
 * founder deletion order Aug 27.)
 */
const LEAGUE_ISOLATED = new Map([
  ['nfl', new Set(['ncaaf'])],
  ['ncaaf', new Set(['nfl'])]
]);

function crossesLeagueLine(currentSport, owner) {
  const from = String(currentSport || '').toLowerCase();
  return Boolean(owner && LEAGUE_ISOLATED.get(from)?.has(owner));
}
// Tokens that take bdlSport and route internally — genuinely sport-agnostic.
const SHARED_TOKENS = new Set(['DEFAULT', 'REST_SITUATION', 'STANDINGS', 'H2H_HISTORY']);
// These scoring-split handlers are deliberately polymorphic, but only for the
// two leagues whose BDL game rows expose Q1-Q4 fields. They live in the NBA
// fetcher module for historical reasons and use the supplied `bdlSport` for all
// requests. Without this explicit access contract, the ownership guard rejects
// the NFL tokens as NBA-only before the handler can route to the NFL endpoint.
const SPORT_POLYMORPHIC_TOKENS = new Map([
  ['QUARTER_SCORING', new Set(['NBA', 'NFL'])],
  ['FIRST_HALF_TRENDS', new Set(['NBA', 'NFL'])],
  ['SECOND_HALF_TRENDS', new Set(['NBA', 'NFL'])],
  ['FIRST_HALF_SCORING', new Set(['NBA', 'NFL'])],
  ['SECOND_HALF_SCORING', new Set(['NBA', 'NFL'])],
]);
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
  ...NCAAF_TOKEN_ALIASES,
  BACK_TO_BACK: 'REST_SITUATION',
  DIVISION_STANDING: 'STANDINGS',
  // NBA/shared
  EFFICIENCY_LAST_10: 'EFFICIENCY_TREND',
  FIRST_HALF_SCORING: 'FIRST_HALF_TRENDS',
  SECOND_HALF_SCORING: 'SECOND_HALF_TRENDS',
  CLOSE_GAME_RECORD: 'CLUTCH_STATS',
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
 * Resolve a token the way dispatch does, and report whether this sport is
 * allowed to run it — WITHOUT executing anything.
 *
 * Extracted Aug 25 2026. The cross-sport guard below has always been correct,
 * but nothing checked the other direction: that every token a sport's factor
 * checklist DECLARES is actually reachable for that sport. It was not — the
 * NFL checklist asked for five NBA/NHL-owned tokens and NCAAF for four, so
 * those factors returned "belongs to NBA" on every single run. Exposing the
 * decision makes the invariant testable instead of merely intended.
 *
 * @returns {{resolvedKey: string|null, owner: string|null, allowed: boolean, reason: string}}
 */
export function resolveTokenForSport(sport, token) {
  const bdlSport = sportToBdlKey(sport);
  const normalizedSport = normalizeSportName(sport);
  const sportSpecificToken = `${normalizedSport}_${token}`;

  const resolvedKey = FETCHERS[sportSpecificToken] ? sportSpecificToken : token;
  if (!FETCHERS[resolvedKey]) {
    return { resolvedKey: null, owner: null, allowed: false, reason: 'no fetcher' };
  }

  const owner = TOKEN_OWNER[resolvedKey] || null;
  const currentFamily = (bdlSport || '').split('_')[0];
  if (SHARED_TOKENS.has(resolvedKey)) {
    return { resolvedKey, owner, allowed: true, reason: 'shared' };
  }
  if (SPORT_POLYMORPHIC_TOKENS.get(resolvedKey)?.has(normalizedSport) === true) {
    return { resolvedKey, owner, allowed: true, reason: 'polymorphic' };
  }
  if (crossesLeagueLine(normalizedSport, owner)) {
    return { resolvedKey, owner, allowed: false, reason: `owned by ${owner} — the NFL and college football are isolated leagues` };
  }
  if (owner && SPORT_FAMILY[owner] !== currentFamily) {
    return { resolvedKey, owner, allowed: false, reason: `owned by ${owner}` };
  }
  return { resolvedKey, owner, allowed: true, reason: 'own family' };
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
  } else if (normalizedSportForSeason.includes('ncaaf')) {
    defaultSeason = ncaafSeason();
  } else if (normalizedSportForSeason.includes('nfl')) {
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
    console.log(`[Stat Router] Skipping ${token} — retired token name with no fetcher`);
    return {
      token, sport,
      source: 'NOT AVAILABLE',
      homeValue: 'N/A',
      awayValue: 'N/A',
      note: 'This is a retired token name with no data source. Report it as unavailable; do not estimate, derive or recall a value for it.'
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
    const permitsCurrentSport = SPORT_POLYMORPHIC_TOKENS.get(resolvedKey)?.has(normalizedSport) === true;
    if (tokenOwner && !SHARED_TOKENS.has(resolvedKey) && !permitsCurrentSport
      && (crossesLeagueLine(normalizedSport, tokenOwner) || SPORT_FAMILY[tokenOwner] !== currentFamily)) {
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
