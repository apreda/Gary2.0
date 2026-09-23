// The throw: one call per league per run on the subscription (Sonnet, Terra
// behind it; Fable and Astra stay on the real picks). The ask is the product
// contract only: how many darts per category, from the ids on the board, two
// sentences each. Gary always throws; a short or invalid answer is re-asked
// for exactly what is missing.
import { createHash } from 'crypto';
import { createModelSession, sendToSessionWithRetry } from '../agentic/orchestrator/sessionManager.js';
import { RATIONALE_WRITING_RULE } from '../copy/writingRules.js';
import { DART_CATEGORIES } from './dartsCommon.js';

// Opus 5.5 at high (founder, Sep 23 2026: the leans "take serious decision-making").
export const DARTS_MODEL = process.env.GARY_DARTS_MODEL || 'claude-opus-5-5';
const TIMEOUT_MS = 15 * 60 * 1000;
const REASKS = 2;

export const buildDartsSystemPrompt = (dateLong) => `Today is ${dateLong}. You are Gary — the bettor whose picks publish in this app. You write as yourself, never as an AI or a system, and you have no favorite team.

Your training data is old; the board is current.

No emojis. Never mention data feeds, tools, or missing data.`;

const CATEGORY_ASK = {
  hr: (k) => `HOME RUN: ${k} batters to hit a home run.`,
  multihit: (k) => `2+ HITS: ${k} batters to get two or more hits.`,
  first_inning: (k) => `FIRST-INNING RUN: ${k} games, each a yes (a run scores in the 1st inning) or a no.`,
  td: (k) => `ANYTIME TD: ${k} players to score a touchdown.`,
  qbtd: (k) => `QB RUSHING TD: ${k} quarterbacks to run one in.`,
  recyds: (k) => `RECEIVING YARDS: ${k} receivers over their line.`,
  passtd: (k) => `PASSING TDS: ${k} quarterbacks over their line.`,
  int: (k) => `INTERCEPTION THROWN: ${k} quarterbacks to throw one.`,
};

export function buildDartsAsk(league, needed) {
  const rows = DART_CATEGORIES[league].filter((c) => needed[c.kind] > 0).map((c) => `- ${CATEGORY_ASK[c.kind](needed[c.kind])}`);
  return `THE DARTS. Today's darts are your fun leans on this board: never bets, never graded, never on your record. Fans see them in the morning and throw them if they like.

Throw exactly this many in each category, each one a different player (or game) within its category, using the [id] printed beside that category's price on the board:
${rows.join('\n')}

For each dart, two sentences on why.

Output:

\`\`\`json
{ "darts": [ { "category": "${DART_CATEGORIES[league][0].kind}", "id": "[id from the board]", ${league === 'MLB' ? '"side": "yes or no (first-inning only)", ' : ''}"reason": "[two sentences]" } ] }
\`\`\`

category is one of: ${DART_CATEGORIES[league].map((c) => c.kind).join(', ')}.

${RATIONALE_WRITING_RULE}`;
}

export const DARTS_PROMPT_SHA = createHash('sha256')
  .update(buildDartsSystemPrompt('{date}') + buildDartsAsk('MLB', { hr: 5, multihit: 5, first_inning: 5 }) + buildDartsAsk('NFL', { td: 5, qbtd: 5, recyds: 5, passtd: 5, int: 5 }))
  .digest('hex')
  .slice(0, 12);

function parseDarts(text) {
  const raw = String(text || '');
  const fenced = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const tries = [...fenced.reverse(), raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)];
  for (const t of tries) {
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed?.darts)) return parsed.darts;
    } catch { /* next */ }
  }
  return null;
}

/**
 * Validate one answer against the board. Keeps the valid darts, returns what
 * is still missing per category and why the rest were dropped.
 */
function accept(answer, board, needed, taken) {
  const problems = [];
  for (const d of answer || []) {
    const kind = String(d?.category || '').trim();
    const id = String(d?.id || '').trim().replace(/^\[|\]$/g, '');
    if (!(kind in needed)) { problems.push(`unknown category "${kind}"`); continue; }
    if (taken[kind].length >= needed[kind]) continue;
    if (!board.eligible[kind]?.includes(id)) { problems.push(`${id} is not on the board for ${kind}`); continue; }
    if (taken[kind].some((t) => t.id === id)) { problems.push(`${id} twice in ${kind}`); continue; }
    const reason = String(d?.reason || '').trim();
    if (!reason) { problems.push(`${id} in ${kind} has no reason`); continue; }
    let side = null;
    if (kind === 'first_inning') {
      side = /^n/i.test(String(d?.side || '')) ? 'no' : /^y/i.test(String(d?.side || '')) ? 'yes' : null;
      if (!side) { problems.push(`${id} in first_inning needs side yes or no`); continue; }
      const c = board.candidates.get(id);
      if ((side === 'yes' ? c.yes : c.no) == null) { problems.push(`${id} has no ${side} price`); continue; }
    }
    taken[kind].push({ id, side, reason });
  }
  const missing = Object.fromEntries(Object.entries(needed).map(([k, v]) => [k, Math.max(0, v - taken[k].length)]));
  return { missing, problems };
}

/**
 * @returns {{ darts: Array<{kind,id,side,reason}>, model: string, missing: Record<string,number> }}
 */
export async function throwDarts({ league, board, needed, dateLong }) {
  const session = await createModelSession({
    modelName: DARTS_MODEL,
    systemPrompt: buildDartsSystemPrompt(dateLong),
    tools: [],
    thinkingLevel: 'high',
    breakerLane: 'content',
    timeoutMs: TIMEOUT_MS,
  });
  const taken = Object.fromEntries(Object.keys(needed).map((k) => [k, []]));
  let message = `${board.text}\n\n${buildDartsAsk(league, needed)}`;
  let model = DARTS_MODEL;
  let missing = needed;
  for (let attempt = 0; attempt <= REASKS; attempt++) {
    const res = await sendToSessionWithRetry(session, message, {});
    model = res.model || session.modelName || model;
    const answer = parseDarts(res.content);
    const checked = accept(answer, board, needed, taken);
    missing = checked.missing;
    const short = Object.entries(missing).filter(([, v]) => v > 0);
    if (!short.length) break;
    const problems = answer ? checked.problems : ['no darts JSON in the answer'];
    const usedIds = Object.entries(taken).map(([k, list]) => `${k}: ${list.map((t) => t.id).join(', ') || 'none'}`).join('; ');
    message = `Still owed: ${short.map(([k, v]) => `${v} more ${k}`).join(', ')}.${problems.length ? ` ${problems.join('; ')}.` : ''} Already thrown: ${usedIds}. Return only the missing darts in the same JSON.`;
  }
  const darts = Object.entries(taken).flatMap(([kind, list]) => list.map((t) => ({ kind, ...t })));
  return { darts, model, missing };
}
