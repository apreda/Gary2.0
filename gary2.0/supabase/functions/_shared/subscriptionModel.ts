// Service-only queue. Cloud callers never receive subscription credentials.
// The Mac worker executes the same account cascade as local Gary jobs.
export async function subscriptionModelFetch(_url: string, init: RequestInit, lane = 'cloud-content', deps: { fetch?: typeof fetch; url?: string; key?: string; timeoutMs?: number } = {}): Promise<Response> {
  init.signal?.throwIfAborted();
  const transport = deps.fetch || fetch;
  const requestSignal = () => init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000);
  const env = (globalThis as any).Deno?.env;
  const url = deps.url || env?.get('SUPABASE_URL');
  const key = deps.key || env?.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUBSCRIPTION_WORKER_CONFIG: service connection unavailable');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const deadline = Date.now() + (deps.timeoutMs || 120000);
  const request = JSON.parse(String(init.body || '{}'));
  // The queue owns a bounded deadline and honors explicit caller cancellation.
  const created = await transport(`${url}/rest/v1/subscription_model_jobs`, {
    method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ lane, request, expires_at: new Date(deadline).toISOString() }), signal: requestSignal(),
  });
  if (!created.ok) throw new Error(`SUBSCRIPTION_QUEUE_WRITE: HTTP ${created.status}`);
  const [job] = await created.json();
  while (Date.now() < deadline) {
    init.signal?.throwIfAborted();
    const r = await transport(`${url}/rest/v1/subscription_model_jobs?id=eq.${job.id}&select=status,response,error`, { headers, signal: requestSignal() });
    if (!r.ok) throw new Error(`SUBSCRIPTION_QUEUE_READ: HTTP ${r.status}`);
    const [state] = await r.json();
    if (state?.status === 'completed') return new Response(JSON.stringify(state.response), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (state?.status === 'failed') throw new Error(`SUBSCRIPTION_MODEL_FAILED: ${state.error}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('SUBSCRIPTION_WORKER_TIMEOUT: no completed response before the deadline');
}
