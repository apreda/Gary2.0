import type { MetadataRoute } from 'next';
import { SPORTS } from '@/lib/gary/leagues';

const BASE_URL = 'https://www.betwithgary.ai';

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

export default function sitemap(): MetadataRoute.Sitemap {
  return [
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
}
