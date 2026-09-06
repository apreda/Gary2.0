import { vi } from 'vitest';

// Unit tests run outside Next's request store. Real request/build behavior is
// exercised by smoke:sitemaps with next build and next start, including outages.
vi.mock('next/server', async importOriginal => ({
  ...await importOriginal<typeof import('next/server')>(),
  connection: async () => undefined,
}));
