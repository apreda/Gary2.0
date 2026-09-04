import { fetchTodayGamePicks } from '@/lib/gary/picks';
import { normalizeLeague } from '@/lib/gary/leagues';
import { fetchPublishedPickPaths, publishedPickPath } from '@/lib/gary/pick-links';
import { todayEST } from '@/lib/gary/dates';

export const revalidate = 600;

const SITE = 'https://www.betwithgary.ai';

/* Pick text is LLM-generated — escape everything that can break XML. */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export async function GET() {
  const date = todayEST();
  const picks = await fetchTodayGamePicks();
  const publishedPaths = await fetchPublishedPickPaths(picks, date);
  const pubDate = new Date().toUTCString();

  const items = picks.flatMap(p => {
    const path = publishedPickPath(p, date, publishedPaths);
    if (!path) return [];
    const code = normalizeLeague(p.league, p.sport) ?? '';
    const link = `${SITE}${path}`;
    const title = `${code ? `${code}: ` : ''}${p.awayTeam} @ ${p.homeTeam} — ${p.pick ?? ''}`;
    const take = (p.rationale ?? '').replace(/^Gary's Take\s*/i, '').trim();
    return `    <item>
      <title>${esc(title)}</title>
      <link>${link}</link>
      <guid isPermaLink="false">${esc(p.pick_id ?? `${link}#${encodeURIComponent(p.pick ?? '')}`)}</guid>
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
    <description>Published picks from today's board with Gary's written reasoning and a permanent matchup page. Free, with results graded in public.</description>
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
