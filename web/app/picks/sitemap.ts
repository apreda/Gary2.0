import type { MetadataRoute } from 'next';
import { fetchPickIndex } from '@/lib/gary/gamepage';
import { GAME_SITEMAP_SIZE, gameSitemapEntries, sitemapIdsForCount } from '@/lib/seo/sitemap';

export const revalidate = 3600;

export async function generateSitemaps() {
  const rows = await fetchPickIndex().catch(() => []);
  return sitemapIdsForCount(gameSitemapEntries(rows).length);
}

export default async function gameSitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const part = Number(await id);
  if (!Number.isInteger(part) || part < 0) return [];
  const rows = await fetchPickIndex().catch(() => []);
  const entries = gameSitemapEntries(rows);
  return entries.slice(part * GAME_SITEMAP_SIZE, (part + 1) * GAME_SITEMAP_SIZE);
}
