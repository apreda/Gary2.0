import { describe, expect, it } from 'vitest';
import nextConfig from '@/next.config';

describe('next.config headers', () => {
  it('edge-caches public data-backed HTML without weakening private browser caching', async () => {
    const rules = await nextConfig.headers!();
    const publicSources = [
      '/', '/hub', '/today', '/picks', '/picks/:sport',
      '/picks/:sport/:date', '/picks/:sport/:date/:game',
      '/props', '/props/:lane', '/results', '/results/:sport',
      '/archive', '/archive/:path*', '/leaderboard',
    ];

    for (const source of publicSources) {
      const rule = rules.find(candidate => candidate.source === source);
      expect(rule?.headers).toContainEqual({
        key: 'Vercel-CDN-Cache-Control',
        value: 'public, max-age=300, stale-while-revalidate=3600, stale-if-error=86400',
      });
      expect(rule?.headers.some(header => header.key === 'Cache-Control')).toBe(false);
    }
  });

  it('keeps private and utility surfaces out of the public edge cache', async () => {
    const rules = await nextConfig.headers!();
    for (const source of ['/api/:path*', '/auth/:path*', '/email/confirm', '/email/unsubscribe']) {
      const rule = rules.find(candidate => candidate.source === source);
      expect(rule?.headers.some(header => header.key === 'Vercel-CDN-Cache-Control')).toBe(false);
      expect(rule?.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex, nofollow' });
    }
  });
});
