/**
 * NCAAF game metadata for the app's college navigation (founder, Aug 25 2026):
 * conference names + AP Top 25 ranks stamped onto game objects so the Picks
 * page can default to ranked matchups and filter the rest by conference. A
 * cross-conference game belongs to BOTH conferences' filters; the app derives
 * that from the two per-side fields stamped here.
 *
 * Provider-grounded only: exact BDL team identity (full-name normalization,
 * never substring), the BDL AP poll. A team that cannot be exactly resolved
 * gets nulls — the app then shows the game without conference/rank chrome,
 * never under a guessed conference.
 */
import { ballDontLieService } from './ballDontLieService.js';
import { normalizeNcaafTeamName } from './ncaafPropOddsService.js';
import { ncaafSeason } from '../utils/dateUtils.js';
import { ncaafTeamConferenceId } from './ncaafGamePolicy.js';

// BDL NCAAF conference directory ids → display names. Ids 1-11 are the FBS
// set ncaafGamePolicy pins; names follow BDL /ncaaf/v1/conferences with two
// display choices: "FBS Indep." reads "Independents" in the app, and CUSA
// keeps its short form.
export const NCAAF_CONFERENCE_DISPLAY = Object.freeze({
  1: 'ACC',
  2: 'American',
  3: 'Big 12',
  4: 'Big Ten',
  5: 'CUSA',
  6: 'Independents',
  7: 'MAC',
  8: 'Mountain West',
  9: 'Pac-12',
  10: 'SEC',
  11: 'Sun Belt',
});

const teamNameOf = (team) =>
  typeof team === 'string' ? team : (team?.full_name || team?.name || '');

/**
 * One BDL fetch pair for a whole slate: the exact team directory and the AP
 * poll for the current week. Rankings failing is survivable (early-season
 * polls, provider hiccups) — conference stamping still proceeds; a missing
 * team directory is not, so that error propagates to the fail-soft caller.
 */
export async function loadNcaafMetadataSources({ season = null } = {}) {
  const pollSeason = season ?? ncaafSeason();
  const [teams, rankings] = await Promise.all([
    ballDontLieService.getTeams('americanfootball_ncaaf'),
    ballDontLieService.getNcaafRankings(pollSeason).catch((error) => {
      console.warn(`[NCAAF Metadata] AP rankings unavailable for ${pollSeason}: ${error.message}`);
      return [];
    }),
  ]);

  const byName = new Map();
  for (const team of Array.isArray(teams) ? teams : []) {
    const key = normalizeNcaafTeamName(team?.full_name || team?.name);
    if (key) byName.set(key, team);
  }

  const rankByTeamId = new Map();
  for (const row of Array.isArray(rankings) ? rankings : []) {
    const id = row?.team?.id;
    const rank = Number(row?.rank);
    if (id != null && Number.isFinite(rank)) rankByTeamId.set(String(id), rank);
  }

  return { byName, rankByTeamId };
}

/** Exact-identity lookup: {conference, ranking} for one side, nulls when unresolved. */
export function resolveNcaafTeamMetadata(team, sources) {
  const key = normalizeNcaafTeamName(teamNameOf(team));
  const providerTeam = key ? sources?.byName?.get(key) : null;
  if (!providerTeam) return { conference: null, ranking: null };

  const conferenceId = ncaafTeamConferenceId(providerTeam);
  return {
    conference: NCAAF_CONFERENCE_DISPLAY[conferenceId] ?? null,
    ranking: sources?.rankByTeamId?.get(String(providerTeam.id)) ?? null,
  };
}

/**
 * Stamp homeConference/awayConference/homeRanking/awayRanking onto each game
 * object in place. Fail-soft by contract: metadata is navigation chrome, so a
 * provider failure logs and returns 0 rather than delaying a pick or a slate.
 */
export async function attachNcaafGameMetadata(games, { season = null } = {}) {
  const rows = Array.isArray(games) ? games : [];
  if (!rows.length) return 0;

  let sources;
  try {
    sources = await loadNcaafMetadataSources({ season });
  } catch (error) {
    console.warn(`[NCAAF Metadata] team directory unavailable — games stay unstamped: ${error.message}`);
    return 0;
  }

  let stamped = 0;
  for (const game of rows) {
    const home = resolveNcaafTeamMetadata(game?.home_team ?? game?.homeTeam, sources);
    const away = resolveNcaafTeamMetadata(
      game?.away_team ?? game?.visitor_team ?? game?.awayTeam,
      sources,
    );
    game.homeConference = home.conference;
    game.awayConference = away.conference;
    game.homeRanking = home.ranking;
    game.awayRanking = away.ranking;
    if (home.conference || away.conference) stamped += 1;
  }
  console.log(`[NCAAF Metadata] stamped conference/rank on ${stamped}/${rows.length} games`);
  return stamped;
}
