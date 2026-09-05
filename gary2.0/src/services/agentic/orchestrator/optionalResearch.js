import { abortError, awaitWithSignal, requestSignal, withRequestSignal } from './requestCancellation.js';

export function researchBudgetMs({ configuredMs = 20 * 60 * 1000, deadlineAt, decisionReserveMs = 8 * 60 * 1000, now = Date.now() } = {}) {
  const configured = Number.isFinite(Number(configuredMs)) && Number(configuredMs) >= 0 ? Number(configuredMs) : 20 * 60 * 1000;
  const reserve = Number.isFinite(Number(decisionReserveMs)) && Number(decisionReserveMs) >= 0 ? Number(decisionReserveMs) : 8 * 60 * 1000;
  const deadline = typeof deadlineAt === 'number' ? deadlineAt : Date.parse(deadlineAt);
  return Number.isFinite(deadline) ? Math.max(0, Math.min(configured, deadline - now - reserve)) : configured;
}

// Brain-model retries within one child reuse the original desk's research,
// including an unavailable result. A changed desk/date has a different key.
const researchByDesk = new Map();
export function runResearchOnce(cacheKey, options) {
  options.signal?.throwIfAborted();
  if (researchByDesk.has(cacheKey)) return researchByDesk.get(cacheKey);
  const pending = runOptionalResearch(options);
  researchByDesk.set(cacheKey, pending);
  if (researchByDesk.size > 32) researchByDesk.delete(researchByDesk.keys().next().value);
  pending.catch(() => { if (researchByDesk.get(cacheKey) === pending) researchByDesk.delete(cacheKey); });
  return pending;
}

/** One budget for the entire optional researcher cascade, including retries. */
export async function runOptionalResearch({ models, build, timeoutMs, signal: parentSignal, onAttempt = () => {}, onFailure = () => {} }) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const signal = requestSignal(controller.signal, parentSignal);
  signal.throwIfAborted();
  if (timeoutMs <= 0) return { result: null, model: null, failures: ['research skipped to preserve decision time before the child deadline'], timedOut: true, elapsedMs: 0 };
  const budgetError = abortError(`research briefing budget exhausted after ${timeoutMs / 1000}s`);
  budgetError.code = 'RESEARCH_BUDGET_EXHAUSTED';
  const timer = setTimeout(() => controller.abort(budgetError), timeoutMs);
  const failures = [];
  try {
    for (const researchModel of models) {
      try {
        signal.throwIfAborted();
        onAttempt(researchModel);
        const result = await withRequestSignal(signal, () => awaitWithSignal(() => build(researchModel, signal), signal));
        signal.throwIfAborted();
        const briefing = typeof result === 'string' ? result : result?.briefing;
        if (typeof briefing !== 'string' || !briefing.trim()) throw new Error('the research assistant returned an empty briefing');
        return { result, model: researchModel, failures, timedOut: false, elapsedMs: Date.now() - startedAt };
      } catch (error) {
        // Cancellation of the whole game must propagate; only the optional
        // research deadline is allowed to continue to a decision without it.
        parentSignal?.throwIfAborted();
        if (signal.aborted && signal.reason !== budgetError) throw signal.reason;
        failures.push(`${researchModel}: ${error.message}`);
        onFailure(researchModel, error, !signal.aborted && researchModel !== models.at(-1));
        if (signal.aborted) break;
      }
    }
    return { result: null, model: null, failures, timedOut: signal.aborted, elapsedMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}
