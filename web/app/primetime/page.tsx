import type { Metadata } from 'next';
import { PrimetimePage } from '@/components/board/PrimetimePage';
import { todayEST } from '@/lib/gary/dates';
import { fetchPrimetime, nickname, slotWords } from '@/lib/gary/primetime';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const day = await fetchPrimetime(todayEST()).catch(() => null);
  const game = day?.games[0];
  const title = game
    ? `${nickname(game.away_team)} vs. ${nickname(game.home_team)} Picks & Props Tonight — ${slotWords(game.slot)}`
    : 'Primetime Picks Tonight';
  return pageMetadata({
    canonical: '/primetime',
    title,
    description: game
      ? `Gary AI on ${game.away_team} at ${game.home_team}: his pick, his player props and touchdown darts for tonight's big game, with results after the final.`
      : "Gary AI's picks and props for tonight's big game, with results after the final.",
  });
}

export default async function PrimetimeTonight() {
  const date = todayEST();
  // A failed read reaches the route error boundary; it is never an empty night.
  const day = await fetchPrimetime(date);
  return <PrimetimePage day={day} canonical="/primetime" />;
}
