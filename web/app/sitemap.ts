import type { MetadataRoute } from 'next';
import { SPORTS } from '@/lib/gary/leagues';

/* lastModified must stay TRUTHFUL or Google distrusts it for the whole sitemap:
   - Daily surfaces (/, picks, props, results, hub) genuinely change every
     morning when the slate drops and grades — build-time "now" is accurate
     because these pages rebuild with fresh data.
   - Static pages get a hand-stamped date. BUMP STATIC_EDIT when their content
     actually changes (copy, pricing numbers, legal text). */
const STATIC_EDIT = new Date('2026-06-10');
/* /nfl launched Jul 23 2026; countdown + live record keep it genuinely fresh. */
const NFL_LAUNCH_EDIT = new Date('2026-07-23');

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.betwithgary.ai';
  const now = new Date();
  const daily = (path: string, priority: number): MetadataRoute.Sitemap[number] =>
    ({ url: `${base}${path}`, lastModified: now, changeFrequency: 'daily', priority });
  const fixed = (path: string, priority: number, changeFrequency: 'weekly' | 'monthly' | 'yearly'): MetadataRoute.Sitemap[number] =>
    ({ url: `${base}${path}`, lastModified: STATIC_EDIT, changeFrequency, priority });

  return [
    daily('/', 1),
    daily('/picks', 0.9),
    ...SPORTS.map(s => daily(`/picks/${s.slug}`, 0.9)),
    daily('/props', 0.8),
    daily('/results', 0.9),
    ...SPORTS.map(s => daily(`/results/${s.slug}`, 0.7)),
    daily('/hub', 0.8),
    { url: `${base}/nfl`, lastModified: NFL_LAUNCH_EDIT, changeFrequency: 'weekly' as const, priority: 0.8 },
    fixed('/pricing', 0.7, 'weekly'),
    fixed('/how-it-works', 0.6, 'monthly'),
    fixed('/app', 0.6, 'monthly'),
    fixed('/press', 0.4, 'weekly'),
    fixed('/contact', 0.2, 'yearly'),
    fixed('/terms', 0.1, 'yearly'),
    fixed('/privacy', 0.1, 'yearly'),
  ];
}
