import { awaitWithSignal } from '../agentic/orchestrator/requestCancellation.js';

// Claims are never retried here: a lost response may still own a live lease.
// Callers may retry an idempotent finish with the same run and decision.
export async function winnersDatabaseCall(client, name, args, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`${name}: database response timed out`)), timeoutMs);
  try {
    const result = await awaitWithSignal(() => {
      const request = client.rpc(name, args);
      return typeof request.abortSignal === 'function' ? request.abortSignal(controller.signal) : request;
    }, controller.signal);
    if (result.error) throw result.error;
    return result.data;
  } finally { clearTimeout(timer); }
}
