import type { MetadataRoute } from 'next';
import { fetchArchiveDateSummaries } from '@/lib/gary/archive';
import { todayEST } from '@/lib/gary/dates';

const BASE_URL = 'https://www.betwithgary.ai';

export default async function archiveSitemap(): Promise<MetadataRoute.Sitemap> {
  const today = todayEST();
  const cutoff = new Date(new Date(`${today}T12:00:00Z`).getTime() - 3 * 86400000)
    .toISOString()
    .slice(0, 10);
  // A failed regeneration must keep the last successful inventory in ISR.
  const summaries = await fetchArchiveDateSummaries();
  const months = [...new Set(summaries.map(summary => summary.date.slice(0, 7)))];

  // lastmod is the stored publish time of a day's board; a month hub is as
  // fresh as the newest such time among its days. Days without one omit the key.
  const newestByMonth = new Map<string, string>();
  for (const summary of summaries) {
    if (!summary.publishedAt) continue;
    const month = summary.date.slice(0, 7);
    const prev = newestByMonth.get(month);
    if (prev === undefined || Date.parse(summary.publishedAt) > Date.parse(prev)) {
      newestByMonth.set(month, summary.publishedAt);
    }
  }

  return [
    ...months.map(month => {
      const newest = newestByMonth.get(month);
      return {
        url: `${BASE_URL}/archive/month/${month}`,
        changeFrequency: month === today.slice(0, 7) ? 'daily' as const : 'yearly' as const,
        priority: 0.55,
        ...(newest === undefined ? {} : { lastModified: new Date(newest) }),
      };
    }),
    ...summaries.map(summary => ({
      url: `${BASE_URL}/archive/${summary.date}`,
      changeFrequency: summary.date >= cutoff ? 'daily' as const : 'yearly' as const,
      priority: 0.5,
      ...(summary.publishedAt ? { lastModified: new Date(summary.publishedAt) } : {}),
    })),
  ];
}
