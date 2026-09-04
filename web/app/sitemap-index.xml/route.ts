import { fetchPickIndex } from '@/lib/gary/gamepage';
import { gameSitemapEntries, sitemapIndexXml } from '@/lib/seo/sitemap';

export const revalidate = 3600;

export async function GET() {
  // Never replace a working shard inventory with one inferred from an outage.
  const rows = await fetchPickIndex();
  const xml = sitemapIndexXml(gameSitemapEntries(rows).length);

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
