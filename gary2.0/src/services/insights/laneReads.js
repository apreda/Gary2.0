// gary2.0/src/services/insights/laneReads.js
//
// THE GARY LAYER (founder, Jul 30 2026): a lane's drop-down must never
// regurgitate its headline — it elaborates. The connection an average fan
// couldn't make: what the number actually means, the context around it, and
// what it sets up tonight. One batched model call PER LANE over the lane's
// own computed facts; the model is fenced to those facts (prevent-fabrication:
// nothing generates that isn't in the fact sheet). Non-blocking by contract —
// any failure keeps the computed detail. Same pattern fantasyPickups and
// closerWatch proved in (writeAnalystReads / writeReads), centralized.
import { generateSolText } from './solText.js';

// Mirrors generateInsightConnections.postProcess's maxPerCategory: the number
// of rows a single lane can put on the page. Reads are written for those rows
// and no others.
const SHIP_CAP = 8;

/**
 * The default fact sheet: a lane's computed detail is ALREADY a grounded,
 * number-dense sentence — it is the evidence, so it is what Gary reads over.
 * Lanes with richer meta (bullpen arms, h2h ledgers) pass their own factFor
 * and get a denser sheet; everything else uses this.
 */
export const detailFact = (r) => {
  if (!r || !r.detail) return null;
  const val = r.value ? ` (${r.value})` : '';
  return `${r.headline}${val}. ${r.detail}${r.game ? ` Tonight: ${r.game}.` : ''}`;
};

/**
 * Attach a Gary read to each row: r.detail becomes the read, the computed
 * detail is preserved at meta.computed_detail, and meta.read carries the read
 * for surfaces that want both.
 *
 * @param {string} lane      log label
 * @param {Array}  rows      the lane's surfaced rows
 * @param {Function} factFor row -> one-line grounded fact sheet (null skips)
 * @param {object} opts      { ask, sentences, limit } — the lane-specific question
 */
// Default register = MLB's measured card length (founder, Aug 24: football
// rows under the picks ran 600-960 chars against MLB's 200-300 — "those super
// long text parts... should be the same size we have for MLB parts"). The old
// '3-5' default was the whole gap: no football lane overrode it.
export async function attachLaneReads(lane, rows, factFor, { ask, sentences = '2-3', limit = SHIP_CAP } = {}) {
  // Only what SHIPS gets a read. The orchestrator keeps the strongest
  // SHIP_CAP rows per category (postProcess), so a lane handing us 25 hot
  // bats would otherwise buy 17 reads that never reach a screen. Sort a copy
  // — the caller's row order is its own business.
  const candidates = [...(rows || [])]
    .sort((a, b) => (b?.relevance_score ?? 0) - (a?.relevance_score ?? 0))
    .slice(0, limit);

  const eligible = [];
  for (const r of candidates) {
    let fact = null;
    try { fact = factFor(r); } catch { fact = null; }
    if (fact) eligible.push({ r, fact });
  }
  if (!eligible.length) return;

  const facts = eligible.map((x, i) => `${i}. ${x.fact}`).join('\n');
  const question = ask ||
    'the read a casual fan could not make on his own — what the numbers actually mean, why they matter tonight, and what they set up';
  const prompt = `You are Gary — the bettor whose analysis publishes in this app. You write as yourself, never as an AI. Your training data is old: the facts below are current and they are ALL you may use — never introduce a statistic, player, injury, or trend that is not listed.

For each item: ${question}. ${sentences} sentences each, plain speech, no emojis, never mention data feeds, tools, or missing data.

The reader already has the numbers above — start where a summary of them would end. Never restate the item back, and never close by hedging that it might not hold up.

Return STRICT JSON only: {"reads":[{"i":0,"read":"..."}]}

ITEMS:
${facts}`;

  try {
    const resp = await generateSolText(prompt, { maxTokens: 8000 });
    const text = typeof resp === 'string' ? resp : (resp?.content ?? resp?.text ?? '');
    const jsonStr = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(jsonStr.slice(jsonStr.indexOf('{'), jsonStr.lastIndexOf('}') + 1));
    let attached = 0;
    for (const item of parsed?.reads || []) {
      const x = eligible[item?.i];
      const read = String(item?.read || '').trim();
      if (!x || read.length < 60) continue;
      x.r.meta = { ...(x.r.meta || {}), computed_detail: x.r.detail, read };
      x.r.detail = read;
      attached += 1;
    }
    console.log(`[laneReads] ${lane}: ${attached}/${eligible.length} reads attached`);
  } catch (err) {
    console.error(`[laneReads] ${lane} failed (computed details kept):`, err?.message || err);
  }
}
