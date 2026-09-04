import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it('loads the Winners client bundle without evaluating server-side environment lookups', async () => {
  vi.resetModules();
  // Dynamic process.env[name] reads are unavailable in a browser bundle.
  // Public credentials are inlined only where the browser auth client reads them.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', undefined);
  const page = await import('@/components/book/WinnersClient');
  expect(page.WinnersClient).toBeTypeOf('function');
});
