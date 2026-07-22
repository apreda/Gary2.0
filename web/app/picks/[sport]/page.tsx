import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PickCard } from '@/components/PickCard';
import { PageMasthead } from '@/components/Terminal';
import { LiveScoreStrip } from '@/components/LiveChip';
import { JsonLd } from '@/components/JsonLd';
import { fetchTodayGamePicks } from '@/lib/gary/picks';
import { fetchAllGameResults, computeRecord, sinceDate } from '@/lib/gary/results';
import { normalizeLeague, SPORTS, sportBySlug } from '@/lib/gary/leagues';
import { todayEST, daysAgoEST } from '@/lib/gary/dates';

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
  // Tournament over (Jul 19 2026): the page keeps its search equity but sells
  // the complete graded record, not a daily slate that no longer exists.
  if (cfg.code === 'WC') {
    return {
      title: 'World Cup 2026 Picks — The Complete Graded Record | Gary AI',
      description:
        'Gary picked every match of the 2026 FIFA World Cup with written reasoning, and every result is graded on the public record — through the final.',
      alternates: { canonical: '/picks/world-cup' },
    };
  }
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
        daysAgoEST(30),
      ))
    : null;

  return (
    <main className="mx-auto max-w-6xl px-5 py-16">
      {picks && picks.length > 0 && (
        <JsonLd data={{
          '@context': 'https://schema.org', '@type': 'ItemList',
          name: `Gary AI free ${cfg.longName} picks`,
          numberOfItems: picks.length,
          itemListElement: picks.slice(0, 25).map((p, i) => ({
            '@type': 'ListItem', position: i + 1, name: `${p.awayTeam} @ ${p.homeTeam}: ${p.pick}`,
          })),
        }} />
      )}
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Gary AI', item: 'https://www.betwithgary.ai/' },
          { '@type': 'ListItem', position: 2, name: "Today's Picks", item: 'https://www.betwithgary.ai/picks' },
          { '@type': 'ListItem', position: 3, name: cfg.longName, item: `https://www.betwithgary.ai/picks/${cfg.slug}` },
        ],
      }} />
      <PageMasthead
        title={cfg.code === 'WC' ? 'World Cup 2026 — the graded record' : `Free ${cfg.longName} picks`}
        meta={cfg.retired ? cfg.code : `${cfg.code} · ${todayEST()}`}
      >
        {allTime && l30 && (
          <p className="tnum mt-3 font-mono text-[12px] text-low">
            {cfg.code} RECORD · L30 {l30.wins}-{l30.losses} · ALL-TIME {allTime.wins}-{allTime.losses}
            {allTime.graded > 0 ? ` (${allTime.pct}%)` : ''} ·{' '}
            <Link href={`/results/${cfg.slug}`} className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold">FULL RECORD</Link>
          </p>
        )}
      </PageMasthead>

      {!cfg.retired && <div className="mt-7"><LiveScoreStrip date={todayEST()} leagues={[cfg.code]} /></div>}

      {(!picks || picks.length === 0) ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-card border border-line bg-card p-10 text-center">
          <Image src="/brand/gary-cooking.png" alt="" aria-hidden width={110} height={110} />
          <p className="mt-3 text-[15px] text-mid">
            {cfg.retired ? (
              <>The 2026 tournament is complete — Gary picked every match through the final, and{' '}
              every result is graded on the{' '}
              <Link href={`/results/${cfg.slug}`} className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold">{cfg.name} record</Link>
              {allTime && allTime.graded > 0 ? <> (<span className="tnum font-mono">{allTime.wins}-{allTime.losses}</span>)</> : null}.</>
            ) : (
            <>No {cfg.name} picks on today&apos;s board{allTime && allTime.graded > 0 ? (
              <> — see the <Link href={`/results/${cfg.slug}`} className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold">graded {cfg.name} record</Link> (<span className="tnum font-mono">{allTime.wins}-{allTime.losses}</span>) while the season&apos;s quiet.</>
            ) : '.'}</>
            )}
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {picks.map((p, i) => <PickCard key={p.pick_id ?? i} pick={p} expanded />)}
        </div>
      )}
    </main>
  );
}
