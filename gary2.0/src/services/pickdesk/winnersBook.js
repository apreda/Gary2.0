/** Prospective Winners accounting. No matchup, confidence or price substitutions. */
import { WINNERS_CUTOVER_DATE } from './winnersAdmissions.js';

const norm = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const num = value => value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const instant = value => value ? new Date(value).getTime() : NaN;
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : null;

export function gameTicketIdentity({ game_date, league, game_id, pick_text }) {
  const parts = [date(game_date), norm(league), norm(game_id), norm(pick_text)];
  return parts.every(Boolean) ? JSON.stringify(parts) : null;
}

export function propTicketIdentity({ game_date, sport, game_id, player_name, prop_type, line_value, bet }) {
  const parts = [date(game_date), norm(sport), norm(game_id), norm(player_name), norm(prop_type), num(line_value), norm(bet)];
  if (parts.some((part, index) => index === 5 ? part === null : !part)) return null;
  if (!['over', 'under'].includes(parts[6])) return null;
  return JSON.stringify(parts);
}

export function candidateOutcomeIdentity(candidate) {
  const p = candidate.pick_snapshot || {};
  return candidate.kind === 'game'
    ? gameTicketIdentity({ ...candidate, pick_text: p.pick || candidate.pick_text })
    : propTicketIdentity({ game_date: candidate.game_date, sport: candidate.league, game_id: candidate.game_id,
      player_name: p.player, prop_type: String(p.prop || p.prop_type || '').trim().toLowerCase()
        .replace(/\s+[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
      line_value: p.line, bet: p.bet });
}

const publicationKey = (row, odds) => {
  const identity = gameTicketIdentity(row), price = num(odds);
  return identity && price !== null && Math.abs(price) >= 100 ? JSON.stringify([identity, price]) : null;
};

/** One key for the exact immutable game ticket that appeared on the board. */
export function admittedGameKeys(board) {
  return new Set((board || []).filter(row => row.kind === 'game').map(row => publicationKey({
    ...row, pick_text: row.pick_snapshot?.pick,
  }, row.pick_snapshot?.odds)).filter(Boolean));
}

export function isWinnersGame({ gameDate, league, gameId, pickText, odds, boardKeys, legacyWinner = false }) {
  if (!date(gameDate)) return false;
  if (gameDate < WINNERS_CUTOVER_DATE) return legacyWinner;
  const key = publicationKey({ game_date: gameDate, league, game_id: gameId, pick_text: pickText }, odds);
  return key !== null && boardKeys.has(key);
}

const RESULT = { won: 'won', win: 'won', lost: 'lost', loss: 'lost', push: 'push', pushed: 'push', void: 'void', voided: 'void' };
export const normalizedResult = value => RESULT[norm(value)] || null;
export function unitsAtPrice(result, odds) {
  const value = num(odds);
  if (result === 'push' || result === 'void') return 0;
  if (value === null || Math.abs(value) < 100) return null;
  if (result === 'lost') return -1;
  if (result !== 'won') return null;
  return value > 0 ? value / 100 : 100 / Math.abs(value);
}

function outcomeIndex(results, identity) {
  const map = new Map();
  for (const result of results || []) {
    const key = identity(result);
    if (key) { if (!map.has(key)) map.set(key, []); map.get(key).push(result); }
  }
  return map;
}

/** Conflicting duplicate grades are held out, never selected by row order. */
function exactOutcome(index, key) {
  const found = key ? index.get(key) || [] : [];
  const grades = [...new Set(found.map(row => normalizedResult(row.result)).filter(Boolean))];
  if (grades.length > 1) return { result: null, grade_status: 'conflicting_grades' };
  return { result: grades[0] || null, grade_status: grades.length ? 'graded' : 'missing_grade' };
}

const decisionStatuses = new Set(['qualified', 'rejected', 'unavailable']);
function pregameGroup(candidate, boardRow, events, now) {
  if (String(candidate.policy_version).startsWith('legacy-captured-')) {
    return { group: 'timing_excluded', timing_reason: 'Previously published ticket preserved at cutover; not a prospective v2 review' };
  }
  const kickoff = instant(candidate.commence_time);
  const created = instant(candidate.created_at);
  if (!Number.isFinite(kickoff) || !Number.isFinite(created)) return { group: 'timing_excluded', timing_reason: 'missing creation or kickoff timestamp' };
  if (created >= kickoff) return { group: 'timing_excluded', timing_reason: 'candidate recorded at or after kickoff' };
  if (created > now) return { group: 'timing_excluded', timing_reason: 'candidate recorded after report time' };
  const cutoff = Math.min(kickoff, now);
  const before = value => Number.isFinite(instant(value)) && instant(value) < cutoff;
  const completed = (events || []).filter(event => decisionStatuses.has(event.event) && before(event.occurred_at) && instant(event.occurred_at) >= created);
  if (decisionStatuses.has(candidate.status) && before(candidate.reviewed_at) && instant(candidate.reviewed_at) >= created) {
    completed.push({ event: candidate.status, occurred_at: candidate.reviewed_at });
  }
  completed
    .sort((a, b) => instant(a.occurred_at) - instant(b.occurred_at));
  // A still-current decision is sufficient; expired records use their events.
  const last = completed.at(-1)?.event || null;
  if (boardRow) {
    if (boardRow.ticket_key !== candidate.ticket_key || boardRow.game_date !== candidate.game_date || boardRow.league !== candidate.league
        || boardRow.kind !== candidate.kind || boardRow.game_id !== candidate.game_id || !before(boardRow.admitted_at)
        || !before(candidate.reviewed_at) || instant(candidate.reviewed_at) > instant(boardRow.admitted_at)
        || candidateOutcomeIdentity(boardRow) !== candidateOutcomeIdentity(candidate)
        || num(boardRow.pick_snapshot?.odds) !== num(candidate.odds) || last !== 'qualified') {
      return { group: 'timing_excluded', timing_reason: 'admission or review is not an exact pregame record' };
    }
    return { group: 'admitted', timing_reason: null };
  }
  if (last === 'qualified') return { group: 'qualified_not_admitted', timing_reason: null };
  if (last === 'rejected' || last === 'unavailable') return { group: last, timing_reason: null };
  return { group: kickoff <= now ? 'unreviewed_at_kickoff' : 'awaiting_review', timing_reason: null };
}

export function buildWinnersBook({ candidates = [], board = [], events = [], gameResults = [], propResults = [], now = Date.now() } = {}) {
  const gameIndex = outcomeIndex(gameResults, gameTicketIdentity);
  const propIndex = outcomeIndex(propResults, propTicketIdentity);
  const boardById = new Map(board.map(row => [String(row.candidate_id), row]));
  const eventById = new Map();
  for (const event of events) {
    const id = String(event.candidate_id);
    if (!eventById.has(id)) eventById.set(id, []);
    eventById.get(id).push(event);
  }
  return candidates.map(candidate => {
    const p = candidate.pick_snapshot || {};
    const boardRow = boardById.get(String(candidate.id));
    const published = !!boardRow && boardRow.ticket_key === candidate.ticket_key
      && candidateOutcomeIdentity(boardRow) === candidateOutcomeIdentity(candidate)
      && num(boardRow.pick_snapshot?.odds) === num(candidate.odds);
    const group = pregameGroup(candidate, boardRow, eventById.get(String(candidate.id)), now);
    const outcome = exactOutcome(candidate.kind === 'game' ? gameIndex : propIndex, candidateOutcomeIdentity(candidate));
    const odds = num(candidate.odds); // never replace with today's or the grader's price
    return {
      candidate_id: candidate.id, game_date: candidate.game_date, league: candidate.league, kind: candidate.kind,
      game_id: candidate.game_id, pick_text: candidate.pick_text, ticket_key: candidate.ticket_key, odds,
      ...group, ...outcome, published, units: unitsAtPrice(outcome.result, odds),
      policy_version: candidate.policy_version || 'unstamped',
      pick_model: p.model || p.model_used || p.brain_model || 'unstamped',
      prompt_version: p.prompt_sha || p.june_prompt_sha || 'unstamped',
      review_model: candidate.review_model || 'unreviewed',
      status: candidate.status, reason: candidate.reason,
    };
  });
}

export function tallyWinnersBook(rows) {
  const won = rows.filter(row => row.result === 'won').length;
  const lost = rows.filter(row => row.result === 'lost').length;
  const push = rows.filter(row => row.result === 'push').length;
  const voided = rows.filter(row => row.result === 'void').length;
  const priced = rows.filter(row => ['won', 'lost'].includes(row.result) && row.units !== null);
  const units = priced.reduce((total, row) => total + row.units, 0);
  return { candidates: rows.length, games: new Set(rows.map(row => JSON.stringify([row.game_date, row.league, row.game_id]))).size,
    won, lost, push, voided, graded: won + lost + push + voided,
    missing: rows.filter(row => row.grade_status === 'missing_grade').length,
    conflicting: rows.filter(row => row.grade_status === 'conflicting_grades').length,
    unpriced: rows.filter(row => ['won', 'lost'].includes(row.result) && row.units === null).length,
    priced: priced.length, units, win_pct: won + lost ? 100 * won / (won + lost) : null,
    roi_pct: priced.length ? 100 * units / priced.length : null };
}
