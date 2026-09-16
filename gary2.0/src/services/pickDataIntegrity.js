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

export function assertPickDataIntegrity() {
  const run = runs.getStore();
  if (run?.failures.length) throw new PickDataError([...run.failures]);
}

export async function withPickDataIntegrity(work) {
  if (runs.getStore()) return work();
  return runs.run({ failures: [] }, async () => {
    try {
      const result = await work();
      assertPickDataIntegrity();
      return result;
    } catch (error) {
      assertPickDataIntegrity();
      throw error;
    }
  });
}
