import { fetchTodayGamePicks } from '@/lib/gary/picks';
import { normalizeLeague, sportByCode } from '@/lib/gary/leagues';
import { todayEST } from '@/lib/gary/dates';

export const revalidate = 600;

const SITE = 'https://www.betwithgary.ai';

/* Pick text is LLM-generated — escape everything that can break XML. */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export async function GET() {
  const picks = await fetchTodayGamePicks().catch(() => []);
  const date = todayEST();
  const pubDate = new Date().toUTCString();

  const items = picks.map((p, i) => {
    const code = normalizeLeague(p.league, p.sport) ?? '';
    const cfg = sportByCode(code);
    const link = cfg ? `${SITE}/picks/${cfg.slug}` : `${SITE}/picks`;
    const title = `${code ? `${code}: ` : ''}${p.awayTeam} @ ${p.homeTeam} — ${p.pick ?? ''}`;
    const take = (p.rationale ?? '').replace(/^Gary's Take\s*/i, '').trim();
    return `    <item>
      <title>${esc(title)}</title>
      <link>${link}</link>
      <guid isPermaLink="false">${esc(p.pick_id ?? `${date}-${i}`)}</guid>
      <pubDate>${pubDate}</pubDate>
      ${take ? `<description>${esc(take)}</description>` : ''}
    </item>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Gary AI — Free Daily Sports Picks</title>
    <link>${SITE}/picks</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Every pick on today's board with Gary's written reasoning. Full slate, free, graded in public the next morning.</description>
    <language>en-us</language>
    <lastBuildDate>${pubDate}</lastBuildDate>
${items.join('\n')}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 's-maxage=600, stale-while-revalidate=3600',
    },
  });
}
