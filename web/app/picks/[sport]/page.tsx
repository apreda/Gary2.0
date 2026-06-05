import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PickCard } from '@/components/PickCard';
import { Eyebrow } from '@/components/Eyebrow';
import { LiveScoreStrip } from '@/components/LiveChip';
import { JsonLd } from '@/components/JsonLd';
import { fetchTodayGamePicks } from '@/lib/gary/picks';
import { fetchAllGameResults, computeRecord, sinceDate } from '@/lib/gary/results';
import { normalizeLeague, SPORTS, sportBySlug } from '@/lib/gary/leagues';
import { todayEST, estDateStr } from '@/lib/gary/dates';

export const revalidate = 600;
// Unknown slugs 404 at the router — no SSR pass or data fetch for garbage paths.
export const dynamicParams = false;

export function generateStaticParams() {
  return SPORTS.map(s => ({ sport: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ sport: string }> }): Promise<Metadata> {
  const { sport } = await params;
  const cfg = sportBySlug(sport);
  if (!cfg) return {};
  return {
    title: `Free ${cfg.longName} Picks Today — With Reasoning | Gary AI`,
    description: `Gary's free ${cfg.longName} picks for today with written rationale, confidence ratings, and a public graded track record. Updated daily.`,
    alternates: { canonical: `/picks/${cfg.slug}` },
  };
}

export default async function SportPicksPage({ params }: { params: Promise<{ sport: string }> }) {
  const { sport } = await params;
  const cfg = sportBySlug(sport);
  if (!cfg) notFound();

  const [allPicks, results] = await Promise.all([
    fetchTodayGamePicks().catch(() => null),
    fetchAllGameResults().catch(() => null),
  ]);

  const picks = allPicks
    ? allPicks.filter(p => normalizeLeague(p.league, p.sport) === cfg.code)
    : null;

  // Results data — null means we OMIT the record line entirely (never show 0-0)
  const allTime = results
    ? computeRecord(results.filter(r => (r.league ?? '').toUpperCase() === cfg.code))
    : null;
  const l30 = results
    ? computeRecord(sinceDate(
        results.filter(r => (r.league ?? '').toUpperCase() === cfg.code),
        estDateStr(new Date(Date.now() - 30 * 86400000)),
      ))
    : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'ItemList',
        name: `Gary AI free ${cfg.longName} picks`,
        numberOfItems: picks?.length ?? 0,
        itemListElement: (picks ?? []).slice(0, 25).map((p, i) => ({
          '@type': 'ListItem', position: i + 1, name: `${p.awayTeam} @ ${p.homeTeam}: ${p.pick}`,
        })),
      }} />
      <Eyebrow accent={cfg.accent}>{cfg.code} · {todayEST()}</Eyebrow>
      <h1 className="mt-2 font-display text-4xl text-white/95">Free {cfg.longName} Picks</h1>
      {allTime && l30 && (
        <p className="mt-3 font-mono text-[12px] text-white/45">
          {cfg.code} RECORD · L30 {l30.wins}-{l30.losses} · ALL-TIME {allTime.wins}-{allTime.losses}
          {allTime.graded > 0 ? ` (${allTime.pct}%)` : ''} ·{' '}
          <Link href={`/results/${cfg.slug}`} className="text-white/70 underline">FULL RECORD</Link>
        </p>
      )}
      <div className="mt-4"><LiveScoreStrip date={todayEST()} leagues={[cfg.code]} /></div>

      {(!picks || picks.length === 0) ? (
        <div className="mt-10 rounded-[20px] border border-white/10 bg-card p-10 text-center text-white/50">
          No {cfg.name} picks on today&apos;s board{allTime && allTime.graded > 0 ? (
            <> — see the <Link href={`/results/${cfg.slug}`} className="text-white/80 underline">graded {cfg.name} record</Link> ({allTime.wins}-{allTime.losses}) while the season&apos;s quiet.</>
          ) : '.'}
        </div>
      ) : (
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {picks.map((p, i) => <PickCard key={p.pick_id ?? i} pick={p} expanded />)}
        </div>
      )}
    </main>
  );
}
