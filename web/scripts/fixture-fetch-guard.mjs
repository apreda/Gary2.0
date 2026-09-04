// Preloaded into Next and its children only by fixture-preview.mjs. Also catches
// application routes with hard-coded service URLs instead of environment URLs.
const localOrigins = new Set([
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.GARY_FIXTURE_ORIGIN,
]);
const originalFetch = globalThis.fetch;
globalThis.fetch = function fixtureFetch(input, init) {
  const url = new URL(input instanceof Request ? input.url : input);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const fontRead = method === 'GET' && url.protocol === 'https:' &&
    ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
  if (!localOrigins.has(url.origin) && !fontRead) {
    return Promise.reject(new Error(`Fixture preview blocked external fetch to ${url.origin}`));
  }
  // Do not allow a permitted endpoint to redirect fetch to a production service.
  return originalFetch(input, { ...init, redirect: 'error' });
};
