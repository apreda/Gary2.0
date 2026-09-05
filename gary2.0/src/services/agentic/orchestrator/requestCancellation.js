import { AsyncLocalStorage } from 'node:async_hooks';

// A research tool may call a provider through several wrappers. Keep its
// cancellation attached to that async chain, without affecting other games.
const requestScope = new AsyncLocalStorage();

export function requestSignal(explicitSignal, sessionSignal) {
  const signals = [...new Set([explicitSignal, sessionSignal, requestScope.getStore()].filter(Boolean))];
  return signals.length > 1 ? AbortSignal.any(signals) : signals[0];
}

export function withRequestSignal(signal, operation) {
  return requestScope.run(requestSignal(signal), operation);
}

export function abortError(message) {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

// Reject immediately even if an optional data provider ignores cancellation.
// Its caller must still check the signal before using results or starting work.
export async function awaitWithSignal(operation, signal) {
  signal?.throwIfAborted();
  if (!signal) return operation();
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason || abortError('Request cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve().then(() => {
      signal.throwIfAborted();
      return operation();
    }), aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
