/**
 * ESPN COLLEGE FOOTBALL — the free second source for college settlement
 * (founder GO, Sep 22 2026). The NCAAF companion to what nflverse is for the
 * NFL: BDL stays the primary box and the primary play ledger; ESPN answers
 * only what BDL's college feed cannot, and only for a ticket BDL left pending.
 *
 *   • The full player box, including defensive and return touchdowns, which
 *     BDL's college player rows omit.
 *   • Play-by-play with athlete ids on every participant, so a touchdown is
 *     attributed to a scorer by id, not by parsing a name out of text.
 *
 * ESPN's site API is public and unkeyed but unofficial. Everything here is
 * fail-soft: any shape or transport surprise returns null and the ticket
 * stays pending. A match between our player and ESPN's requires the exact
 * normalized full name, unique across both teams' boxes; a team name, when
 * the prop carries one, must agree. Athlete ids are never guessed.
 */
import { normalizeNcaafTeamName } from './ncaafPropOddsService.js';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Gary settlement)', Accept: 'application/json' };
const TIMEOUT_MS = 15_000;

const norm = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[.'’]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const num = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};
const etDate = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const compact = date => String(date).replace(/-/g, '');
const shiftDate = (date, days) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`ESPN HTTP ${response.status}`);
  return response.json();
}

/** The ESPN event for one BDL college game, matched on both team names and kickoff proximity. */
export async function findEspnCollegeEvent({ date, homeTeam, awayTeam, commenceTime = null, fetchImpl = fetch } = {}) {
  const home = normalizeNcaafTeamName(homeTeam), away = normalizeNcaafTeamName(awayTeam);
  if (!date || !home || !away || home === away) return null;
  const candidates = [];
  for (const day of [date, shiftDate(date, 1)]) {
    const payload = await getJson(`${SITE}/scoreboard?groups=80&dates=${compact(day)}&limit=300`, fetchImpl);
    for (const event of payload?.events || []) {
      const competition = event?.competitions?.[0];
      const sides = (competition?.competitors || []).map(side => ({
        role: side.homeAway, id: String(side.team?.id ?? side.id ?? ''),
        names: [side.team?.displayName, `${side.team?.location ?? ''} ${side.team?.name ?? ''}`, side.team?.shortDisplayName].map(normalizeNcaafTeamName),
      }));
      const homeSide = sides.find(s => s.role === 'home'), awaySide = sides.find(s => s.role === 'away');
      if (!homeSide || !awaySide) continue;
      const matches = (side, wanted) => side.names.some(n => n && (n === wanted || n.includes(wanted) || wanted.includes(n)));
      if (!(matches(homeSide, home) && matches(awaySide, away))) continue;
      const kickoff = Date.parse(event?.date ?? competition?.date ?? '');
      if (commenceTime && Number.isFinite(kickoff) && Math.abs(kickoff - Date.parse(commenceTime)) > 3 * 3600_000) continue;
      candidates.push({ eventId: String(event.id), status: event?.status?.type?.name ?? competition?.status?.type?.name ?? null,
        homeTeamId: homeSide.id, awayTeamId: awaySide.id, kickoff: Number.isFinite(kickoff) ? new Date(kickoff).toISOString() : null });
    }
  }
  const unique = [...new Map(candidates.map(c => [c.eventId, c])).values()];
  return unique.length === 1 ? unique[0] : null;
}

function statMap(group, athlete) {
  const keys = (group?.keys || []).flatMap(key => String(key).split('/'));
  const values = (athlete?.stats || []).flatMap(value => String(value).split('/'));
  const out = {};
  keys.forEach((key, index) => { out[key] = num(values[index]); });
  return out;
}

/** One game's ESPN box: every athlete with a stat line, by id, with every category merged. */
export function parseEspnCollegeBox(summary) {
  const players = new Map();
  for (const team of summary?.boxscore?.players || []) {
    const teamName = team?.team?.displayName ?? null, teamAbbr = team?.team?.abbreviation ?? null, teamId = String(team?.team?.id ?? '');
    for (const group of team?.statistics || []) {
      for (const entry of group?.athletes || []) {
        const id = String(entry?.athlete?.id ?? '');
        if (!id) continue;
        const current = players.get(id) || { id, name: entry?.athlete?.displayName ?? '', teamId, teamName, teamAbbr, stats: {} };
        const stats = statMap(group, entry);
        for (const [key, value] of Object.entries(stats)) {
          // The same touchdown appears under both `defensive` and `interceptions`
          // (defensiveTouchdowns / interceptionTouchdowns). Keep each key's own value.
          const scoped = ['interceptions', 'yards', 'touchdowns'].includes(key) ? `${group.name}.${key}` : key;
          current.stats[scoped] = value;
        }
        players.set(id, current);
      }
    }
  }
  return players;
}

/** Touchdowns by scorer athlete id from the core play feed; null unless the feed is complete and final. */
export function touchdownsByScorer(plays) {
  const items = Array.isArray(plays?.items) ? plays.items : Array.isArray(plays) ? plays : null;
  if (!items?.length) return null;
  const counts = new Map();
  for (const play of items) {
    if (!play?.scoringPlay || Number(play?.scoreValue) !== 6) continue;
    const scorers = (play.participants || []).filter(p => p?.type === 'scorer');
    const ids = [...new Set(scorers.map(p => String(p?.athlete?.$ref ?? '').match(/athletes\/(\d+)/)?.[1]).filter(Boolean))];
    // A six-point play with no identified scorer, or two, cannot be attributed.
    if (ids.length !== 1) return null;
    counts.set(ids[0], (counts.get(ids[0]) ?? 0) + 1);
  }
  return counts;
}

/** Load one final game's ESPN evidence, or null. */
export async function fetchEspnCollegeSettlement({ date, homeTeam, awayTeam, commenceTime = null, fetchImpl = fetch } = {}) {
  try {
    const event = await findEspnCollegeEvent({ date, homeTeam, awayTeam, commenceTime, fetchImpl });
    if (!event || !/FINAL/i.test(String(event.status || ''))) return null;
    const summary = await getJson(`${SITE}/summary?event=${event.eventId}`, fetchImpl);
    const finalStatus = summary?.header?.competitions?.[0]?.status?.type?.name ?? event.status;
    if (!/FINAL/i.test(String(finalStatus || ''))) return null;
    const box = parseEspnCollegeBox(summary);
    if (!box.size) return null;
    let scorers = null;
    try {
      const plays = await getJson(`${CORE}/events/${event.eventId}/competitions/${event.eventId}/plays?limit=500`, fetchImpl);
      if (plays?.pageCount && Number(plays.pageCount) > 1) scorers = null; // an incomplete ledger attributes nothing
      else scorers = touchdownsByScorer(plays);
    } catch { scorers = null; }
    return { eventId: event.eventId, homeTeamId: event.homeTeamId, awayTeamId: event.awayTeamId, box, scorers };
  } catch (error) {
    console.warn(`  ⚠️ ESPN college evidence unavailable for ${awayTeam} @ ${homeTeam}: ${error?.message || error}`);
    return null;
  }
}

/** Our player in ESPN's box: exact normalized full name, unique across both teams, team agreeing when supplied. */
export function findEspnPlayer(evidence, { name, team = null } = {}) {
  const wanted = norm(name);
  if (!evidence?.box || !wanted) return null;
  const wantedTeam = team ? normalizeNcaafTeamName(team) : null;
  const matches = [...evidence.box.values()].filter(player => norm(player.name) === wanted
    && (!wantedTeam || [player.teamName, player.teamAbbr].map(normalizeNcaafTeamName).some(t => t && (t === wantedTeam || t.includes(wantedTeam) || wantedTeam.includes(t)))));
  return matches.length === 1 ? matches[0] : null;
}

const FIELD = {
  passing_yards: 'passingYards', rushing_yards: 'rushingYards', receiving_yards: 'receivingYards', receptions: 'receptions',
  passing_touchdowns: 'passingTouchdowns', rushing_touchdowns: 'rushingTouchdowns', receiving_touchdowns: 'receivingTouchdowns',
  passing_attempts: 'passingAttempts', passing_completions: 'completions', rushing_attempts: 'rushingAttempts',
};
const ALIAS = { pass_yds: 'passing_yards', rush_yds: 'rushing_yards', rec_yds: 'receiving_yards', reception_yds: 'receiving_yards',
  pass_tds: 'passing_touchdowns', rush_tds: 'rushing_touchdowns', rec_tds: 'receiving_touchdowns', reception_tds: 'receiving_touchdowns',
  pass_attempts: 'passing_attempts', pass_completions: 'passing_completions', rush_attempts: 'rushing_attempts', anytime_td: 'anytime_touchdown' };

/**
 * The settled value for one market from ESPN's evidence, or null. An anytime
 * touchdown needs the play feed's scorer count for this athlete AND the box's
 * own touchdown categories to agree; yardage and count markets need the
 * player's line in that category.
 */
export function espnActualForProp(evidence, { name, team = null, propType } = {}) {
  const player = findEspnPlayer(evidence, { name, team });
  if (!player) return null;
  const type = String(propType || '').trim().toLowerCase().replace(/^player_/, '').replace(/[\s-]+/g, '_');
  const canonical = ALIAS[type] || type;
  const stat = key => (Object.hasOwn(player.stats, key) ? player.stats[key] : null);
  if (canonical === 'anytime_touchdown') {
    if (!evidence.scorers) return null;
    const fromPlays = evidence.scorers.get(player.id) ?? 0;
    const fromBox = ['rushingTouchdowns', 'receivingTouchdowns', 'defensiveTouchdowns', 'kickReturnTouchdowns', 'puntReturnTouchdowns']
      .reduce((sum, key) => sum + (stat(key) ?? 0), 0);
    return fromPlays === fromBox ? fromPlays : null;
  }
  const field = FIELD[canonical];
  if (!field) return null;
  const value = stat(field);
  return value === null || value === undefined ? null : value;
}

export default { findEspnCollegeEvent, fetchEspnCollegeSettlement, parseEspnCollegeBox, touchdownsByScorer, findEspnPlayer, espnActualForProp };
