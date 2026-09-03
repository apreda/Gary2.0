/**
 * THE AUTOPSY (founder GO, Sep 3 2026): after the final, the reader gets the
 * game he bet on — the thing Gary has never once seen — and grades his own
 * stated reason. What actually decided it, whether his reason was right,
 * wrong, or never mattered, and one line he would carry forward. The line
 * is a mechanism and an outcome, never a side (a side-note is dropped).
 *
 * One codex one-shot per pick on the subscription, no web search, its own
 * breaker lane ('codex-autopsy'). Fail-soft: an autopsy that fails is
 * simply absent from the notebook.
 */
import { codexCliOneShot } from '../agentic/orchestrator/providerAdapters/codexCliSession.js';
import { getScoringFlowAttributed, getMlbSchedule } from '../mlbStatsApiService.js';
import { REASON_TYPES, MECHANISM_LABELS, isSideNote } from './notebook.js';

export const AUTOPSY_MODEL = process.env.GARY_AUTOPSY_MODEL || 'gpt-5.6-sol';
export const AUTOPSY_TIMEOUT_MS = Number(process.env.GARY_AUTOPSY_TIMEOUT_MS) || 3 * 60 * 1000;

export const AUTOPSY_SYSTEM = `You are reading back a bet you made on a baseball game, now that the game is over and you have the play-by-play. You grade your own reasoning honestly. You never write a rule about which side to take; you write what decided the game and whether the reason you gave before the game was right, wrong, or never mattered. Output only the JSON asked for.`;

export const AUTOPSY_CONTRACT = `{
  "mechanism_stated": "in one sentence, the reason your card said would decide it",
  "reason_type": "${REASON_TYPES.join('|')}",
  "decided_by": "in one sentence, what actually decided the game, from the play-by-play",
  "mechanism_label": "${MECHANISM_LABELS.join('|')}",
  "reason_status": "right|wrong|irrelevant",
  "note": "one line you would carry to your next read: a mechanism and an outcome, never a side"
}`;

/** The game as text: the final, the scoring flow, and (when given) the pitching lines. Never throws. */
export async function gameStory({ gamePk, gameDate, homeTeam, awayTeam }) {
  const parts = [];
  try {
    const sched = await getMlbSchedule(gameDate);
    const g = (sched || []).find((x) => String(x?.gamePk) === String(gamePk));
    const hr = g?.linescore?.teams?.home?.runs;
    const ar = g?.linescore?.teams?.away?.runs;
    if (hr != null && ar != null) parts.push(`FINAL: ${awayTeam} ${ar}, ${homeTeam} ${hr}${g?.linescore?.currentInning > 9 ? ` (${g.linescore.currentInning} innings)` : ''}`);
    const innings = g?.linescore?.innings || [];
    if (innings.length) parts.push(`By inning (away/home): ${innings.map((i) => `${i.num}: ${i.away?.runs ?? 0}/${i.home?.runs ?? 0}`).join(' · ')}`);
  } catch { /* story without the final line */ }
  try {
    const flow = await getScoringFlowAttributed(gamePk);
    if (Array.isArray(flow) && flow.length) parts.push(`Scoring plays:\n${flow.slice(0, 40).join('\n')}`);
  } catch { /* no flow */ }
  return parts.join('\n\n');
}

export function buildAutopsyAsk({ homeTeam, awayTeam, gameDate, pickText, result, rationale, caseText, story }) {
  return `## THE BET (${gameDate}, ${awayTeam} at ${homeTeam})
You took ${pickText}. It ${result === 'won' ? 'WON' : result === 'lost' ? 'LOST' : 'was a push'}.

## WHAT YOU WROTE BEFORE THE GAME (your card)
${rationale || '(no card)'}
${caseText ? `\n## YOUR CASE FOR THAT SIDE\n${caseText}` : ''}

## THE GAME
${story || '(no play-by-play available)'}

Grade yourself. Name the reason your card leaned on, say what actually decided the game, and say whether your reason was right (it decided it your way), wrong (it decided it the other way), or irrelevant (the game turned on something else). Then one line to carry forward. A good line: "the pen was the story, not the starter's last three." A bad line, never write it: "fade road favorites." Output only this JSON, filled in:

\`\`\`json
${AUTOPSY_CONTRACT}
\`\`\``;
}

const line = (v, max = 300) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim().slice(0, max));
const pick = (v, list, fallback) => (list.includes(String(v || '').toLowerCase()) ? String(v).toLowerCase() : fallback);

/** The model's text → a normalized autopsy, or null. A side-note is blanked, never stored. */
export function parseAutopsy(text) {
  const s = String(text || '');
  const m = s.match(/```json\s*([\s\S]*?)```/i) || s.match(/(\{[\s\S]*\})/);
  if (!m) return null;
  let o;
  try { o = JSON.parse(m[1]); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const note = line(o.note);
  return {
    mechanism_stated: line(o.mechanism_stated),
    reason_type: pick(o.reason_type, REASON_TYPES, 'other'),
    decided_by: line(o.decided_by),
    mechanism_label: pick(o.mechanism_label, MECHANISM_LABELS, 'other'),
    reason_status: pick(o.reason_status, ['right', 'wrong', 'irrelevant'], null),
    note: isSideNote(note) ? '' : note,
    note_dropped_as_side: isSideNote(note),
  };
}

/** Run one autopsy. Never throws: { ok, autopsy, model, ms } or { ok:false, error }. */
export async function writeAutopsy(input, { oneShot = codexCliOneShot } = {}) {
  const t0 = Date.now();
  try {
    if (!input?.pickText || !input?.rationale) return { ok: false, error: 'missing pick or card' };
    const res = await oneShot(buildAutopsyAsk(input), {
      model: AUTOPSY_MODEL, effort: 'medium', search: false, systemPrompt: AUTOPSY_SYSTEM, timeoutMs: AUTOPSY_TIMEOUT_MS, breakerKey: 'codex-autopsy',
    });
    if (!res?.success) return { ok: false, error: res?.error || 'no answer', ms: Date.now() - t0 };
    const autopsy = parseAutopsy(res.data);
    if (!autopsy) return { ok: false, error: 'unparseable answer', ms: Date.now() - t0 };
    return { ok: true, autopsy, model: `codex-${AUTOPSY_MODEL}`, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), ms: Date.now() - t0 };
  }
}
