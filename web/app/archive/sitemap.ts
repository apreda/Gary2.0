import type { MetadataRoute } from 'next';
import { fetchArchiveDateSummaries } from '@/lib/gary/archive';
import { todayEST } from '@/lib/gary/dates';

const BASE_URL = 'https://www.betwithgary.ai';

export const revalidate = 3600;

export default async function archiveSitemap(): Promise<MetadataRoute.Sitemap> {
  const today = todayEST();
  const cutoff = new Date(new Date(`${today}T12:00:00Z`).getTime() - 3 * 86400000)
    .toISOString()
    .slice(0, 10);
  const summaries = await fetchArchiveDateSummaries().catch(() => []);
  const months = [...new Set(summaries.map(summary => summary.date.slice(0, 7)))];

  return [
    ...months.map(month => ({
      url: `${BASE_URL}/archive/month/${month}`,
      changeFrequency: month === today.slice(0, 7) ? 'daily' as const : 'yearly' as const,
      priority: 0.55,
    })),
    ...summaries.map(summary => ({
      url: `${BASE_URL}/archive/${summary.date}`,
      changeFrequency: summary.date >= cutoff ? 'daily' as const : 'yearly' as const,
      priority: 0.5,
    })),
  ];
}
