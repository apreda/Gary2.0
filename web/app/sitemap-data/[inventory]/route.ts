import archiveSitemap from '@/lib/seo/archive-sitemap';
import gameSitemap from '@/lib/seo/game-sitemap';
import { fetchPickIndex } from '@/lib/gary/gamepage';
import { gameSitemapEntries, sitemapIndexXml, sitemapXml } from '@/lib/seo/sitemap';

// Generate each inventory on its first request, never during next build.
// An ordinary parameterized route retains ISR on Vercel (metadata .xml
// routes can be emitted as static files). A failed regeneration throws so
// the platform continues serving the last successful XML and retries later.
export const dynamic = 'force-static';
export const revalidate = 600;

export function generateStaticParams() {
  return [];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ inventory: string }> },
) {
  const { inventory } = await params;
  let xml: string;
  if (inventory === 'archive') {
    xml = sitemapXml(await archiveSitemap());
  } else if (inventory === 'index') {
    const rows = await fetchPickIndex();
    xml = sitemapIndexXml(gameSitemapEntries(rows).length);
  } else if (/^games-(0|[1-9]\d*)$/.test(inventory) && Number.isSafeInteger(Number(inventory.slice(6)))) {
    xml = sitemapXml(await gameSitemap({ id: Promise.resolve(inventory.slice(6)) }));
  } else {
    return new Response('Unknown sitemap', { status: 404 });
  }
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
