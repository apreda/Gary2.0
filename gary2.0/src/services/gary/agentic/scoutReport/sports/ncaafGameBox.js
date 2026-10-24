/**
 * ONE COLLEGE GAME'S BOX SCORE, FROM ESPN (Oct 23 2026 data audit).
 *
 * BDL's college player rows did not add up to the team's own box score in 29 of 39 team-games checked (six teams'
 * seasons: carries, catches or pass attempts one to three off, no overtime, empty rows for players who did not play).
 * ESPN's college box added up in 362 of 372 team-games of weeks 5-8, and its scoring plays reconciled to 185 of the
 * 186 finals. CFBD numbers a game with ESPN's event id and a team with ESPN's team id, so the CFBD row that carries a
 * game's unit lines names its ESPN box.
 *
 * Kept from ESPN's game summary: each team's id, side and final score, every athlete's counted stats by category,
 * and each scoring play's type, text and the score after it. Nothing else is read: the summary's odds,
 * against-the-spread, win-probability, predictor and article fields never leave this file.
 */
import { cachedResearch } from '../../../sharedResearchCache.js';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Gary college desk)', Accept: 'application/json' };
const TIMEOUT_MS = 15_000;
const BOX_TTL_MS = 12 * 60 * 60 * 1000;   // a final's box can be corrected for a day or two after the game
const ROSTER_TTL_MS = 12 * 60 * 60 * 1000;

const num = (value) => {
  if (value === null || value === undefined || value === '' || value === '--') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`ESPN HTTP ${response.status}`);
  return response.json();
}

/** The parts of one ESPN college summary the desk reads; { unavailable, reason } unless the game is final. */
export function gameBoxFromSummary(summary, eventId) {
  const competition = summary?.header?.competitions?.[0];
  const status = competition?.status?.type;
  if (!(status?.completed === true || /FINAL/i.test(String(status?.name || '')))) return { unavailable: true, reason: `ESPN game ${eventId} is not final` };
  const teams = (competition?.competitors || []).map((c) => ({ id: String(c?.team?.id ?? c?.id ?? ''), homeAway: c?.homeAway, score: num(c?.score) }));
  const players = [];
  for (const side of summary?.boxscore?.players || []) {
    const teamId = String(side?.team?.id ?? '');
    const byId = new Map();
    for (const group of side?.statistics || []) {
      const keys = (group?.keys || []).flatMap((k) => String(k).split('/'));
      for (const entry of group?.athletes || []) {
        const id = String(entry?.athlete?.id ?? '');
        if (!id || !group?.name) continue;
        const values = (entry?.stats || []).flatMap((v) => String(v).split('/'));
        const player = byId.get(id) || { id, teamId, first: entry.athlete.firstName || '', last: entry.athlete.lastName || '', name: entry.athlete.displayName || '', stats: {} };
        player.stats[group.name] = Object.fromEntries(keys.map((k, i) => [k, num(values[i])]));
        byId.set(id, player);
      }
    }
    players.push(...byId.values());
  }
  if (!teams.length || !players.length) return { unavailable: true, reason: `ESPN game ${eventId} has no box score` };
  const scoring = (summary?.scoringPlays || []).map((p) => ({ type: p?.type?.text ?? null, scoringType: p?.scoringType?.name ?? null,
    text: String(p?.text || ''), home: num(p?.homeScore), away: num(p?.awayScore) }));
  // Every field goal try with its distance and result, from the play-by-play (Oct 24 2026: "FG 0-of-2" needs the 32 and
  // the 55 behind it). Only the drives' plays are read.
  const fieldGoals = [];
  for (const drive of summary?.drives?.previous || []) {
    const teamId = String(drive?.team?.id ?? '');
    for (const play of drive?.plays || []) {
      const type = String(play?.type?.text || '');
      if (!/field goal/i.test(type)) continue;
      const text = String(play?.text || '');
      const yards = num(text.match(/(\d+)\s*(?:yd|yards?)/i)?.[1]);
      // Who kicked it (founder, Oct 24 2026: a miss says nothing about today if someone else kicks today).
      const named = (text.match(/(?:#\d+\s+)?([A-Z][A-Za-z.'-]*(?:\s[A-Z][A-Za-z'-]+)?)\s+(?:\d+\s*(?:yd|yards?)\s+)?field goal/i)?.[1] || '').trim();
      // One spelling per kicker: ESPN writes both "D.Kelly" and "Dieter Kelly" in one game.
      const parts = named.split(/\s+/);
      const kicker = !named ? null : parts.length > 1 && !named.includes('.') ? `${parts[0][0]}.${parts.slice(1).join(' ')}` : named;
      fieldGoals.push({ teamId, yards, kicker, made: /good/i.test(type) && !/no good|missed|blocked/i.test(type), blocked: /blocked/i.test(type) });
    }
  }
  // How each drive ended and where it began (Oct 24 2026 read check: Indiana's first touchdown against Ohio State came
  // from the Ohio State 7 after an interception, and nothing showed it). Counts only.
  const drives = (summary?.drives?.previous || []).map((d) => {
    const at = String(d?.start?.text || '').match(/^([A-Za-z&]+)\s+(\d+)$/);
    return { teamId: String(d?.team?.id ?? ''), result: String(d?.result || d?.displayResult || '').toUpperCase(),
      oppHalf: Boolean(at && at[1] !== d?.team?.abbreviation && Number(at[2]) < 50) };
  });
  // Everyone the play-by-play names ("#99 R.Porter" on a tackle, "#13 C.Durr Jr." on a target), as jersey|name keys
  // (Oct 24 2026 read check: the box score lists only players with a stat, so a starting lineman with no tackle and a
  // receiver with no catch read as absent; Rutgers' Rondo Porter made a tackle for loss the box never credited).
  const named = new Set();
  for (const drive of summary?.drives?.previous || []) {
    for (const play of drive?.plays || []) {
      for (const m of String(play?.text || '').matchAll(/#(\d{1,2})\s+([A-Z])[A-Za-z'-]*\.\s?([A-Z][A-Za-z'-]+)/g)) named.add(`${Number(m[1])}|${playKey(m[2], m[3])}`);
    }
  }
  return { eventId: String(eventId), teams, players, scoring, fieldGoals, drives, named: [...named] };
}

/** A player's play-by-play key: first initial and the first word of the last name, letters only ("r|porter"). */
export const playKey = (first, last) => `${String(first || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 1)}|${String(last || '').split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '')}`;

/** Whether a game's play-by-play names this player: by jersey and name when his jersey is known, else by name. */
export function namedInPlays(named, { first, last, jersey } = {}) {
  if (!named?.length || !first || !last) return false;
  const key = playKey(first, last);
  return jersey != null && jersey !== '' ? named.includes(`${Number(jersey)}|${key}`) : named.some((k) => k.endsWith(`|${key}`));
}

/** One final game's box (cached); { unavailable, reason } when ESPN does not answer or the game is not final. */
export async function getNcaafGameBox(eventId, { fetchImpl = globalThis.fetch } = {}) {
  if (eventId == null) return { unavailable: true, reason: 'no game id' };
  return cachedResearch(`espn_cfb_box_v6:${eventId}`, async () => {
    try {
      return gameBoxFromSummary(await getJson(`${SITE}/summary?event=${eventId}`, fetchImpl), eventId);
    } catch (error) {
      console.warn(`[NCAAF box] ESPN box for game ${eventId} not retrieved: ${error.message}`);
      return { unavailable: true, reason: error.message };
    }
  }, { ttlMs: BOX_TTL_MS, enabled: fetchImpl === globalThis.fetch && !process.env.VITEST });
}

/** ESPN's roster positions and jerseys for one team, by athlete id: { positions: { id: 'RB' }, jerseys: { id: '99' } }
 * or { unavailable }. */
export async function getNcaafRosterPositions(teamId, { fetchImpl = globalThis.fetch } = {}) {
  if (teamId == null) return { unavailable: true, reason: 'no team id' };
  return cachedResearch(`espn_cfb_roster_v2:${teamId}`, async () => {
    try {
      const roster = await getJson(`${SITE}/teams/${teamId}/roster`, fetchImpl);
      const positions = {}, jerseys = {};
      for (const group of roster?.athletes || []) {
        for (const a of group?.items || []) {
          if (a?.id && a?.position?.abbreviation) positions[String(a.id)] = a.position.abbreviation;
          if (a?.id && a?.jersey != null) jerseys[String(a.id)] = String(a.jersey);
        }
      }
      return Object.keys(positions).length ? { positions, jerseys } : { unavailable: true, reason: 'ESPN roster empty' };
    } catch (error) {
      console.warn(`[NCAAF box] ESPN roster for team ${teamId} not retrieved: ${error.message}`);
      return { unavailable: true, reason: error.message };
    }
  }, { ttlMs: ROSTER_TTL_MS, enabled: fetchImpl === globalThis.fetch && !process.env.VITEST });
}

const sumOf = (players, category, key) => players.reduce((total, p) => total + (Number(p.stats?.[category]?.[key]) || 0), 0);

/**
 * Whether one team's player lines add up to its CFBD team line: carries, catches and pass attempts must all match
 * (the check the source audit asked for before any player line is shown). `teamLine` is CFBD's category-to-stat map.
 */
export function boxAddsUp(box, teamId, teamLine) {
  const players = (box?.players || []).filter((p) => p.teamId === String(teamId));
  const [completions, attempts] = String(teamLine?.get?.('completionAttempts') ?? '').split('-').map(Number);
  const carries = Number(teamLine?.get?.('rushingAttempts'));
  if (!players.length || ![completions, attempts, carries].every(Number.isFinite)) return false;
  return sumOf(players, 'rushing', 'rushingAttempts') === carries && sumOf(players, 'receiving', 'receptions') === completions
    && sumOf(players, 'passing', 'passingAttempts') === attempts;
}

/**
 * One team's player lines for one game, in the row shape the desk's readers use: name and position, the game id
 * the desk knows the game by, and the counts. Passing `interceptions` are thrown; the interceptions category's are
 * made by the defense.
 */
export function playerGameRows(box, teamId, gameId, positions = {}) {
  return (box?.players || []).filter((p) => p.teamId === String(teamId)).map((p) => {
    const s = (category, key) => p.stats?.[category]?.[key] ?? null;
    return { player: { id: p.id, first_name: p.first, last_name: p.last, position_abbreviation: positions[p.id] || '' }, game: { id: gameId },
      passing_completions: s('passing', 'completions'), passing_attempts: s('passing', 'passingAttempts'), passing_yards: s('passing', 'passingYards'),
      passing_touchdowns: s('passing', 'passingTouchdowns'), passing_interceptions: s('passing', 'interceptions'),
      rushing_attempts: s('rushing', 'rushingAttempts'), rushing_yards: s('rushing', 'rushingYards'), rushing_touchdowns: s('rushing', 'rushingTouchdowns'),
      receptions: s('receiving', 'receptions'), receiving_yards: s('receiving', 'receivingYards'), receiving_touchdowns: s('receiving', 'receivingTouchdowns'),
      fumbles_lost: s('fumbles', 'fumblesLost'),
      total_tackles: s('defensive', 'totalTackles'), sacks: s('defensive', 'sacks'), tackles_for_loss: s('defensive', 'tacklesForLoss'),
      passes_defended: s('defensive', 'passesDefended'), qb_hurries: s('defensive', 'hurries'), fumbles_recovered: s('fumbles', 'fumblesRecovered'),
      interceptions: s('interceptions', 'interceptions'),
      field_goals_made: s('kicking', 'fieldGoalsMade'), field_goal_attempts: s('kicking', 'fieldGoalAttempts'),
      extra_points_made: s('kicking', 'extraPointsMade'), extra_point_attempts: s('kicking', 'extraPointAttempts'),
      punts: s('punting', 'punts'), kick_returns: s('kickReturns', 'kickReturns'), punt_returns: s('puntReturns', 'puntReturns') };
  });
}

// What kind of score a scoring play was, from its text first: ESPN's play type is unreliable on returns ("Kickoff"
// on a missed field goal returned 100 yards, "Kickoff Return (Offense)" on a fumble return, no type at all on a
// fumble recovered in the end zone; weeks 6-8 of 2026). The text comes in two styles ("Jordan Shipp 5 Yd pass from
// Billy Edwards Jr." and "B. Atkinson pass to J. Legree for 50 yds, for a TD") and is read without the try in
// parentheses after it ("1 Yd Run (X pass to Y for Two-Point Conversion)" is a rushing TD). Returns are tested
// before the offense's plays, and a blocked punt before a punt return.
const play = (p) => String(p.text || '').replace(/\s*\(.*$/, '');
const KINDS = [
  [(p) => p.scoringType === 'field-goal' || (/\bfield goal\b/i.test(play(p)) && !/return|blocked/i.test(play(p))), 'field goal', 3],
  [(p) => p.scoringType === 'safety' || /\bsafety\b/i.test(play(p)), 'safety', 2],
  [(p) => p.scoringType === 'defensive-two-point-conversion' || /defensive (?:pat|two-point|2pt)/i.test(`${play(p)} ${p.type || ''}`), 'defensive two-point return', 2],
  // Overtime from the third period on is two-point plays only, each its own scoring play ("Levi Davis Two-Point Rush").
  [(p) => /two-point|2-point|\b2pt\b/i.test(play(p)), 'overtime two-point conversion', 2],
  [(p) => /interception return|\bintercepted\b/i.test(play(p)), 'interception-return TD'],
  [(p) => /blocked punt|punt\b.*\bblocked/i.test(play(p)), 'blocked-punt TD'],
  [(p) => /missed (?:fg|field goal)|blocked (?:fg|field goal|kick)|(?:fg|field goal)\b.*\bblocked/i.test(play(p)), 'field-goal-return TD'],
  [(p) => /punt return|\bpunts?\b.*\breturns?\b/i.test(play(p)), 'punt-return TD'],
  [(p) => /kickoff return|\bkick(?:off|s)?\b.*\breturns?\b/i.test(play(p)), 'kickoff-return TD'],
  [(p) => /fumble return|\bfumbled?\b.*\breturns?\b/i.test(play(p)), 'fumble-return TD'],
  // A fumble recovered in the end zone does not say whose fumble it was; the play type sometimes does.
  [(p) => /fumble/i.test(play(p)) && /\(own\)/i.test(p.type || ''), 'TD on the offense\'s own fumble recovery'],
  [(p) => /fumble/i.test(play(p)) && /\(opponent\)/i.test(p.type || ''), 'fumble-return TD'],
  [(p) => /fumble/i.test(play(p)), 'TD on a fumble recovery (whose fumble not on file)'],
  [(p) => /\bpass from\b|\bpass to\b.*\bfor a td\b/i.test(play(p)), 'passing TD'],
  [(p) => /\bYd (?:Run|Rush)\b|\brun for -?\d+ yds?\b.*\bfor a td\b/i.test(play(p)), 'rushing TD'],
];
const ORDER = ['rushing TD', 'passing TD', 'TD on the offense\'s own fumble recovery', 'interception-return TD', 'fumble-return TD',
  'TD on a fumble recovery (whose fumble not on file)', 'punt-return TD', 'kickoff-return TD', 'blocked-punt TD', 'field-goal-return TD',
  'field goal', 'overtime two-point conversion', 'safety', 'defensive two-point return'];
/** One scoring play's kind ("passing TD", "field goal") and the points it must carry, or null when it cannot be told. */
export function scoreKind(p) {
  const kind = KINDS.find(([test]) => test(p));
  return kind ? { kind: kind[1], value: kind[2] || null } : null;
}
const PLURAL = { 'TD on the offense\'s own fumble recovery': 'TDs on the offense\'s own fumble recoveries',
  'TD on a fumble recovery (whose fumble not on file)': 'TDs on fumble recoveries (whose fumbles not on file)', safety: 'safeties' };

/**
 * Where each team's points came from in one game: { [teamId]: { points, kinds: Map(kind -> count) } }, or null when
 * the scoring plays do not add up to the final (a missing play, a score that went down, a play whose kind cannot be
 * told). The side whose score went up on a play scored it; a touchdown's points include the try after it.
 */
export function pointsByKind(box) {
  const home = box?.teams?.find((t) => t.homeAway === 'home'), away = box?.teams?.find((t) => t.homeAway === 'away');
  if (!home || !away || !Array.isArray(box?.scoring)) return null;
  const out = { [home.id]: { points: 0, kinds: new Map() }, [away.id]: { points: 0, kinds: new Map() } };
  let h = 0, a = 0;
  for (const play of box.scoring) {
    if (!Number.isFinite(play.home) || !Number.isFinite(play.away)) return null;
    const dh = play.home - h, da = play.away - a;
    h = play.home; a = play.away;
    if (dh < 0 || da < 0 || (dh > 0) === (da > 0)) return null;
    const side = out[dh > 0 ? home.id : away.id], value = dh || da;
    const kind = scoreKind(play);
    if (!kind) return null;
    // A touchdown is worth 6 to 8 with its try; a field goal 3, a safety or a defensive return of a try 2.
    if (kind.value ? value !== kind.value : value < 6 || value > 8) return null;
    side.points += value;
    side.kinds.set(kind.kind, (side.kinds.get(kind.kind) || 0) + 1);
  }
  if (out[home.id].points !== home.score || out[away.id].points !== away.score) return null;
  return out;
}

/** "1 passing TD, 1 fumble-return TD, 2 field goals", or "no points". */
export function kindsInWords(kinds) {
  const words = ORDER.filter((k) => kinds.get(k)).map((k) => (kinds.get(k) === 1 ? `1 ${k}` : `${kinds.get(k)} ${PLURAL[k] || `${k}s`}`));
  return words.length ? words.join(', ') : 'no points';
}
