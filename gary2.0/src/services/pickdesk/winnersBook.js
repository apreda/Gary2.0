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
      decision_policy: p.decision_policy || 'unstamped',
      pick_model: p.model || p.model_used || p.brain_model || 'unstamped',
      prompt_version: p.prompt_sha || p.june_prompt_sha || 'unstamped',
      review_model: candidate.review_model || 'unreviewed',
      status: candidate.status, reason: candidate.reason, board_reason: boardRow?.reason || null,
    };
  });
}

export const MLB_JUDGMENT_POLICY = 'mlb-judgment-v1';
export const MLB_SELECTION_POLICY = 'mlb-conviction-v3';

function sameCandidateSnapshot(saved, candidate) {
  return saved && String(saved.id) === String(candidate.id) && saved.ticket_key === candidate.ticket_key
    && saved.policy_version === candidate.policy_version && saved.kind === candidate.kind
    && candidateOutcomeIdentity(saved) !== null && candidateOutcomeIdentity(saved) === candidateOutcomeIdentity(candidate)
    && num(saved.odds) === num(candidate.odds)
    && ['decision_policy', 'model', 'prompt_sha', 'rationale'].every(key =>
      String(saved.pick_snapshot?.[key] ?? '') === String(candidate.pick_snapshot?.[key] ?? ''));
}

/** Preserve failed/incomplete attempts as operational records, not Gary rejections. */
function selectionHistory(candidate, selectionRuns, now) {
  return selectionRuns.filter(run => (run.input_snapshot?.candidates || []).some(saved => String(saved.id) === String(candidate.id)))
    .map(run => {
      const saved = (run.input_snapshot?.candidates || []).filter(row => String(row.id) === String(candidate.id));
      const ranked = run.selection?.ranked_candidates;
      const ids = (run.input_snapshot?.candidates || []).map(row => String(row.id));
      const rankedIds = Array.isArray(ranked) ? ranked.map(row => String(row.candidate_id)) : [];
      const validRanking = Array.isArray(ranked) && ranked.length > 0 && ranked.length === ids.length
        && new Set(ids).size === ids.length && new Set(rankedIds).size === ids.length
        && rankedIds.every(id => ids.includes(id)) && new Set(ranked.map(row => row.rank)).size === ranked.length
        && ranked.every(row => Number.isInteger(row.rank) && row.rank > 0 && row.rank <= ranked.length && typeof row.selected === 'boolean'
          && ['reason', 'expected_outcome', 'comparison'].every(key => typeof row[key] === 'string' && row[key].trim()));
      const entry = Array.isArray(ranked) ? ranked.find(row => String(row.candidate_id) === String(candidate.id)) : null;
      const started = instant(run.created_at), completed = instant(run.completed_at), kickoff = instant(candidate.commence_time);
      const snapshotMatches = saved.length === 1 && sameCandidateSnapshot(saved[0], candidate)
        && run.game_date === candidate.game_date && norm(run.league) === norm(candidate.league)
        && run.kind === candidate.kind && run.policy_version === MLB_SELECTION_POLICY;
      const timely = Number.isFinite(started) && Number.isFinite(completed) && completed >= started
        && completed < kickoff && completed <= now && instant(candidate.created_at) <= started
        && saved[0]?.status === 'qualified' && instant(saved[0]?.reviewed_at) <= started;
      const valid = run.status === 'completed' && snapshotMatches && timely && validRanking;
      return {
        run_id: run.id, status: run.status, policy_version: run.policy_version, cohort: run.cohort,
        window_start: run.window_start, created_at: run.created_at, completed_at: run.completed_at,
        model: run.model || 'unstamped', ms: run.ms ?? null, attempts: run.attempts, fingerprint: run.fingerprint,
        error: run.error || null, attempt_history: run.attempt_history || [], lease_until: run.lease_until || null,
        capacity: run.input_snapshot?.capacity || null, summary: run.selection?.summary || null,
        rank: entry?.rank ?? null, selected: typeof entry?.selected === 'boolean' ? entry.selected : null,
        reason: entry?.reason || null, expected_outcome: entry?.expected_outcome || null, comparison: entry?.comparison || null,
        valid_decision: valid,
        invalid_reason: !snapshotMatches ? 'candidate snapshot or policy mismatch'
          : run.status !== 'completed' ? `selection ${run.status}${run.error ? `: ${run.error}` : ''}`
          : !timely ? 'selection is not an original pregame decision at report time'
          : !validRanking ? 'incomplete or conflicting candidate ranking' : null,
      };
    }).sort((a, b) => (instant(a.created_at) || 0) - (instant(b.created_at) || 0));
}

/**
 * Public MLB coverage, including tickets that never entered the Winners queue.
 * Callers supply original daily_picks entries with their containing game_date.
 * Rows are never merged across policy eras; completed selection decisions are
 * distinct from qualification, retries, missing queue records and admissions.
 */
export function buildMlbSelectionBook({ publicPicks = [], candidates = [], board = [], events = [],
  selectionRuns = [], gameResults = [], now = Date.now() } = {}) {
  const outcomes = outcomeIndex(gameResults, gameTicketIdentity);
  const candidateRows = buildWinnersBook({ candidates, board, events, gameResults, now });
  const rowsById = new Map(candidateRows.map(row => [String(row.candidate_id), row]));
  const byTicket = new Map();
  for (const candidate of candidates.filter(row => norm(row.league) === 'mlb' && row.kind === 'game')) {
    const key = publicationKey({ ...candidate, pick_text: candidate.pick_snapshot?.pick || candidate.pick_text }, candidate.odds);
    if (key) { if (!byTicket.has(key)) byTicket.set(key, []); byTicket.get(key).push(candidate); }
  }
  return publicPicks.filter(p => norm(p.league || p.sport) === 'mlb' && p.type !== 'prop' && p.pickType !== 'prop').map((p, index) => {
    const identity = { game_date: p.game_date, league: 'MLB', game_id: p.game_id ?? p.bdl_game_id, pick_text: p.pick };
    const odds = num(p.odds), key = publicationKey(identity, odds);
    const matches = key ? byTicket.get(key) || [] : [];
    const candidate = matches.length === 1 ? matches[0] : null;
    const savedRow = candidate ? rowsById.get(String(candidate.id)) : null;
    const outcome = exactOutcome(outcomes, gameTicketIdentity(identity));
    const decisionPolicy = p.decision_policy || 'unstamped';
    const history = candidate ? selectionHistory(candidate, selectionRuns, now) : [];
    const decisions = history.filter(run => run.valid_decision);
    const latestDecision = decisions.at(-1);
    const selectedDecision = decisions.find(run => run.selected);
    const boardRow = candidate && board.find(row => String(row.candidate_id) === String(candidate.id));
    const row = {
      ...identity, kind: 'game', public_pick_id: p.pick_id || null, public_pick_index: p.public_pick_index ?? index,
      source: 'daily_picks', candidate_id: candidate?.id ?? null, candidate_ids: matches.map(c => c.id),
      ticket_key: candidate?.ticket_key || null, odds, ...outcome, units: unitsAtPrice(outcome.result, odds),
      group: savedRow?.group || 'unconsidered', timing_reason: savedRow?.timing_reason || null,
      published: savedRow?.published || false, decision_policy: decisionPolicy,
      policy_version: candidate?.policy_version || 'not_queued',
      pick_model: p.model || p.model_used || p.brain_model || 'unstamped',
      prompt_version: p.prompt_sha || p.june_prompt_sha || 'unstamped',
      review_model: candidate?.review_model || 'unreviewed', status: candidate?.status || 'not_queued',
      reason: candidate?.reason || null, board_reason: boardRow?.reason || null,
      candidate_recorded_at: candidate?.created_at || null, commence_time: p.commence_time || candidate?.commence_time || null,
      selection_history: history, selection_run_id: latestDecision?.run_id || null,
      selection_model: latestDecision?.model || null, selection_window: latestDecision?.window_start || null,
      selection_reason: latestDecision?.reason || null, selection_comparison: latestDecision?.comparison || null,
      expected_outcome: latestDecision?.expected_outcome || null,
    };
    if (!gameTicketIdentity(identity) || typeof p.pick !== 'string'
        || !['string', 'number'].includes(typeof identity.game_id)) {
      return { ...row, group: 'ledger_conflict', reason: 'Public pick lacks an exact date, league, game ID or ticket' };
    }
    if (matches.length > 1) return { ...row, group: 'ledger_conflict', reason: 'Multiple candidates match the original public ticket and price' };
    if (candidate && ['decision_policy', 'model', 'prompt_sha', 'rationale'].some(field =>
      String(p[field] ?? '') !== String(candidate.pick_snapshot?.[field] ?? ''))) {
      return { ...row, group: 'ledger_conflict', reason: 'Public decision and candidate snapshot disagree' };
    }
    if (decisionPolicy !== MLB_JUDGMENT_POLICY) return row;
    if (!candidate) return { ...row, reason: 'Original public ticket has no exact Winners candidate record' };
    if (candidate.policy_version !== MLB_SELECTION_POLICY) return { ...row, group: 'policy_mismatch', reason: 'Judgment pick lacks the Gary selection policy' };
    if (row.group === 'timing_excluded') return row;
    if (row.group === 'admitted') {
      const admissionDecision = decisions.find(run => run.selected && instant(run.completed_at) <= instant(boardRow?.admitted_at));
      return admissionDecision ? { ...row, selection_run_id: admissionDecision.run_id, selection_model: admissionDecision.model,
        selection_window: admissionDecision.window_start, selection_reason: admissionDecision.reason,
        selection_comparison: admissionDecision.comparison, expected_outcome: admissionDecision.expected_outcome }
        : { ...row, group: 'selection_record_missing', reason: 'Published Winners ticket has no exact completed pregame Gary selection' };
    }
    if (row.group === 'rejected') return { ...row, group: 'factual_blocked' };
    if (row.group !== 'qualified_not_admitted') return row;
    if (selectedDecision) return { ...row, group: 'selected_not_admitted', selection_run_id: selectedDecision.run_id,
      selection_reason: selectedDecision.reason, selection_comparison: selectedDecision.comparison,
      selection_window: selectedDecision.window_start, selection_model: selectedDecision.model, expected_outcome: selectedDecision.expected_outcome };
    if (latestDecision) return { ...row, group: 'considered_not_selected' };
    const attempt = history.at(-1);
    if (attempt) return { ...row, group: attempt.status === 'completed' ? 'selection_record_invalid'
      : ['failed', 'expired', 'selecting'].includes(attempt.status) ? `selection_${attempt.status}` : 'selection_record_invalid',
      reason: attempt.invalid_reason };
    return { ...row, group: 'qualified_unconsidered' };
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
