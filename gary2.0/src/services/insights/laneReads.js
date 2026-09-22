// gary2.0/src/services/insights/laneReads.js
//
// Hub research (founder, Sep 21 2026): each read is a short write-up — why
// the number looks that way, whether it holds, how a bettor can use it —
// written only from the lane's own fact sheet. (Supersedes the Sep 8
// observational-only register.)
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
// Default register (founder, Sep 21 2026): a real write-up, three to four
// compact sentences — why the number looks that way, whether it holds, how a
// bettor can use it. The Aug 24 "MLB size" rule capped football rows that ran
// 600-960 chars; this is the middle ground he asked for.
export async function attachLaneReads(lane, rows, factFor, { ask, sentences = '3-4', limit = SHIP_CAP, perGame = null, batch = 16, alwaysCategories = [] } = {}) {
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
  // Only what SHIPS gets a read. MLB lanes are capped per category by
  // postProcess (SHIP_CAP), so the strongest SHIP_CAP rows are the budget.
  // Football ships every row of a lane across a 16-game week, so football
  // lanes budget PER GAME instead (founder, Sep 21 2026: the rows under a
  // game must be write-ups, not computed sentences). Sort a copy — the
  // caller's row order is its own business.
  const ranked = [...(rows || [])]
    .sort((a, b) => (b?.relevance_score ?? 0) - (a?.relevance_score ?? 0));
  let candidates;
  if (Number.isInteger(perGame) && perGame > 0) {
    const seen = new Map();
    const always = new Set((alwaysCategories || []).map(String));
    candidates = [];
    for (const r of ranked) {
      const key = String(r?.game_id ?? r?.game ?? '');
      const n = seen.get(key) || 0;
      if (n >= perGame && !always.has(String(r?.category))) continue;
      seen.set(key, n + 1);
      candidates.push(r);
    }
  } else {
    candidates = ranked.slice(0, limit);
  }

  const eligible = [];
  for (const r of candidates) {
    let fact = null;
    try { fact = factFor(r); } catch { fact = null; }
    if (fact) eligible.push({ r, fact });
  }
  if (!eligible.length) return;

  const question = ask || 'why this number looks the way it does, whether it should hold, and how a bettor can use it';
  const promptFor = (items) => `You write the research write-ups in Gary's app: the reads a fan opens under each headline.

Angle for this lane: ${question}.
Take that angle as far as the supplied facts allow. Aim for ${sentences} compact sentences, with fewer when there is less evidence.

${HUB_RESEARCH_COPY_RULES}

Return STRICT JSON only: {"reads":[{"i":0,"read":"..."}]}

ITEMS:
${items.map((x, i) => `${i}. ${x.fact}`).join('\n')}`;

  // One bounded call per batch; a failed batch keeps its computed details.
  let attached = 0;
  const size = Math.max(1, Number(batch) || 16);
  for (let offset = 0; offset < eligible.length; offset += size) {
    const chunk = eligible.slice(offset, offset + size);
    try {
      const resp = await generateSolText(promptFor(chunk), { maxTokens: 8000 });
      const text = typeof resp === 'string' ? resp : (resp?.content ?? resp?.text ?? '');
      const jsonStr = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(jsonStr.slice(jsonStr.indexOf('{'), jsonStr.lastIndexOf('}') + 1));
      for (const item of uniqueResearchEntries(parsed?.reads, chunk.length)) {
        const x = chunk[item?.i];
        const read = typeof item?.read === 'string' ? item.read.trim() : '';
        if (!x || read.length < 60 || !researchCopyIsSupported(read, x.fact)) continue;
        x.r.meta = { ...(x.r.meta || {}), computed_detail: x.r.meta?.computed_detail || x.r.detail, read,
          research_copy_version: HUB_RESEARCH_COPY_VERSION };
        x.r.detail = read;
        attached += 1;
      }
    } catch (err) {
      console.error(`[laneReads] ${lane} batch ${offset / size + 1} failed (computed details kept):`, err?.message || err);
    }
  }
  console.log(`[laneReads] ${lane}: ${attached}/${eligible.length} reads attached`);
}
