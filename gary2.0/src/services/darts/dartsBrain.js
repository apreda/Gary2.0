// THE THROW (founder GO, Sep 24 2026): one question per category — "who are
// the best bets in this category today?" — asked of Gary over the WHOLE
// board. No player is hidden: a board small enough to read sheet by sheet
// (a one-game night, the first-inning board) comes in one ask with every
// sheet; a full board comes in two, the way a bettor works a slate: every
// priced player one line each, Gary names the sheets he wants, then he reads
// those sheets game by game and throws. The prop model's order is the order
// of the list and nothing more. Opus 5.5 at medium effort on the
// subscription. The ask is the product contract and founder facts only: how
// many, from which ids, over or under where the line is two-sided, the
// prices already know the season, his own last three days of throws in the
// category, reasons in words. A short or invalid answer is re-asked for
// exactly what is missing; only after two re-asks does the list's own order
// fill the last spot, and that dart says so in its model stamp.
import { createHash } from 'crypto';
import { createModelSession, sendToSessionWithRetry } from '../agentic/orchestrator/sessionManager.js';
import { RATIONALE_WRITING_RULE } from '../copy/writingRules.js';
import { DART_CATEGORIES, SIDED_KINDS, fmtOdds } from './dartsCommon.js';
import { CATEGORY_LABEL } from './dartsScreen.js';

export const DARTS_MODEL = process.env.GARY_DARTS_MODEL || 'claude-opus-5-5';
export const DARTS_EFFORT = process.env.GARY_DARTS_EFFORT || 'medium';
export const FORMULA_FILL = 'formula-fill';
/** A board this size or smaller is read sheet by sheet in one ask. */
export const WHOLE_BOARD_READ = 24;
/** How many sheets Gary names from a full board before he throws. */
export const SHEETS_WANTED = 12;
const TIMEOUT_MS = 10 * 60 * 1000;
const REASKS = 2;

export const buildDartsSystemPrompt = (dateLong) => `Today is ${dateLong}. You are Gary — the bettor whose picks publish in this app. You write as yourself, never as an AI or a system, and you have no favorite team.

Your training data is old; the board is current.

No emojis. Never mention data feeds, tools, or missing data.`;

/** On a one-game night each club gets one of these (founder, Sep 24 2026). */
export const PER_CLUB_ONE_GAME = ['passtd', 'int'];

export const PRICED_IN = "Every price on this board was set after each player's and each club's season and recent form were known.";
export const REASON_WORDS = 'Each reason names what you see and why, in words: no hit rates, no percentages, no probabilities, no break-even math, nothing about what a price asks for.';

const sideWord = (kind) => (kind === 'first_inning' ? 'yes or no' : SIDED_KINDS.has(kind) ? 'over or under' : null);
const unitOf = (kind) => (kind === 'first_inning' ? 'games' : 'players');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDay = (d) => { const [, m, dd] = String(d).split('-').map(Number); return m ? `${MONTHS[m - 1]} ${dd}` : String(d); };

/** A stored dart in words: "Austin Riley to homer +320". */
export function dartWords(d) {
  const line = String(d.prop || '').match(/[0-9.]+$/)?.[0];
  const words = {
    hr: `${d.player} to homer`,
    multihit: `${d.player} 2+ hits`,
    first_inning: `${d.matchup || d.player}: ${String(d.bet).toLowerCase() === 'under' ? 'no run' : 'a run'} in the 1st`,
    td: `${d.player} anytime touchdown`,
    qbtd: `${d.player} rushing touchdown`,
    int: `${d.player} ${String(d.bet || 'over').toLowerCase()} ${line ?? ''} interceptions`,
    passtd: `${d.player} ${String(d.bet || 'over').toLowerCase()} ${line ?? ''} passing touchdowns`,
    recyds: `${d.player} ${String(d.bet || 'over').toLowerCase()} ${line ?? ''} receiving yards`,
    rushyds: `${d.player} ${String(d.bet || 'over').toLowerCase()} ${line ?? ''} rushing yards`,
  }[d.kind] || `${d.player} ${d.prop} ${d.bet}`;
  return `${words.replace(/\s+/g, ' ').trim()}${d.odds != null ? ` ${fmtOdds(d.odds)}` : ''}`;
}

/** His own last days of throws in this category, as facts about his record. */
export function dartsHistoryBlock(label, history) {
  if (!history?.length) return `YOUR LAST THREE DAYS OF ${label} DARTS: none thrown.`;
  const byDay = new Map();
  for (const d of history) { if (!byDay.has(d.game_date)) byDay.set(d.game_date, []); byDay.get(d.game_date).push(d); }
  const days = [...byDay.keys()].sort().reverse();
  const outcome = (d) => (d.scratched_at ? 'scratched' : d.result || 'not settled');
  return `YOUR LAST THREE DAYS OF ${label} DARTS:\n${days.map((day) => `${shortDay(day)}: ${byDay.get(day).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).map((d) => `${dartWords(d)}, ${outcome(d)}`).join(' · ')}`).join('\n')}`;
}

const intro = (label, dateLong) => `THE ${label} BOARD — ${dateLong}. Today's darts: your fun leans, never on your record. Fans see them in the morning and throw them if they like; each one settles hit or miss after its game.`;

/** Entries grouped under their games (earliest first), each game's frame printed once. */
export function sheetsByGame(entries, blocks = new Map(), starts = new Map()) {
  const games = new Map();
  for (const e of entries) { const k = String(e.gameId ?? ''); if (!games.has(k)) games.set(k, []); games.get(k).push(e); }
  const order = [...games.keys()].sort((a, b) => (Date.parse(starts.get(a)) || 0) - (Date.parse(starts.get(b)) || 0));
  return order.map((k) => {
    const list = games.get(k);
    const body = list.map((e) => `  [${e.id}] ${e.sheet}`).join('\n\n');
    if (list.every((e) => e.standalone) || !blocks.get(k)) return body;
    return `GAME · ${blocks.get(k)}\n\n${body}`;
  }).join('\n\n\n');
}

/** Stage one of a full board: every priced entry in one line; Gary names the sheets he wants. */
export function buildBoardAsk({ kind, menu, dateLong, history = [], look = SHEETS_WANTED, note = null }) {
  const label = CATEGORY_LABEL[kind] || kind;
  const unit = unitOf(kind);
  return `${intro(label, dateLong)}

${PRICED_IN}

${dartsHistoryBlock(label, history)}

The ${label} board, one line each.${note ? ` ${note}` : ''}

${menu.map((m) => `[${m.id}] ${m.line}`).join('\n')}

Before you throw: name the ${look} whose full sheets you want in front of you (his games by date, opponent and arm, his splits, his price before tonight, and the game around him).

JSON only:

\`\`\`json
{ "look": ["[id from the board]"] }
\`\`\``;
}

/** The throw itself, over sheets grouped by game. `afterLook` = the second turn of a full board. */
export function buildCategoryAsk({ kind, count, sheets, dateLong, perClub = false, history = [], afterLook = false, note = null }) {
  const label = CATEGORY_LABEL[kind] || kind;
  const unit = unitOf(kind);
  const side = sideWord(kind);
  const head = afterLook
    ? 'Their sheets, game by game:'
    : `${intro(label, dateLong)}\n\n${PRICED_IN}\n\n${dartsHistoryBlock(label, history)}\n\nThe ${label} board, game by game, each game's frame and then each ${unit === 'games' ? 'game' : 'player'}'s sheet.${note ? ` ${note}` : ''}`;
  return `${head}

${sheets}

Which ${count} are the best bets in ${label} today? Best first, ${count} different ${unit}${perClub ? ', one from each club' : ''}${afterLook ? ', from anywhere on the board' : ''}.${side ? ` ${side[0].toUpperCase() + side.slice(1)}, your call on each.` : ''} For each one, two or three sentences on why, from what is in front of you. ${REASON_WORDS}

JSON only:

\`\`\`json
{ "darts": [ { "id": "[id from the board]"${side ? `, "side": "${side.replace(' or ', '|')}"` : ''}, "reason": "[two or three sentences]" } ] }
\`\`\`

${RATIONALE_WRITING_RULE}`;
}

export const DARTS_PROMPT_SHA = createHash('sha256')
  .update(buildDartsSystemPrompt('{date}')
    + buildBoardAsk({ kind: 'hr', menu: [{ id: 'B1', line: '{line}' }], dateLong: '{date}' })
    + buildCategoryAsk({ kind: 'hr', count: 5, sheets: '{sheets}', dateLong: '{date}', afterLook: true })
    + buildCategoryAsk({ kind: 'recyds', count: 5, sheets: '{sheets}', dateLong: '{date}' }))
  .digest('hex').slice(0, 12);

function parseJsonKey(text, key) {
  const raw = String(text || '');
  const fenced = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const tries = [...fenced.reverse(), raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)];
  for (const t of tries) {
    try { const parsed = JSON.parse(t); if (Array.isArray(parsed?.[key])) return parsed[key]; } catch { /* next */ }
  }
  return null;
}

const cleanId = (raw) => String(raw || '').trim().replace(/^\[|\]$/g, '');

const readSide = (kind, raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (kind === 'first_inning') return s.startsWith('n') ? 'no' : s.startsWith('y') ? 'yes' : null;
  if (SIDED_KINDS.has(kind)) return s.startsWith('u') ? 'under' : s.startsWith('o') ? 'over' : null;
  return null;
};

/** Which of an answer's darts hold against the board; what is still owed and why the rest dropped. */
export function accept(answer, { kind, menu, count, taken, perClub = false, board }) {
  const problems = [];
  const menuIds = new Set(menu.map((m) => m.id));
  for (const d of answer || []) {
    if (taken.length >= count) break;
    const id = cleanId(d?.id);
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

/** The list's own order fills what Gary left owed, and says so. */
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
 * Throw one category over the whole board. `menu` = every entry in the
 * model's order ({ id, gameId, sheet, line, standalone? }); `blocks` = game id
 * → the game's frame; `starts` = game id → start time; `history` = his last
 * three days of darts in this category. Returns Gary's darts in his order
 * (rank 1 first), the model that answered, how many the order filled, and
 * the ids he asked to read.
 */
export async function throwCategory({ league, kind, count, menu, board, dateLong, perClub = false, blocks = new Map(), starts = new Map(), history = [], note = null, session: given = null, log = console }) {
  if (!count || !menu.length) return { darts: [], model: DARTS_MODEL, filled: 0, looked: [] };
  const session = given || await createModelSession({
    modelName: DARTS_MODEL, systemPrompt: buildDartsSystemPrompt(dateLong), tools: [],
    thinkingLevel: DARTS_EFFORT, breakerLane: 'content', timeoutMs: TIMEOUT_MS,
  });
  let model = DARTS_MODEL;
  let message;
  let looked = [];
  let fillOrder = menu;
  if (menu.length <= WHOLE_BOARD_READ) {
    message = buildCategoryAsk({ kind, count, sheets: sheetsByGame(menu, blocks, starts), dateLong, perClub, history, note });
  } else {
    const want = Math.max(SHEETS_WANTED, count + 4);
    try {
      const res = await sendToSessionWithRetry(session, buildBoardAsk({ kind, menu, dateLong, history, look: want, note }), {});
      model = res.model || session.modelName || model;
      const ids = new Set(menu.map((m) => m.id));
      looked = [...new Set((parseJsonKey(res.content, 'look') || []).map(cleanId).filter((id) => ids.has(id)))].slice(0, want + 4);
    } catch (e) { log.warn(`[Darts] ${kind} board read failed: ${e.message}`); }
    if (looked.length < count) {
      log.warn(`[Darts] ${kind}: ${looked.length} sheets named; the list's order names the rest`);
      for (const m of menu) { if (looked.length >= want) break; if (!looked.includes(m.id)) looked.push(m.id); }
    }
    const lookedSet = new Set(looked);
    const chosen = menu.filter((m) => lookedSet.has(m.id));
    fillOrder = [...chosen, ...menu.filter((m) => !lookedSet.has(m.id))];
    message = buildCategoryAsk({ kind, count, sheets: sheetsByGame(chosen, blocks, starts), dateLong, perClub, history, afterLook: true });
  }
  const taken = [];
  for (let attempt = 0; attempt <= REASKS; attempt++) {
    let res;
    try { res = await sendToSessionWithRetry(session, message, {}); }
    catch (e) { log.warn(`[Darts] ${kind} ask ${attempt + 1} failed: ${e.message}`); break; }
    model = res.model || session.modelName || model;
    const answer = parseJsonKey(res.content, 'darts');
    const { missing, problems } = accept(answer, { kind, menu, count, taken, perClub, board });
    if (!missing) break;
    const shown = answer ? problems : ['no darts JSON in the answer'];
    message = `Still owed: ${missing} more in ${CATEGORY_LABEL[kind] || kind}.${shown.length ? ` ${shown.join('; ')}.` : ''} Already thrown: ${taken.map((t) => t.id).join(', ') || 'none'}. Return only the missing darts in the same JSON.`;
  }
  for (const t of taken) t.model ||= model;
  const filled = formulaFill({ kind, menu: fillOrder, count, taken, perClub, board });
  if (filled.length) log.warn(`[Darts] ${kind}: the list's order filled ${filled.length} of ${count}`);
  return { darts: taken.map((t, i) => ({ kind, ...t, rank: i + 1 })), model, filled: filled.length, looked };
}

export { DART_CATEGORIES };
