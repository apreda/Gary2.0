/** Results HTTP deadlines, retry policy and shared account pacing. */
import { waitForBdlRequestSlot as defaultWaitForSlot } from '../../../src/services/bdlRequestGate.js';

export function createResultsTransport({ runOptions: RUN_OPTIONS = {}, apiKey: BDL_API_KEY,
  fetch = globalThis.fetch, waitForBdlRequestSlot = defaultWaitForSlot,
  Date = globalThis.Date, AbortSignal = globalThis.AbortSignal, console = globalThis.console }) {
  async function bdlFetch(path, params = '', { timeoutMs = null, deadlineAt = null, rateLimit = false } = {}) {
    const url = `https://api.balldontlie.io/${path}${params ? '?' + params : ''}`;
    const attempts = RUN_OPTIONS.footballSettlements ? 2 : 1;
    const deadlineSignal = deadlineAt == null ? undefined : AbortSignal.timeout(Math.max(1, deadlineAt - Date.now()));
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        deadlineSignal?.throwIfAborted();
        if (deadlineAt != null && Date.now() >= deadlineAt) throw new Error('settlement evidence deadline reached');
        // The narrow manual football backstop shares a five-starts/minute BDL
        // account with the live-score function. Keep this process to three evenly
        // spaced starts/minute and give a collision-throttled request one retry.
        // The historical full/nightly mode is intentionally unchanged.
        if (RUN_OPTIONS.footballSettlements || rateLimit) {
          await waitForBdlRequestSlot(`football-results ${path}`, { signal: deadlineSignal });
        }
        if (deadlineAt != null && Date.now() >= deadlineAt) throw new Error('settlement evidence deadline reached');
        const requestTimeout = deadlineAt == null ? timeoutMs : Math.min(timeoutMs ?? 20_000, deadlineAt - Date.now());
        const res = await fetch(url, { headers: { 'Authorization': BDL_API_KEY },
          ...(requestTimeout == null ? {} : { signal: AbortSignal.timeout(Math.max(1, requestTimeout)) }) });
        if (res.ok) return await res.json();
        if (res.status === 429 && attempt + 1 < attempts) {
          console.warn(`  ⚠️ BDL ${path} rate-limited; retrying on the next guarded slot`);
          continue;
        }
        const message = `BDL ${path} returned HTTP ${res.status}`;
        if (RUN_OPTIONS.footballSettlements) throw new Error(message);
        console.warn(`  ⚠️ ${message}`);
        return null;
      } catch (e) {
        if (deadlineSignal?.aborted || (deadlineAt != null && Date.now() >= deadlineAt) || attempt + 1 >= attempts) {
          if (RUN_OPTIONS.footballSettlements) {
            throw new Error(`BDL ${path} failed after ${attempt + 1} attempt(s): ${e.message}`, { cause: e });
          }
          return null;
        }
      }
    }
    return null;
  }

  return { bdlFetch };
}
