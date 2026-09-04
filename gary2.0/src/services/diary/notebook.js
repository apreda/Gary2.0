/**
 * THE NOTEBOOK (founder GO, Sep 3 2026): the reader's own record of his own
 * bets, built from his autopsies and put in front of him before the next
 * read. It is his memory, in his words, with the counts beside every line
 * so a hot week cannot sound like a law. Outcome realization and original
 * decision quality stay separate. Pure functions; no public-pick hook.
 */
import { AUTOPSY_REVIEW_VERSION } from './evidence.js';

/** What the reader said would decide it (extracted from his own card). */
export const REASON_TYPES = [
  'starter_recent_form',   // the starter's last few starts
  'starter_season',        // the starter's season numbers
  'pen_availability',      // who in the pen can go tonight
  'pen_season',            // the pen as a season unit
  'lineup_matchup',        // this lineup against this arm (handedness, form)
  'lineup_absence',        // regulars out / in
  'team_record',           // records, standings, streaks
  'run_differential',      // run differential, "the better team"
  'injury',                // an injury or return
  'park_weather',          // park, wind, weather
  'price',                 // the number itself
  'other',
];

/** What actually decided the game (from the play-by-play). */
export const MECHANISM_LABELS = [
  'starter_dominant', 'starter_knocked_out', 'pen_collapse', 'pen_shutdown', 'big_inning',
  'lineup_absence', 'platoon_edge', 'one_run_swing', 'defense', 'weather', 'other',
];

const SIDE_WORDS = /\b(fade|always|never|take the|bet the|back the|lay the|underdog|favorite|road team|home team)\b/i;

/** A note must be about a mechanism and an outcome, never a side. */
export function isSideNote(note) {
  return SIDE_WORDS.test(String(note || ''));
}

const rec = (rows) => {
  const g = rows.filter((r) => r.result === 'won' || r.result === 'lost');
  const w = g.filter((r) => r.result === 'won').length;
  return { n: g.length, w, l: g.length - w };
};

/** Per reason: descriptive results and evidence assessments, never factor weights. */
export function summarizeByReason(autopsies) {
  const by = new Map();
  for (const a of autopsies || []) {
    const k = REASON_TYPES.includes(a?.reason_type) ? a.reason_type : 'other';
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(a);
  }
  const out = [];
  for (const [reason, rows] of by) {
    const r = rec(rows);
    const assessments = rows.map((x) => x.decision_review?.assessment || 'unknown');
    out.push({
      reason, bets: rows.length, record: `${r.w}-${r.l}`, w: r.w, l: r.l,
      factualErrors: assessments.filter((x) => ['factual_error', 'mixed'].includes(x)).length,
      assumptions: assessments.filter((x) => ['unsupported_assumption', 'mixed'].includes(x)).length,
      noIdentifiedError: assessments.filter((x) => x === 'no_identified_error').length,
      unknown: assessments.filter((x) => x === 'unknown').length,
    });
  }
  return out.sort((a, b) => b.bets - a.bets);
}

const PLAIN = {
  starter_recent_form: "the starter's recent starts",
  starter_season: "the starter's season numbers",
  pen_availability: 'who in the pen could go',
  pen_season: 'the pen as a season unit',
  lineup_matchup: 'this lineup against this arm',
  lineup_absence: 'regulars out or back',
  team_record: 'records and streaks',
  run_differential: 'run differential, the better team',
  injury: 'an injury or a return',
  park_weather: 'park and weather',
  price: 'the number itself',
  other: 'something else',
};

/**
 * The notebook text for tonight: the reason table, then the newest notes,
 * favouring games involving tonight's clubs. Small counts are labelled
 * small. Empty when there is nothing yet.
 */
export function buildNotebook(autopsies, { homeTeam = null, awayTeam = null, maxNotes = 8, maxChars = 3200 } = {}) {
  // Prior autopsies judged the explanation from the result. Preserve those
  // rows in storage, but do not carry their hindsight lessons into new reads.
  const rows = (autopsies || []).filter((a) => a?.review_version === AUTOPSY_REVIEW_VERSION && a.decision_review && a.outcome_review);
  if (!rows.length) return { text: '', notes: 0 };
  const table = summarizeByReason(rows);
  const lines = [];
  lines.push('═══ YOUR NOTEBOOK — your own notes on your own bets this season ═══');
  lines.push('Wins and losses are outcomes, not proof about decision quality. These are case-specific reviews of the original evidence; no identified error is not proof of a good bet. Unknown means the preserved record cannot settle the question.');
  const games = new Set(rows.map((a) => `${a.game_date}|${a.game_id || `${a.away_team}@${a.home_team}`}`)).size;
  lines.push(`${rows.length} reviewed tickets from ${games} game${games === 1 ? '' : 's'}. Gary and notebook tickets from the same game are correlated observations, not independent evidence. Counts describe this sample and do not prescribe sides or factor weights.`);
  for (const t of table) {
    const small = t.bets < 8 ? ' (small count)' : '';
    lines.push(`- ${PLAIN[t.reason] || t.reason}: ${t.bets} tickets, result ${t.record}; factual errors ${t.factualErrors}, unsupported assumptions ${t.assumptions}, no identified error ${t.noIdentifiedError}, unknown ${t.unknown}${small}`);
  }
  const clubs = [homeTeam, awayTeam].filter(Boolean).map((s) => String(s).toLowerCase());
  const involves = (a) => clubs.some((c) => String(a.home_team || '').toLowerCase() === c || String(a.away_team || '').toLowerCase() === c);
  const sorted = rows.slice().sort((a, b) => (involves(b) - involves(a)) || String(b.game_date).localeCompare(String(a.game_date)));
  lines.push('');
  lines.push('Newest case reviews (a single outcome is not a new strategy):');
  let used = 0;
  for (const a of sorted) {
    if (used >= maxNotes) break;
    const note = a.note && !isSideNote(a.note) ? ` ${a.note}` : '';
    lines.push(`- ${a.game_date} ${a.away_team} @ ${a.home_team}, ${a.source === 'diary' ? 'notebook' : 'Gary'} took ${a.pick_text} (${a.result || 'ungraded'}): original decision ${a.decision_review.assessment || 'unknown'}; claim afterward ${a.outcome_review.claim_status || 'unknown'}; variance ${a.outcome_review.variance || 'unknown'}.${note}`);
    used += 1;
  }
  let text = lines.join('\n');
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 1).replace(/\n[^\n]*$/, '')}`;
  return { text, notes: rows.length };
}
