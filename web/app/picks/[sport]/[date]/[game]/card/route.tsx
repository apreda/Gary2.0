import { GET as renderShareCard } from '@/app/api/share-card/route';
import { isArchiveDate } from '@/lib/gary/archive';
import { fetchGameDay, findGamePicks, gameSlug, matchPickResult } from '@/lib/gary/gamepage';
import { sportBySlug } from '@/lib/gary/leagues';

export const runtime = 'nodejs';
export const revalidate = 3600;

type Params = Promise<{ sport: string; date: string; game: string }>;

function callOf(pick: { pick?: string }): string {
  return (pick.pick ?? '').replace(/[+-]\d{3,}\s*$/, '').trim();
}

export async function GET(
  request: Request,
  { params }: { params: Params },
) {
  const { sport, date, game } = await params;
  const cfg = sportBySlug(sport);
  if (!cfg || !isArchiveDate(date)) return new Response('Not found', { status: 404 });

  const day = await fetchGameDay(cfg.slug, date);
  const picks = day ? findGamePicks(day.picks, cfg.code, game) : [];
  if (!day || picks.length === 0) return new Response('Not found', { status: 404 });

  const pick = [...picks].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
  if (game !== gameSlug(pick.awayTeam, pick.homeTeam)) return new Response('Not found', { status: 404 });

  const result = (matchPickResult(pick, day.results)?.result ?? '').trim().toLowerCase();
  const cardUrl = new URL('/api/share-card', request.url);
  cardUrl.searchParams.set('hero', callOf(pick).split(/\s+/).slice(0, 4).join('|'));
  cardUrl.searchParams.set('league', cfg.code);
  cardUrl.searchParams.set('meta', `${pick.awayTeam} AT ${pick.homeTeam} · ${date}`);
  if (result === 'won' || result === 'lost') cardUrl.searchParams.set('result', result);

  const card = await renderShareCard(new Request(cardUrl));
  const headers = new Headers(card.headers);
  headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return new Response(card.body, { status: card.status, headers });
}
