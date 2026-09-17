import { describe, expect, it } from 'vitest';
import nextConfig from '@/next.config';

describe('next.config redirects', () => {
  it('sends both betwithgary.com hosts to the canonical www.betwithgary.ai host, path preserved', async () => {
    const redirects = await nextConfig.redirects!();
    for (const host of ['betwithgary.com', 'www.betwithgary.com']) {
      const rule = redirects.find(r => r.has?.some(h => h.type === 'host' && h.value === host));
      expect(rule).toMatchObject({ source: '/:path*', destination: 'https://www.betwithgary.ai/:path*', permanent: true });
    }
    expect(redirects.find(r => r.source === '/picks/world-cup')).toBeDefined();
  });
});
