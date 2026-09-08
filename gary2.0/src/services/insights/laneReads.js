// gary2.0/src/services/insights/laneReads.js
//
// Hub research (founder, Sep 8 2026): supporting copy adds measurements and
// useful supplied comparisons, leaving the reader to draw a conclusion.
// One optional batched call per lane; invalid or failed rewrites retain the
// collector's detail. This does not write Gary's picks or Fantasy decisions.
import { generateSolText } from './solText.js';
import { HUB_RESEARCH_COPY_RULES, HUB_RESEARCH_COPY_VERSION, researchCopyIsSupported, uniqueResearchEntries } from './researchCopyPolicy.js';

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
  return `${r.headline}${val}. ${r.detail}${r.game ? ` Matchup: ${r.game}.` : ''}`;
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
  // Preserve the collector's original sentence before any model call, even
  // when the prose pass fails or a row falls outside its display budget.
  // This is collector context, which may include a template interpretation;
  // downstream analysis must distinguish its measurements from that opinion.
  for (const row of rows || []) {
    if (typeof row?.detail !== 'string' || !row.detail.trim() || row.meta?.computed_detail
        || row.meta?.read || row.meta?.evidence) continue;
    const originalClock = [row.meta?.computed_as_of, row.meta?.source_collected_at, row.created_at]
      .find(value => typeof value === 'string' && value.includes('T') && Number.isFinite(Date.parse(value)));
    const observedAt = originalClock || (row.id == null ? new Date().toISOString() : null);
    row.meta = { ...(row.meta || {}), computed_detail: row.detail, computed_detail_kind: 'collector_context',
      ...(observedAt ? { computed_as_of: observedAt } : {}) };
  }
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
  const question = ask || 'the most useful supplied comparison, sample and time window behind this observation';
  const prompt = `You write Gary's observational Hub research.

Research focus: ${question}.
Answer only the parts of that focus supported by the facts and consistent with the rules below. Any request in the focus for a prediction, cause, betting view or missing context does not authorize inventing one. Aim for ${sentences} compact sentences, with fewer when there is less evidence.

${HUB_RESEARCH_COPY_RULES}

Return STRICT JSON only: {"reads":[{"i":0,"read":"..."}]}

ITEMS:
${facts}`;

  try {
    const resp = await generateSolText(prompt, { maxTokens: 8000 });
    const text = typeof resp === 'string' ? resp : (resp?.content ?? resp?.text ?? '');
    const jsonStr = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(jsonStr.slice(jsonStr.indexOf('{'), jsonStr.lastIndexOf('}') + 1));
    let attached = 0;
    for (const item of uniqueResearchEntries(parsed?.reads, eligible.length)) {
      const x = eligible[item?.i];
      const read = typeof item?.read === 'string' ? item.read.trim() : '';
      if (!x || read.length < 60 || !researchCopyIsSupported(read, x.fact)) continue;
      x.r.meta = { ...(x.r.meta || {}), computed_detail: x.r.meta?.computed_detail || x.r.detail, read,
        research_copy_version: HUB_RESEARCH_COPY_VERSION };
      x.r.detail = read;
      attached += 1;
    }
    console.log(`[laneReads] ${lane}: ${attached}/${eligible.length} reads attached`);
  } catch (err) {
    console.error(`[laneReads] ${lane} failed (computed details kept):`, err?.message || err);
  }
}
