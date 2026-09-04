import archiveSitemap from '@/lib/seo/archive-sitemap';

// Next 16.3's adapter emits prerendered /sitemap.xml paths as static files,
// discarding their ISR interval. The public URL rewrites to this ordinary
// route so Vercel deploys a regeneration function and retains last-good XML.
export const dynamic = 'force-static';
export const revalidate = 600;

export async function GET() {
  const entries = await archiveSitemap();
  const urls = entries.map(entry => `  <url>
    <loc>${entry.url}</loc>
    <changefreq>${entry.changeFrequency}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`).join('\n');
  // All values come from validated ISO dates, fixed URLs and numeric priorities.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
