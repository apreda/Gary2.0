import type { MetadataRoute } from 'next';
import { fetchPickIndex } from '@/lib/gary/gamepage';
import { gameSitemapEntries, sitemapIdsForCount } from '@/lib/seo/sitemap';

export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const rows = await fetchPickIndex().catch(() => []);
  const gameMaps = sitemapIdsForCount(gameSitemapEntries(rows).length)
    .map(({ id }) => `https://www.betwithgary.ai/picks/sitemap/${id}.xml`);
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'Claude-Web', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
    ],
    sitemap: [
      'https://www.betwithgary.ai/sitemap.xml',
      'https://www.betwithgary.ai/archive/sitemap.xml',
      ...gameMaps,
    ],
  };
}
