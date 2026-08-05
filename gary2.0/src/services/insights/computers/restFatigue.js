// gary2.0/src/services/insights/computers/restFatigue.js
//
// LANE: restFatigue
// "Schedule spot matters: games-in-a-row density."
//
// ONE signal, derived ONLY from documented BDL methods (no invented 'rest'
// field exists in the API). The lane's former second signal — bullpen
// workload — was REMOVED Jul 30 2026 (founder): bullpenFatigue.js owns pen
// workload outright; two lanes double-covering the same fact on different
// scales double-crowded the page.
//
//   Schedule density — there is no BDL rest endpoint, so each team's recent
//   game dates are assembled by walking the prior 10 calendar days
//   (date-1 .. date-10) and calling getMlbGamesForDate(d) (5-min cache, so a
//   10-day lookback is cheap and shared across lanes). For each prior date we
//   keep the team if it has a game that PLAYED (status STATUS_FINAL or
//   in-progress; STATUS_SCHEDULED / postponed are skipped). From those dates
//   we compute consecutiveDays (games on each immediately-preceding calendar
//   day) and gamesLast7. MLB plays near-daily, so we only surface a REAL
//   asymmetry: one side on a long unbroken streak while the OTHER side had
//   yesterday off, or a team grinding its 13th+ game in 13 days.
//
// VERIFIED live field names (probed against the real API):
//   * getMlbGamesForDate(d) -> game objects { id, status, date,
//     home_team:{id,abbreviation,display_name,...}, away_team/visitor_team:{...} }.
//     Date-only filter; ids[] are ignored by this endpoint, so we filter teams
//     out of each day's full slate ourselves.
//
// Rows: category 'restFatigue' (makeRow snake_cases -> rest_fatigue). tone
// CAUTION for the gassed side. team_id + game_id set. MAX 1 schedule row per
// game. Fully defensive: any missing piece -> skip silently; an end-of-computer
// summary log makes a 0-row run diagnosable.

import {
  makeRow, TONES, scoreFromEdge, nameKey, round, pickVariant, ordinal,
} from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';

// --- Schedule density tunables ---
const LOOKBACK_DAYS = 10;          // how many prior calendar days to assemble
const STREAK_DAYS_FOR_ROW = 6;     // a "long stretch" = games on >= N straight prior days
const GAMES_IN_DAYS_FOR_ROW = 13;  // 13th+ game in 13 days = an absolute grind flag
const SCHEDULE_BASE_RELEVANCE = 55;
const SCHEDULE_MAX_RELEVANCE = 65;


export async function computeRestFatigue(ctx) {
  const { date, games, bdl, helpers } = ctx;
  const rows = [];
  let examined = 0;

  // 1. Assemble each team's recently-PLAYED game dates + chronological game ids
  //    from the prior LOOKBACK_DAYS slates (one cheap cached call per day).
  let teamHistory = new Map();
  try {
    teamHistory = await buildTeamHistory(date, LOOKBACK_DAYS, bdl);
  } catch (err) {
    console.error('[restFatigue] history build error:', err?.message || err);
  }

  for (const game of games) {
    examined += 1;
    try {
      rows.push(...(await fatigueForGame(game, { date, teamHistory, gameLabel: helpers.gameLabel })));
    } catch (err) {
      console.error('[restFatigue] game error:', err?.message || err);
    }
  }

  // THE GARY LAYER (founder, Aug 5): the drop-down elaborates — it never
  // repeats the headline. Fenced to this lane's own computed facts.
  await attachLaneReads('restFatigue', rows, detailFact, {
    ask: 'what this schedule actually does to this team tonight — where the legs and the arms are, and what it sets up in this matchup',
  });

  console.log(`[restFatigue] examined ${examined}, emitted ${rows.length}`);
  return rows;
}

async function fatigueForGame(game, { date, teamHistory, gameLabel }) {
  const gameId = game?.id;
  if (gameId == null) return [];
  const label = gameLabel(game);

  const home = teamSide(game?.home_team);
  const away = teamSide(game?.visitor_team);
  if (!home || !away) return [];

  const out = [];

  // Bullpen workload moved to bullpenFatigue.js outright (founder, Jul 30):
  // two lanes were double-covering the same fact on different scales.
  // --- Schedule density (one row max, only on a real rest asymmetry) ---
  const scheduleRow = scheduleRowForGame({ home, away, label, gameId, date, teamHistory });
  if (scheduleRow) out.push(scheduleRow);

  return out;
}

// --------------------------------------------------------------------------
// Schedule density
// --------------------------------------------------------------------------

function scheduleRowForGame({ home, away, label, gameId, date, teamHistory }) {
  const h = scheduleSignals(home.id, date, teamHistory);
  const a = scheduleSignals(away.id, date, teamHistory);

  const yesterday = addDays(date, -1);
  const homePlayedYesterday = (teamHistory.get(home.id)?.dates || new Set()).has(yesterday);
  const awayPlayedYesterday = (teamHistory.get(away.id)?.dates || new Set()).has(yesterday);

  // Candidate: a grinding side whose opponent rested yesterday (real asymmetry),
  // or any side at its 13th+ game in 13 days. Build both, keep the most severe.
  const candidates = [];

  // Rest mismatch — long unbroken streak for one side, other side off yesterday.
  if (h.consecutiveDays >= STREAK_DAYS_FOR_ROW && !awayPlayedYesterday && homePlayedYesterday) {
    candidates.push(makeScheduleCandidate(home, away, h, gameId, label, 'mismatch'));
  }
  if (a.consecutiveDays >= STREAK_DAYS_FOR_ROW && !homePlayedYesterday && awayPlayedYesterday) {
    candidates.push(makeScheduleCandidate(away, home, a, gameId, label, 'mismatch'));
  }

  // Absolute grind — 13th+ game in 13 days regardless of the opponent.
  if (h.gamesInWindow >= GAMES_IN_DAYS_FOR_ROW) {
    candidates.push(makeScheduleCandidate(home, away, h, gameId, label, 'grind'));
  }
  if (a.gamesInWindow >= GAMES_IN_DAYS_FOR_ROW) {
    candidates.push(makeScheduleCandidate(away, home, a, gameId, label, 'grind'));
  }

  if (!candidates.length) return null;
  candidates.sort((x, y) => y.severity - x.severity);
  return candidates[0].row;
}

function makeScheduleCandidate(team, opp, sig, gameId, label, kind) {
  const gamesInWindow = sig.gamesInWindow;
  const windowDays = GAMES_IN_DAYS_FOR_ROW + 1; // prior 13 days + tonight
  const oppOff = kind === 'mismatch';

  // Each kind only asserts what its own gate measured: the mismatch row talks
  // about the UNBROKEN streak (consecutiveDays), the grind row about the
  // windowed count — never "no break" claims on a window that may include an
  // off day. Tonight is game day consecutiveDays + 1 of the streak.
  const headlineVariants = oppOff
    ? [
      `${team.label} is on its ${ordinal(sig.consecutiveDays + 1)} straight game day`,
      `${team.label} has played ${sig.consecutiveDays} days running — ${opp.label} rested yesterday`,
      `No off day for ${team.label} in ${sig.consecutiveDays} days`,
    ]
    : [
      `${team.label} is playing its ${ordinal(gamesInWindow)} game in ${windowDays} days`,
      `${team.label} has played ${gamesInWindow - 1} games in the last ${GAMES_IN_DAYS_FOR_ROW} days`,
      `${team.label} is deep in a ${gamesInWindow}-games-in-${windowDays}-days stretch`,
    ];
  const detailVariants = oppOff
    ? [
      `${team.label} has played on ${sig.consecutiveDays} consecutive days coming in. ${opp.label} had yesterday off.`,
      `Tonight makes ${sig.consecutiveDays + 1} straight game days for ${team.label}; ${opp.label} sat yesterday.`,
      `${team.label} has not had an off day in ${sig.consecutiveDays} days — ${opp.label} got one yesterday.`,
    ]
    : [
      `${team.label} has played ${gamesInWindow - 1} games over the previous ${GAMES_IN_DAYS_FOR_ROW} days and is back at it tonight.`,
      `That is ${gamesInWindow} games inside a ${windowDays}-day stretch.`,
      `${team.label}'s schedule has packed ${gamesInWindow} games into ${windowDays} days.`,
    ];

  const key = team.id ?? team.label;
  const headline = pickVariant(headlineVariants, key);
  const detail = pickVariant(detailVariants, key);

  // Severity drives both relevance and which single row wins for the game.
  const severity = (oppOff ? 6 : 0) + sig.consecutiveDays + Math.max(0, gamesInWindow - 12);
  const relevance = Math.min(
    SCHEDULE_MAX_RELEVANCE,
    SCHEDULE_BASE_RELEVANCE + (oppOff ? 5 : 0) + Math.max(0, gamesInWindow - 13),
  );

  const row = makeRow({
    category: 'restFatigue',
    headline,
    detail,
    game: label,
    value: 'B2B+',
    tone: TONES.CAUTION,
    relevance_score: relevance,
    team_id: team.id,
    game_id: gameId,
  });
  return { row, severity };
}

/**
 * Schedule signals for one team relative to `date`:
 *   consecutiveDays — games on each immediately-preceding calendar day, counted
 *                     back from yesterday until the first gap.
 *   gamesInWindow   — games played in the trailing window (date-1 .. date-13),
 *                     i.e. "Nth game in N days" when it reaches the threshold.
 */
function scheduleSignals(teamId, date, teamHistory) {
  const dates = teamHistory.get(teamId)?.dates || new Set();

  let consecutiveDays = 0;
  for (let i = 1; i <= LOOKBACK_DAYS; i++) {
    if (dates.has(addDays(date, -i))) consecutiveDays += 1;
    else break;
  }

  // "Nth game in N days" — count games in the trailing 13-day window. If the
  // team played every one of the last 13 days, that makes tonight the 14th game
  // in 14 days (today inclusive).
  let gamesInLast13 = 0;
  for (let i = 1; i <= 13; i++) {
    if (dates.has(addDays(date, -i))) gamesInLast13 += 1;
  }
  const gamesInWindow = gamesInLast13 + 1; // + tonight

  return { consecutiveDays, gamesInWindow };
}

// --------------------------------------------------------------------------
// History assembly
// --------------------------------------------------------------------------

/**
 * Walk the prior `lookback` calendar days and build per-team:
 *   { dates: Set<'YYYY-MM-DD'>, gameIds: number[] (chronological) }
 * keyed by numeric team id. Only games that PLAYED count (STATUS_FINAL or
 * in-progress); STATUS_SCHEDULED / postponed are skipped.
 */
async function buildTeamHistory(date, lookback, bdl) {
  const history = new Map();

  // Oldest -> newest so gameIds land in chronological order.
  for (let i = lookback; i >= 1; i--) {
    const d = addDays(date, -i);
    let slate = [];
    try {
      slate = (await bdl.getMlbGamesForDate(d)) || [];
    } catch (err) {
      console.error(`[restFatigue] slate fetch ${d} error:`, err?.message || err);
      slate = [];
    }
    if (!Array.isArray(slate)) continue;

    for (const g of slate) {
      if (!gamePlayed(g?.status)) continue;
      const teams = [g?.home_team, g?.away_team || g?.visitor_team];
      for (const t of teams) {
        const id = t?.id;
        if (id == null) continue;
        let entry = history.get(id);
        if (!entry) {
          entry = { dates: new Set(), gameIds: [] };
          history.set(id, entry);
        }
        entry.dates.add(d);
        if (g?.id != null) entry.gameIds.push(g.id);
      }
    }
  }

  return history;
}

/** A game counts toward fatigue only if it actually happened (or is live). */
function gamePlayed(status) {
  const s = String(status || '').toUpperCase();
  if (!s) return false;
  if (s.includes('SCHEDULED') || s.includes('POSTPONED') || s.includes('CANCEL')) return false;
  // STATUS_FINAL, STATUS_IN_PROGRESS, and any live/delayed in-game state count.
  return s.includes('FINAL') || s.includes('PROGRESS') || s.includes('LIVE')
    || s.includes('INNING') || s.includes('DELAY');
}

// --------------------------------------------------------------------------
// Small utilities
// --------------------------------------------------------------------------

/** Normalize a BDL team object into the fields this lane needs. */
function teamSide(team) {
  if (!team || team.id == null) return null;
  const label = team.abbreviation || team.display_name || team.name || team.full_name || 'Team';
  const names = [team.display_name, team.name, team.full_name, team.abbreviation]
    .map(nameKey)
    .filter(Boolean);
  return { id: team.id, label, names };
}

/** YYYY-MM-DD shifted by `delta` days via UTC math (no tz drift). */
function addDays(dateStr, delta) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const base = Date.UTC(y, (m || 1) - 1, d || 1);
  const shifted = new Date(base + delta * 86400000);
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export default { computeRestFatigue };
