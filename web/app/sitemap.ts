import type { MetadataRoute } from 'next';
import { SPORTS } from '@/lib/gary/leagues';
import { fetchPickIndex, gamePagePaths } from '@/lib/gary/gamepage';
import { todayEST } from '@/lib/gary/dates';

const BASE_URL = 'https://www.betwithgary.ai';

export const revalidate = 3600;

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

/*
 * lastModified is intentionally omitted until each route has a source-backed
 * content timestamp. A build or request time does not describe a page edit.
 */
const entry = (
  path: string,
  priority: number,
  changeFrequency: ChangeFrequency,
): MetadataRoute.Sitemap[number] => ({
  url: `${BASE_URL}${path}`,
  changeFrequency,
  priority,
});

/**
 * The static map plus every per-game page Gary has ever published (Sep 1 2026).
 * A day still being graded changes daily; a settled day never changes again.
 * The index view is light (keys only), so the whole season fits in one map.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = [
    entry('/', 1, 'daily'),
    entry('/picks', 0.9, 'daily'),
    ...SPORTS.map(s => entry(`/picks/${s.slug}`, 0.9, s.retired ? 'yearly' : 'daily')),
    entry('/props', 0.8, 'daily'),
    entry('/results', 0.9, 'daily'),
    ...SPORTS.map(s => entry(`/results/${s.slug}`, 0.7, s.retired ? 'yearly' : 'daily')),
    entry('/archive', 0.8, 'daily'),
    entry('/hub', 0.8, 'daily'),
    entry('/nfl', 0.8, 'weekly'),
    entry('/pricing', 0.7, 'weekly'),
    entry('/how-it-works', 0.6, 'monthly'),
    entry('/app', 0.6, 'monthly'),
    entry('/press', 0.4, 'weekly'),
    entry('/contact', 0.2, 'yearly'),
    entry('/terms', 0.1, 'yearly'),
    entry('/privacy', 0.1, 'yearly'),
  ];

  let games: MetadataRoute.Sitemap = [];
  try {
    const paths = gamePagePaths(await fetchPickIndex());
    const today = todayEST();
    const recent = (date: string) => date >= new Date(new Date(`${today}T12:00:00Z`).getTime() - 3 * 86400000).toISOString().slice(0, 10);
    const days = new Set<string>();
    const dayEntries: MetadataRoute.Sitemap = [];
    for (const p of paths) {
      const key = `${p.sport}|${p.date}`;
      if (!days.has(key)) {
        days.add(key);
        dayEntries.push(entry(`/picks/${p.sport}/${p.date}`, 0.5, recent(p.date) ? 'daily' : 'yearly'));
      }
    }
    games = [
      ...dayEntries,
      ...paths.map(p => entry(`/picks/${p.sport}/${p.date}/${p.slug}`, 0.6, recent(p.date) ? 'daily' : 'yearly')),
    ];
  } catch {
    // The static map still ships; the game pages return on the next revalidation.
  }

  return [...fixed, ...games];
}
