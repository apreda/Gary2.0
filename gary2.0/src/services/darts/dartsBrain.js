// THE THROW (founder GO, Sep 24 2026): one question per category — "who are
// the best bets in this category today?" — asked of Gary over the menu the
// dart screen built (the players the numbers put closest to the top, each with
// his sheet). Opus 5.5 at medium effort on the subscription. The ask is the
// product contract only: how many, from which ids, over or under where the
// line is two-sided, two or three sentences each. A short or invalid answer is
// re-asked for exactly what is missing; only after two re-asks does the menu's
// own order fill the last spot, and that dart says so in its model stamp.
import { createHash } from 'crypto';
import { createModelSession, sendToSessionWithRetry } from '../agentic/orchestrator/sessionManager.js';
import { RATIONALE_WRITING_RULE } from '../copy/writingRules.js';
import { DART_CATEGORIES, SIDED_KINDS } from './dartsCommon.js';
import { CATEGORY_LABEL } from './dartsScreen.js';

export const DARTS_MODEL = process.env.GARY_DARTS_MODEL || 'claude-opus-5-5';
export const DARTS_EFFORT = process.env.GARY_DARTS_EFFORT || 'medium';
export const FORMULA_FILL = 'formula-fill';
const TIMEOUT_MS = 10 * 60 * 1000;
const REASKS = 2;

export const buildDartsSystemPrompt = (dateLong) => `Today is ${dateLong}. You are Gary — the bettor whose picks publish in this app. You write as yourself, never as an AI or a system, and you have no favorite team.

Your training data is old; the board is current.

No emojis. Never mention data feeds, tools, or missing data.`;

/** On a one-game night each club gets one of these (founder, Sep 24 2026). */
export const PER_CLUB_ONE_GAME = ['passtd', 'int'];

const sideWord = (kind) => (kind === 'first_inning' ? 'yes or no' : SIDED_KINDS.has(kind) ? 'over or under' : null);

export function buildCategoryAsk({ league, kind, count, menu, dateLong, perClub = false }) {
  const label = CATEGORY_LABEL[kind] || kind;
  const unit = kind === 'first_inning' ? 'games' : 'players';
  const side = sideWord(kind);
  const entries = menu.map((m) => `[${m.id}] ${m.sheet}`).join('\n\n');
  return `THE ${label} BOARD — ${dateLong}. Today's darts: your fun leans, never bets, never graded, never on your record. Fans see them in the morning and throw them if they like.

The ${unit} the numbers put closest to the top today, in that order, each with his sheet:

${entries}

Which ${count} are the best bets in ${label} today? Best first, ${count} different ${unit}${perClub ? ', one from each club' : ''}.${side ? ` ${side[0].toUpperCase() + side.slice(1)}, your call on each.` : ''} For each one, two or three sentences on why, from the numbers in front of you.

JSON only:

\`\`\`json
{ "darts": [ { "id": "[id from the board]"${side ? `, "side": "${side.replace(' or ', '|')}"` : ''}, "reason": "[two or three sentences]" } ] }
\`\`\`

${RATIONALE_WRITING_RULE}`;
}

export const DARTS_PROMPT_SHA = createHash('sha256')
  .update(buildDartsSystemPrompt('{date}') + buildCategoryAsk({ league: 'MLB', kind: 'hr', count: 5, menu: [{ id: 'B1', sheet: '{sheet}' }], dateLong: '{date}' })
    + buildCategoryAsk({ league: 'NFL', kind: 'recyds', count: 5, menu: [{ id: 'P1', sheet: '{sheet}' }], dateLong: '{date}' }))
  .digest('hex').slice(0, 12);

function parseDarts(text) {
  const raw = String(text || '');
  const fenced = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const tries = [...fenced.reverse(), raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)];
  for (const t of tries) {
    try { const parsed = JSON.parse(t); if (Array.isArray(parsed?.darts)) return parsed.darts; } catch { /* next */ }
  }
  return null;
}

const readSide = (kind, raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (kind === 'first_inning') return s.startsWith('n') ? 'no' : s.startsWith('y') ? 'yes' : null;
  if (SIDED_KINDS.has(kind)) return s.startsWith('u') ? 'under' : s.startsWith('o') ? 'over' : null;
  return null;
};

/** Which of an answer's darts hold against the menu; what is still owed and why the rest dropped. */
export function accept(answer, { kind, menu, count, taken, perClub = false, board }) {
  const problems = [];
  const menuIds = new Set(menu.map((m) => m.id));
  for (const d of answer || []) {
    if (taken.length >= count) break;
    const id = String(d?.id || '').trim().replace(/^\[|\]$/g, '');
    if (!menuIds.has(id)) { problems.push(`${id} is not on the board`); continue; }
    if (taken.some((t) => t.id === id)) { problems.push(`${id} twice`); continue; }
    const reason = String(d?.reason || '').trim();
    if (!reason) { problems.push(`${id} has no reason`); continue; }
    if (perClub) {
      const club = board.candidates.get(id)?.team;
      if (taken.some((t) => board.candidates.get(t.id)?.team === club)) { problems.push(`${id} is a second ${club} pick; one from each club`); continue; }
    }
    let side = null;
    if (kind === 'first_inning' || SIDED_KINDS.has(kind)) {
      side = readSide(kind, d?.side);
      if (!side) { problems.push(`${id} needs a side (${sideWord(kind)})`); continue; }
      const c = board.candidates.get(id);
      const priced = kind === 'first_inning' ? (side === 'yes' ? c?.yes : c?.no) != null
        : (() => { const key = { recyds: 'rec', rushyds: 'rush', passtd: 'pass', int: 'int' }[kind]; return c?.[key]?.[side] != null; })();
      if (!priced) { problems.push(`${id} has no ${side} price`); continue; }
    }
    taken.push({ id, side, reason, model: null });
  }
  return { missing: Math.max(0, count - taken.length), problems };
}

/** The menu's own order fills what Gary left owed, and says so. */
export function formulaFill({ kind, menu, count, taken, perClub = false, board }) {
  const filled = [];
  for (const m of menu) {
    if (taken.length >= count) break;
    if (taken.some((t) => t.id === m.id)) continue;
    if (perClub) { const club = board.candidates.get(m.id)?.team; if (taken.some((t) => board.candidates.get(t.id)?.team === club)) continue; }
    const side = kind === 'first_inning' ? (m.side || 'yes') : SIDED_KINDS.has(kind) ? (m.side || 'over') : null;
    const reason = `Next on the board by the numbers: ${String(m.sheet).split('\n').slice(1, 3).map((l) => l.trim()).filter(Boolean).join(' ')}`.slice(0, 400);
    const dart = { id: m.id, side, reason, model: FORMULA_FILL };
    taken.push(dart); filled.push(dart);
  }
  return filled;
}

/**
 * Throw one category. Returns Gary's darts in his order (rank 1 first), the
 * model that answered, and how many the menu's order had to fill.
 */
export async function throwCategory({ league, kind, count, menu, board, dateLong, perClub = false, session: given = null, log = console }) {
  if (!count || !menu.length) return { darts: [], model: DARTS_MODEL, filled: 0 };
  const session = given || await createModelSession({
    modelName: DARTS_MODEL, systemPrompt: buildDartsSystemPrompt(dateLong), tools: [],
    thinkingLevel: DARTS_EFFORT, breakerLane: 'content', timeoutMs: TIMEOUT_MS,
  });
  const taken = [];
  let message = buildCategoryAsk({ league, kind, count, menu, dateLong, perClub });
  let model = DARTS_MODEL;
  for (let attempt = 0; attempt <= REASKS; attempt++) {
    let res;
    try { res = await sendToSessionWithRetry(session, message, {}); }
    catch (e) { log.warn(`[Darts] ${kind} ask ${attempt + 1} failed: ${e.message}`); break; }
    model = res.model || session.modelName || model;
    const answer = parseDarts(res.content);
    const { missing, problems } = accept(answer, { kind, menu, count, taken, perClub, board });
    if (!missing) break;
    const shown = answer ? problems : ['no darts JSON in the answer'];
    message = `Still owed: ${missing} more in ${CATEGORY_LABEL[kind] || kind}.${shown.length ? ` ${shown.join('; ')}.` : ''} Already thrown: ${taken.map((t) => t.id).join(', ') || 'none'}. Return only the missing darts in the same JSON.`;
  }
  for (const t of taken) t.model ||= model;
  const filled = formulaFill({ kind, menu, count, taken, perClub, board });
  if (filled.length) log.warn(`[Darts] ${kind}: the menu's order filled ${filled.length} of ${count}`);
  return { darts: taken.map((t, i) => ({ kind, ...t, rank: i + 1 })), model, filled: filled.length };
}

export { DART_CATEGORIES };
