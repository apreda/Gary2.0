import type { MetadataRoute } from 'next';
import { todayEST } from '@/lib/gary/dates';
import { gamePagePaths, type PickIndexRow } from '@/lib/gary/gamepage';

export const BASE_URL = 'https://www.betwithgary.ai';
export const GAME_SITEMAP_SIZE = 40_000;
export const SITEMAP_INDEX_PATH = '/sitemap-index.xml';

export function gameSitemapEntries(
  rows: PickIndexRow[],
  today = todayEST(),
): MetadataRoute.Sitemap {
  const cutoff = new Date(new Date(`${today}T12:00:00Z`).getTime() - 3 * 86400000)
    .toISOString()
    .slice(0, 10);
  const recent = (date: string) => date >= cutoff;
  const paths = gamePagePaths(rows);
  const days = new Set<string>();
  const dayEntries: MetadataRoute.Sitemap = [];

  for (const path of paths) {
    const key = `${path.sport}|${path.date}`;
    if (days.has(key)) continue;
    days.add(key);
    dayEntries.push({
      url: `${BASE_URL}/picks/${path.sport}/${path.date}`,
      changeFrequency: recent(path.date) ? 'daily' : 'yearly',
      priority: 0.5,
    });
  }

  return [
    ...dayEntries,
    ...paths.map(path => ({
      url: `${BASE_URL}/picks/${path.sport}/${path.date}/${path.slug}`,
      changeFrequency: recent(path.date) ? 'daily' as const : 'yearly' as const,
      priority: 0.6,
    })),
  ];
}

export function sitemapIdsForCount(count: number) {
  const total = Math.max(1, Math.ceil(count / GAME_SITEMAP_SIZE));
  return Array.from({ length: total }, (_, id) => ({ id }));
}

/** Every child sitemap exposed by the site. Keeping this inventory in one
 * place means robots.txt, the index route, and tests cannot drift apart when
 * the permanent-game archive grows into another 40,000-URL shard. */
export function sitemapUrlsForCount(count: number): string[] {
  return [
    `${BASE_URL}/sitemap.xml`,
    `${BASE_URL}/archive/sitemap.xml`,
    ...sitemapIdsForCount(count).map(({ id }) => `${BASE_URL}/picks/sitemap/${id}.xml`),
  ];
}

export function sitemapIndexXml(count: number): string {
  const entries = sitemapUrlsForCount(count)
    .map(url => `  <sitemap>\n    <loc>${url}</loc>\n  </sitemap>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;
}
