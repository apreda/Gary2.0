import type { MetadataRoute } from 'next';
import { BASE_URL, SITEMAP_INDEX_PATH } from '@/lib/seo/sitemap';

export const revalidate = 3600;

// The framework's page-data requests (?_rsc=) were 86% of Googlebot's visits by
// Search Console's crawl stats, Nov 2026; every page's HTML is complete without
// them. The tracked App Store redirects aren't pages at all.
const disallow = ['/*?_rsc=', '/*&_rsc=', '/c/', '/go/', '/get'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: ['*', 'GPTBot', 'ClaudeBot', 'Claude-Web', 'PerplexityBot', 'Google-Extended']
      .map(userAgent => ({ userAgent, allow: '/', disallow })),
    sitemap: `${BASE_URL}${SITEMAP_INDEX_PATH}`,
  };
}
