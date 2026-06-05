import type { MetadataRoute } from 'next';
import { SPORTS } from '@/lib/gary/leagues';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.betwithgary.ai';
  const now = new Date();
  const daily = (path: string, priority: number): MetadataRoute.Sitemap[number] =>
    ({ url: `${base}${path}`, lastModified: now, changeFrequency: 'daily', priority });

  return [
    daily('/', 1),
    daily('/picks', 0.9),
    ...SPORTS.map(s => daily(`/picks/${s.slug}`, 0.9)),
    daily('/props', 0.8),
    daily('/results', 0.9),
    ...SPORTS.map(s => daily(`/results/${s.slug}`, 0.7)),
    daily('/hub', 0.8),
    { url: `${base}/how-it-works`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/app`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/press`, lastModified: now, changeFrequency: 'weekly', priority: 0.4 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.1 },
  ];
}
