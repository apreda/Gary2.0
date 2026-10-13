import { AsyncLocalStorage } from 'node:async_hooks';

const runs = new AsyncLocalStorage();

export class PickDataError extends Error {
  constructor(failures) {
    super(`Pick data failed: ${failures.map(f => `${f.source} (${f.code})`).join('; ')}`);
    this.name = 'PickDataError';
    this.code = 'required_data_unavailable';
    this.retryModel = false;
    this.failures = failures;
  }
}

// Record terminal source failures before legacy readers can catch them and
// return []/null. Never retain request headers, tokens, URLs or response bodies.
export function recordPickDataFailure(source, error) {
  const run = runs.getStore();
  if (!run) return;
  const code = String(error?.response?.status ?? error?.status ?? error?.code ?? error?.name ?? 'read_failed');
  if (!run.failures.some(f => f.source === source && f.code === code)) run.failures.push({ source, code });
}

// A web search that could not run is a gap in the reporting, not a failed pick
// (founder, Sep 25 2026: "if it doesn't work then we need to know that, but
// the picks probably can resume"). Search rides the same two subscription
// accounts as the models, so it goes down when both hit their limits (Sep 20:
// Commanders @ Cowboys failed its T-240 slot on this alone). The desk's
// required data (market, injury feed, starting QBs, provider stats) still
// fails closed; the gap is printed where the scheduler log shows it.
const NON_BLOCKING = new Set(['current_reporting']);

export function assertPickDataIntegrity() {
  const run = runs.getStore();
  if (!run || run.partialDataAllowed) return;
  const blocking = run.failures.filter(f => !NON_BLOCKING.has(f.source));
  if (blocking.length) throw new PickDataError(blocking);
}

function reportGaps(run) {
  const gaps = run.failures.filter(f => NON_BLOCKING.has(f.source));
  if (gaps.length && !run.gapReported) {
    run.gapReported = true;
    console.warn(`❌ DATA GAP: ${gaps.map(f => `${f.source} (${f.code})`).join('; ')}; web search could not run, so the pick went ahead without today's reporting`);
  }
}

/**
 * Optional lookups — a tool Gary or his researcher chose to call, a web
 * search, a follow-up question, a market read — run here (founder, Sep 24
 * 2026: "why are we one bad web search away from it not working?"). A failure
 * reaches the model in that tool's own answer as unavailable and never fails
 * the pick. The desk's required data (market, injury feed, starting QBs,
 * provider stats) stays outside and still fails closed.
 */
export async function withOptionalData(work) {
  if (!runs.getStore()) return work();
  return runs.run({ failures: [], partialDataAllowed: true, optional: true }, work);
}

export async function withPickDataIntegrity(work, { partialDataAllowed = false } = {}) {
  if (runs.getStore()) return work();
  return runs.run({ failures: [], partialDataAllowed }, async () => {
    try {
      const result = await work();
      assertPickDataIntegrity();
      reportGaps(runs.getStore());
      return result;
    } catch (error) {
      assertPickDataIntegrity();
      reportGaps(runs.getStore());
      throw error;
    }
  });
}
