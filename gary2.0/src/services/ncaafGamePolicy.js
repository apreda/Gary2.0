/**
 * Shared provider-grounded NCAAF slate policy.
 *
 * Gary publishes only games where BOTH teams are verified FBS members. BDL's
 * embedded game teams usually carry a conference id; when they do not, callers
 * may supply the authoritative BDL teams catalog. Missing identity never turns
 * into an assumed FBS game.
 */

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

/** Either major-conference team, or Notre Dame, qualifies the whole game.
 * The opponent can be from any conference/division. */
export function classifyNcaafCoveredGames(games, teams = []) {
  const byId = new Map(teams.map(t => [String(t.id), t]));
  const byName = new Map(teams.map(t => [identityName(t), t]));
  const accepted = [], rejected = [], unresolved = [];
  for (const game of Array.isArray(games) ? games : []) {
    const season = game.season || Number(String(game.commence_time || game.date || '').slice(0, 4)) || new Date().getFullYear();
    const states = ['home', 'away'].map(side => {
      const supplied = game[`${side}_team`] ?? (side === 'away' ? game.visitor_team : null);
      const id = supplied?.id ?? game[`${side}_team_id`] ?? (side === 'away' ? game.visitor_team_id : null);
      const team = byId.get(String(id)) || byName.get(identityName(supplied)) || (typeof supplied === 'object' ? supplied : null);
      if (Number(team?.id ?? id) === 78 || identityName(team || supplied) === 'notredamefightingirish') return true;
      const conference = ncaafTeamConferenceId(team, season);
      if (conference != null) return PICK_CONFERENCES.has(conference);
      const label = game[`${side}Conference`] ?? game[`${side}_conference`];
      if (label) return ['ACC','Big 12','Big Ten','Pac-12','SEC'].includes(label);
      return null;
    });
    if (states.includes(true)) accepted.push(game);
    else if (states.every(s => s === false)) rejected.push(game);
    else unresolved.push(game);
  }
  return { accepted, rejected, unresolved };
}
