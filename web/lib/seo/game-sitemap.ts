import type { MetadataRoute } from 'next';
import { fetchArchiveDayIndex } from '@/lib/gary/archive';
import { todayEST } from '@/lib/gary/dates';
import { fetchPickIndex } from '@/lib/gary/gamepage';
import { GAME_SITEMAP_SIZE, gameSitemapEntries } from '@/lib/seo/sitemap';

export default async function gameSitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const part = Number(await id);
  if (!Number.isInteger(part) || part < 0) return [];
  // Throw on a failed pick-index read so ISR retains the last successful
  // inventory. The archive day index only decorates entries with each board's
  // stored publish time (lastmod); when it is unavailable the shard still
  // lists every page, just without lastmod.
  const [rows, dayIndex] = await Promise.all([
    fetchPickIndex(),
    fetchArchiveDayIndex().catch(() => []),
  ]);
  const publishedByDate = new Map<string, string>();
  for (const row of dayIndex) {
    if (row.published_at && Number.isFinite(Date.parse(row.published_at))) {
      publishedByDate.set(row.date, row.published_at);
    }
  }
  const entries = gameSitemapEntries(rows, todayEST(), publishedByDate);
  return entries.slice(part * GAME_SITEMAP_SIZE, (part + 1) * GAME_SITEMAP_SIZE);
}
