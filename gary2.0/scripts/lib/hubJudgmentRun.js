import { collectHubJudgmentContext } from '../../src/services/insights/hubJudgmentContext.js';
import { hubJudgmentSourceKey, synthesizeHubJudgments } from '../../src/services/insights/hubJudgment.js';

/** Failed verification withdraws only this exact partition's prior ready
 * cases. Original research and the complete previous argument stay intact. */
export function unavailableHubJudgments(args = {}, error) {
  const asOf = args.asOf || new Date().toISOString();
  const league = String(args.league || '').toLowerCase();
  const rows = (args.rows || []).map(row => {
    const copy = { ...row, meta: { ...(row.meta || {}) } };
    delete copy.meta.judgment;
    return copy;
  });
  const invalidations = [];
  for (const row of args.previousRows || []) {
    const previous = row?.meta?.judgment;
    if (previous?.status !== 'ready' || previous.date !== args.date
        || String(previous.league || '').toLowerCase() !== league
        || row.date !== args.date || String(row.league || '').toLowerCase() !== league
        || String(row.game_id) !== previous.game_id
        || hubJudgmentSourceKey(row) !== previous.primary_source_key) continue;
    invalidations.push({ ...JSON.parse(JSON.stringify(previous)), status: 'context_unavailable',
      as_of: asOf, valid_until: asOf });
  }
  return { rows, invalidations, skipped: [], failures: [{ stage: 'current_context',
    message: error?.message || String(error || 'Current game context unavailable') }] };
}

async function bounded(work, signal) {
  signal.throwIfAborted();
  let listener;
  try {
    return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => {
      listener = () => reject(signal.reason || new Error('Hub judgment pass cancelled'));
      signal.addEventListener('abort', listener, { once: true });
    })]);
  } finally { signal.removeEventListener('abort', listener); }
}

/** One reusable pass for the complete collector pool and lightweight refreshes
 * of published research. Neither path writes; publication is a separate step. */
export async function runHubJudgmentPass(args, { collectContext = collectHubJudgmentContext,
  synthesize = synthesizeHubJudgments, generateText, signal, budgetMs = 330_000,
  now = () => new Date().toISOString() } = {}) {
  signal?.throwIfAborted();
  const started = Date.now(), controller = new AbortController();
  const abort = () => controller.abort(signal?.reason || new Error('Hub judgment pass cancelled'));
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Hub judgment pass exceeded its deadline')), budgetMs);
  try {
    controller.signal.throwIfAborted();
    const asOf = args.asOf || now();
    const contextByGame = await bounded(() => collectContext({ ...args, asOf, signal: controller.signal,
      budgetMs: Math.min(90_000, budgetMs) }), controller.signal);
    controller.signal.throwIfAborted();
    return await bounded(() => synthesize({ ...args, asOf, contextByGame }, {
      generateText, signal: controller.signal, now,
      // Let synthesis settle completed games and its own per-game withdrawals
      // before the outer deadline handles a noncooperative dependency.
      budgetMs: Math.max(1, budgetMs - (Date.now() - started) - 1_000),
    }), controller.signal);
  } catch (error) {
    return unavailableHubJudgments({ ...args, asOf: now() }, error);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
