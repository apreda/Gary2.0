import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PrimetimePage } from '@/components/board/PrimetimePage';
import { todayEST } from '@/lib/gary/dates';
import { etDateLabel } from '@/lib/gary/format';
import { fetchPrimetime, nickname, slotWords } from '@/lib/gary/primetime';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 600;

type Props = { params: Promise<{ date: string }> };

function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === date && date >= '2026-09-01' && date <= todayEST();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params;
  if (!validDate(date)) return {};
  const day = await fetchPrimetime(date).catch(() => null);
  const game = day?.games[0];
  return pageMetadata({
    canonical: `/primetime/${date}`,
    title: game
      ? `${nickname(game.away_team)} vs. ${nickname(game.home_team)} Picks & Props — ${slotWords(game.slot)}, ${etDateLabel(date)}`
      : `Primetime — ${etDateLabel(date)}`,
    description: game
      ? `Gary AI on ${game.away_team} at ${game.home_team}: every bet he had on the game and how each one finished.`
      : `Gary AI's primetime picks for ${etDateLabel(date)}.`,
  });
}

export default async function PrimetimeNight({ params }: Props) {
  const { date } = await params;
  if (!validDate(date)) notFound();
  const day = await fetchPrimetime(date);
  return <PrimetimePage day={day} canonical={`/primetime/${date}`} />;
}
