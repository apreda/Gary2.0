import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../logs/jev/', import.meta.url));
export const jevHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const JEV_MODEL = 'jev-1.13.0';

export function jevEnabled(league, env = process.env) {
  return env.NODE_ENV !== 'test' && env.GARY_JEV_ENABLED === 'true'
    && env.GARY_JEV_MODE === 'assist' && ['MLB', 'NFL', 'NCAAF'].includes(league)
    && String(env.GARY_JEV_PROP_LEAGUES || '').split(',').map(s => s.trim()).includes(league);
}

export async function saveJevReceipt(kind, id, value) {
  const directory = `${ROOT}${kind}/`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = `${directory}${id}.json`;
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temporary, destination);
  } finally { await rm(temporary, { force: true }); }
}

function validateResponse(body, questions, model) {
  if (body?.model !== model || !body.answers || !Number.isInteger(body.usage?.input_tokens)
      || body.usage.input_tokens < 0) throw new Error('invalid_response');
  const probability = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  for (const [id, question] of Object.entries(questions)) {
    const answer = body.answers[id];
    if (answer?.type !== question.type) throw new Error('invalid_response');
    if (question.type === 'noul') {
      if (!probability(answer.noul)) throw new Error('invalid_response');
      continue;
    }
    const keys = question.type === 'choice' ? Object.keys(question.criteria) : question.criteria.map((_, i) => String(i));
    const distribution = answer.probabilities;
    if (!probability(answer.confidence) || !distribution || Object.keys(distribution).length !== keys.length
        || keys.some(key => !probability(distribution[key]))
        || Math.abs(keys.reduce((sum, key) => sum + distribution[key], 0) - 1) > 0.02) throw new Error('invalid_response');
    if (question.type === 'choice' && !keys.includes(answer.choice)) throw new Error('invalid_response');
    if (question.type === 'score' && (typeof answer.score !== 'number' || !Number.isFinite(answer.score)
        || answer.score < 0 || answer.score > keys.length - 1)) throw new Error('invalid_response');
  }
  return body;
}

// Bound requests within each scheduler child; process exit cannot orphan a slot.
let activeRequests = 0;
async function acquireSlot(signal) {
  while (!signal.aborted) {
    if (activeRequests < 2) {
      activeRequests++;
      return () => { activeRequests--; };
    }
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error('deadline');
}

export async function askJev(state, questions, { signal, env = process.env } = {}) {
  const model = env.GARY_JEV_MODEL || JEV_MODEL;
  const request = { model, state, questions };
  const id = jevHash(request);
  if (!env.TYPESAFE_API_KEY) return { id, status: 'unavailable', reason: 'missing_key' };
  // Keep ample margin under both documented token limits, including non-ASCII text.
  if (Buffer.byteLength(JSON.stringify(request)) > 48_000) return { id, status: 'unavailable', reason: 'input_budget' };
  try {
    const cached = JSON.parse(await readFile(`${ROOT}assessments/${id}.json`, 'utf8'));
    if (cached.status === 'complete' && Date.now() - Date.parse(cached.completed_at) < 120_000) {
      validateResponse(cached.response, questions, model);
      return { ...cached, cached: true, billed_input_tokens: 0 };
    }
  } catch { /* No matching fresh assessment. */ }
  const started = Date.now();
  // 20s per request (founder, Sep 21 2026: Jev is never to be dropped for a
  // slow answer); the desk's aggregate budget still bounds a whole slate.
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
  let release;
  try {
    release = await acquireSlot(requestSignal);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch('https://api.typesafe.ai/v1/systemone', {
        method: 'POST', headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: requestSignal,
      });
      if (!response.ok) {
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
          const retryAfter = response.headers.get('retry-after');
          const seconds = Number(retryAfter);
          const wait = retryAfter == null ? 300 : Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
          await response.body?.cancel();
          if (!Number.isFinite(wait) || wait > 5000 || Date.now() - started + wait > 17_000) throw new Error(`http_${response.status}`);
          await new Promise(resolve => setTimeout(resolve, Math.max(100, wait)));
          continue;
        }
        await response.body?.cancel();
        throw new Error(`http_${response.status}`);
      }
      const body = validateResponse(await response.json(), questions, model);
      const result = { id, status: 'complete', request, response: body,
        completed_at: new Date().toISOString(), elapsed_ms: Date.now() - started,
        billed_input_tokens: body.usage.input_tokens };
      // An assessment is supplied to Gary only when its exact evidence has a receipt.
      await saveJevReceipt('assessments', id, result);
      return result;
    }
  } catch (error) {
    const safeReason = /^(http_\d{3}|invalid_response|deadline|receipt_storage_unavailable)$/.test(error.message)
      ? error.message : requestSignal.aborted ? 'deadline' : 'transport_or_storage_error';
    return { id, status: 'unavailable', reason: safeReason, elapsed_ms: Date.now() - started };
  } finally { await release?.(); }
  return { id, status: 'unavailable', reason: 'request_failed' };
}
