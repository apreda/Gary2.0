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

/**
 * NO DATA, NO PICK (founder, Nov 10 2026: "we have to make sure the bad inputs dont exist"). The reads say a failed source
 * in words ("... did not load"). One such line in what Gary would read stops the pick before any ask; the game's next
 * tier builds it again. `text` is the data only, never a news desk's own words.
 */
export function assertEverythingLoaded(text, where) {
  const holes = [...new Set((String(text || '').match(/[^().;·\n]*did not load[^().;·\n]*/g) || []).map((s) => s.trim()))];
  if (holes.length) throw new PickDataError(holes.map((source) => ({ source, code: where })));
}

/**
 * TODAY'S NEWS (founder, Nov 12 2026: "Gary shouldn't be picking when data doesn't load"). `searched` is the news
 * search's raw result, before any filter: false when it failed or came back with no report, which stops the pick like
 * any source that did not load; the game's next tier searches again. A report whose lines were all filtered out (recaps,
 * betting lines, last season) is a search that worked and goes ahead.
 */
export function assertNewsLoaded(searched, where) {
  if (searched === false) throw new PickDataError([{ source: "today's news for this game", code: where }]);
}

// Record terminal source failures before legacy readers can catch them and
// return []/null. Never retain request headers, tokens, URLs or response bodies.
export function recordPickDataFailure(source, error) {
  const run = runs.getStore();
  if (!run) return;
  const code = String(error?.response?.status ?? error?.status ?? error?.code ?? error?.name ?? 'read_failed');
  if (!run.failures.some(f => f.source === source && f.code === code)) run.failures.push({ source, code });
}

// One web search that could not run is recorded here as a gap, not a failed
// pick: the searches a desk or a tool makes along the way (an MLB press
// search, Gary's own lookup) ride the same subscription accounts as the models
// and go down when those hit their limits. A GAME'S NEWS IS NOT ONE OF THEM
// (founder, Nov 12 2026: "Gary shouldn't be picking when data doesn't load";
// this replaces the Sep 25 2026 call that picks could resume without it): the
// read decides on the news desk's own result (assertNewsLoaded), so a search
// that failed or came back empty holds the pick for the next tier, and only a
// search that returned a report goes ahead, even when every line of it was
// then filtered out. The desk's other required data (market, injury feed,
// starting QBs, provider stats) fails closed as before.
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
