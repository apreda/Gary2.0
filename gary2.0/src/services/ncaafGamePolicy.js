/**
 * Shared provider-grounded NCAAF slate policy.
 *
 * Current coverage is any major-conference or Notre Dame team against an FBS
 * opponent, with Texas State restricted to Pac-12 opponents and main
 * spreads of 23 points or more excluded. Resolve conference membership
 * through the BDL team directory.
 * The narrower FBS classifier remains available for historical consumers.
 */

import { ncaafSlateDateForKickoff } from '../../supabase/functions/_shared/ncaafKickoff.js';

export {
  NCAAF_KICKOFF_STATUS,
  NCAAF_SLATE_ROLLOVER_HOUR_ET,
  ncaafSlateDateForInstant,
  ncaafSlateDateForKickoff,
  resolveNcaafKickoff,
} from '../../supabase/functions/_shared/ncaafKickoff.js';

export const NCAAF_FBS_CONFERENCE_IDS = Object.freeze([
  1,  // ACC
  2,  // American Athletic
  3,  // Big 12
  4,  // Big Ten
  5,  // Conference USA
  6,  // FBS Independents
  7,  // MAC
  8,  // Mountain West
  9,  // Pac-12
  10, // SEC
  11, // Sun Belt
]);

const FBS_CONFERENCES = new Set(NCAAF_FBS_CONFERENCE_IDS);

function finiteInteger(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

// BDL's team directory still reports pre-July-2026 membership for these exact
// IDs. Source: https://pac-12.com/news/2026/6/30/general-the-new-pac-12-conference-officially-launches-with-the-addition-of-seven-full-time-members.aspx
const PAC12_2026 = new Set([94, 95, 96, 100, 103, 134]);
export function ncaafTeamConferenceId(team, season = new Date().getFullYear()) {
  if (Number(season) >= 2026 && PAC12_2026.has(Number(team?.id ?? team?.team_id))) return 9;
  if (!team || typeof team !== 'object') return null;
  return finiteInteger(
    team.conference_id
      ?? team.conference?.id
      ?? team.conference,
  );
}

function teamId(team) {
  return finiteInteger(team?.id ?? team?.team_id);
}

function catalogIdentity(teams) {
  const known = new Set();
  const fbs = new Set();
  const rows = Array.isArray(teams) ? teams : [];
  for (const team of rows) {
    const id = teamId(team);
    const conferenceId = ncaafTeamConferenceId(team);
    if (id == null || conferenceId == null) continue;
    known.add(String(id));
    if (FBS_CONFERENCES.has(conferenceId)) fbs.add(String(id));
  }
  return { known, fbs, available: rows.length > 0 };
}

function teamFbsState(team, catalog, fallbackId = null) {
  const id = teamId(team) ?? finiteInteger(fallbackId);
  // The teams directory is the canonical identity source when available.
  // BDL's current docs show internal conference ids (1-25) in that directory,
  // while its documented game examples expose ESPN-style ids such as 151 for
  // the American. Resolve the exact provider team id through the catalog first
  // so those two legitimate response shapes cannot disagree.
  if (catalog.available) {
    if (id != null && catalog.known.has(String(id))) {
      return catalog.fbs.has(String(id));
    }
    return null;
  }

  const conferenceId = ncaafTeamConferenceId(team);
  if (conferenceId != null && FBS_CONFERENCES.has(conferenceId)) return true;
  // A non-FBS-looking embedded value is not enough to reject the game: values
  // such as 12 can mean Big Sky in the directory but CUSA in a game feed. Make
  // callers obtain the exact team-directory identity before classifying it.
  if (conferenceId != null) return null;
  return null;
}

/**
 * Split provider games into verified FBS, verified non-FBS, and unresolved.
 * An unresolved game means provider identity was incomplete and should be
 * treated as a retryable source failure, not an honest empty slate.
 */
export function classifyNcaafFbsGames(games, teams = []) {
  const catalog = catalogIdentity(teams);
  const accepted = [];
  const rejected = [];
  const unresolved = [];

  for (const game of Array.isArray(games) ? games : []) {
    const home = game?.home_team;
    const away = game?.away_team ?? game?.visitor_team;
    const homeState = teamFbsState(home, catalog, game?.home_team_id);
    const awayState = teamFbsState(
      away,
      catalog,
      game?.away_team_id ?? game?.visitor_team_id,
    );
    if (homeState === true && awayState === true) accepted.push(game);
    else if (homeState === false || awayState === false) rejected.push(game);
    else unresolved.push(game);
  }

  return { accepted, rejected, unresolved };
}

export const ncaafGamePolicyInternals = Object.freeze({
  catalogIdentity,
  teamFbsState,
});


export const NCAAF_PICK_CONFERENCE_IDS = Object.freeze([1, 3, 4, 9, 10]);
const PICK_CONFERENCES = new Set(NCAAF_PICK_CONFERENCE_IDS);
const identityName = value => String(typeof value === 'string' ? value : value?.full_name || [value?.college, value?.name].filter(Boolean).join(' ')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const NCAAF_MAX_PICK_SPREAD = 23;

function spreadNumber(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Use the selected main line, never an alternate spread. Raw book-only
 * games fall back to the median main line across their books. */
export function ncaafMainSpread(game) {
  for (const value of [game?.spread_home, game?.spread_away,
    game?.spread_home_value, game?.spread_away_value, game?.spread]) {
    const number = spreadNumber(value);
    if (number !== null) return Math.abs(number);
  }
  const books = game?.bookmakers || [];
  const magnitudes = books.flatMap(book => {
    const market = book?.markets?.find(m => m.key === 'spreads');
    const point = market?.outcomes?.map(o => spreadNumber(o.point)).find(n => n !== null);
    return point == null ? [] : [Math.abs(point)];
  }).sort((a, b) => a - b);
  if (!magnitudes.length) return null;
  const mid = Math.floor(magnitudes.length / 2);
  return magnitudes.length % 2 ? magnitudes[mid] : (magnitudes[mid - 1] + magnitudes[mid]) / 2;
}

export function ncaafSpreadExcluded(game) {
  // Founder, Oct 3 2026: Vanderbilt at Georgia is a one-time exception.
  // Exact provider identity and playing date keep the 23-point rule intact
  // for every other matchup, including future meetings of these teams.
  const gameId = String(game?.bdl_game_id ?? game?.game_id ?? game?.id ?? '');
  if (gameId === '458366' && ncaafSlateDateForKickoff(game?.commence_time || game) === '2026-10-03') return false;
  const spread = ncaafMainSpread(game);
  return spread !== null && spread >= NCAAF_MAX_PICK_SPREAD;
}

/** Either major-conference team, or Notre Dame, qualifies the whole game,
 * subject to the founder's Texas State, FCS-opponent and main-spread
 * exceptions. */
export function classifyNcaafCoveredGames(games, teams = []) {
  const byId = new Map(teams.map(t => [String(t.id), t]));
  const byName = new Map(teams.map(t => [identityName(t), t]));
  const accepted = [], rejected = [], unresolved = [];
  for (const game of Array.isArray(games) ? games : []) {
    if (ncaafSpreadExcluded(game)) { rejected.push(game); continue; }
    const season = game.season || Number(String(game.commence_time || game.date || '').slice(0, 4)) || new Date().getFullYear();
    const sides = ['home', 'away'].map(side => {
      const supplied = game[`${side}_team`] ?? (side === 'away' ? game.visitor_team : null);
      const id = supplied?.id ?? game[`${side}_team_id`] ?? (side === 'away' ? game.visitor_team_id : null);
      const team = byId.get(String(id)) || byName.get(identityName(supplied)) || (typeof supplied === 'object' ? supplied : null);
      const name = identityName(team || supplied);
      const texasState = Number(team?.id ?? id) === 134 || ['texasstate', 'texasstatebobcats'].includes(name);
      const conference = ncaafTeamConferenceId(team, season);
      const label = game[`${side}Conference`] ?? game[`${side}_conference`];
      const pac12 = conference != null ? conference === 9 : label ? label === 'Pac-12' : null;
      const covered = Number(team?.id ?? id) === 78 || name === 'notredamefightingirish'
        ? true : conference != null ? PICK_CONFERENCES.has(conference)
          : label ? ['ACC','Big 12','Big Ten','Pac-12','SEC'].includes(label) : null;
      const fbs = covered === true ? true : conference != null ? FBS_CONFERENCES.has(conference) : null;
      return { texasState, pac12, covered, fbs };
    });
    // No FCS opponents (founder, Oct 2 2026): an FCS team on either side
    // rejects the game; an opponent whose division is unknown stays unresolved
    // so the caller retries with the team directory.
    if (sides.some(side => side.fbs === false)) { rejected.push(game); continue; }
    if (sides.some(side => side.covered === true) && sides.some(side => side.fbs === null)) {
      unresolved.push(game);
      continue;
    }
    const texasSide = sides.findIndex(side => side.texasState);
    if (texasSide >= 0) {
      const opponent = sides[1 - texasSide];
      if (opponent.pac12 === true) accepted.push(game);
      else if (opponent.pac12 === false) rejected.push(game);
      else unresolved.push(game);
      continue;
    }
    const states = sides.map(side => side.covered);
    if (states.includes(true)) accepted.push(game);
    else if (states.every(s => s === false)) rejected.push(game);
    else unresolved.push(game);
  }
  return { accepted, rejected, unresolved };
}
