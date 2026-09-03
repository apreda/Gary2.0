import { fetchPickIndex } from '@/lib/gary/gamepage';
import { gameSitemapEntries, sitemapIndexXml } from '@/lib/seo/sitemap';

export const revalidate = 3600;

export async function GET() {
  const rows = await fetchPickIndex().catch(() => []);
  const xml = sitemapIndexXml(gameSitemapEntries(rows).length);

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
