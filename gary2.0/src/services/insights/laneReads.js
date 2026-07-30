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

/**
 * Attach a Gary read to each row: r.detail becomes the read, the computed
 * detail is preserved at meta.computed_detail, and meta.read carries the read
 * for surfaces that want both.
 *
 * @param {string} lane      log label
 * @param {Array}  rows      surfaced lane rows (post-cap — only what ships)
 * @param {Function} factFor row -> one-line grounded fact sheet (null skips)
 * @param {object} opts      { ask, sentences } — the lane-specific question
 */
export async function attachLaneReads(lane, rows, factFor, { ask, sentences = '3-5' } = {}) {
  const eligible = [];
  for (const r of rows || []) {
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
