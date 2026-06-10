import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageMasthead, StatTile, StitchRule, ResultLetter } from '@/components/Terminal';
import {
  fetchAllGameResults, computeRecord, currentStreak, sinceDate,
} from '@/lib/gary/results';
import { daysAgoEST } from '@/lib/gary/dates';
import { SPORTS, sportBySlug } from '@/lib/gary/leagues';
import { JsonLd } from '@/components/JsonLd';

export const revalidate = 3600;
// Unknown slugs 404 at the router — no SSR pass or data fetch for garbage paths.
export const dynamicParams = false;

export function generateStaticParams() {
  return SPORTS.map(s => ({ sport: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ sport: string }> }): Promise<Metadata> {
  const { sport } = await params;
  const cfg = sportBySlug(sport);
  if (!cfg) return {};
  if (cfg.code === 'WC') {
    return {
      title: 'World Cup 2026 Predictions Record — Every Pick Graded | Gary AI',
      description:
        "Gary AI's graded 2026 World Cup predictions record — every match pick scored against the final result, win-loss, and net units. Public through the final.",
      alternates: { canonical: '/results/world-cup' },
    };
  }
  return {
    title: `${cfg.longName} Picks Track Record | Gary AI`,
    description: `Gary AI's complete graded ${cfg.longName} picks record — win-loss, net units at flat stakes, current streak, and every graded result. Public and updated daily.`,
    alternates: { canonical: `/results/${cfg.slug}` },
  };
}

const fmtUnits = (u: number) => `${u >= 0 ? '+' : '-'}${Math.abs(u).toFixed(1)}u`;

export default async function SportResultsPage({ params }: { params: Promise<{ sport: string }> }) {
  const { sport } = await params;
  const cfg = sportBySlug(sport);
  if (!cfg) notFound();

  const allResults = await fetchAllGameResults().catch(() => null);

  // Results page is the record — null data is worse than an error page.
  if (!allResults) throw new Error('results data unavailable');

  const results = allResults.filter(r => (r.league ?? '').toUpperCase() === cfg.code);
  const allTime = computeRecord(results);
  const l30 = computeRecord(sinceDate(results, daysAgoEST(30)));
  const streak = currentStreak(results);

  const recent = results
    .filter(r => {
      const nr = (r.result ?? '').trim().toLowerCase();
      return nr === 'won' || nr === 'lost' || nr === 'push';
    })
    .slice(0, 50);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-16 pt-12">
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Gary AI', item: 'https://www.betwithgary.ai/' },
          { '@type': 'ListItem', position: 2, name: 'Track Record', item: 'https://www.betwithgary.ai/results' },
          { '@type': 'ListItem', position: 3, name: cfg.longName, item: `https://www.betwithgary.ai/results/${cfg.slug}` },
        ],
      }} />
      <PageMasthead
        title={`${cfg.longName} track record`}
        meta={`${cfg.code} · RESULTS`}
        sub={`Every graded ${cfg.name} pick — wins, losses, and pushes — on the public record. Units assume flat 1-unit stakes at the listed odds.`}
      />

      {/* Headline tiles: all-time / L30 / streak */}
      <div className="mt-7 grid grid-cols-3 gap-3">
        <StatTile
          label="All-time"
          value={<>{allTime.wins}<span className="text-faint">–</span>{allTime.losses}</>}
          sub={`${allTime.pct}% · ${fmtUnits(allTime.netUnits)}`}
        />
        <StatTile
          label="Last 30 days"
          value={<>{l30.wins}<span className="text-faint">–</span>{l30.losses}</>}
          sub={`${l30.pct}% · ${fmtUnits(l30.netUnits)}`}
        />
        <StatTile
          label="Streak"
          value={streak ? `${streak.count}${streak.kind === 'won' ? 'W' : 'L'}` : '—'}
          sub={streak?.kind === 'won' ? 'riding it' : streak ? 'owning it' : ''}
          valueClassName={streak?.kind === 'won' ? 'text-win' : streak ? 'text-loss' : 'text-hi'}
        />
      </div>

      {/* Graded results list — last 50 */}
      <section className="mt-16">
        <h2 className="font-display text-2xl uppercase text-hi">Graded Results</h2>
        <StitchRule tone="faint" className="mt-3" />
        {recent.length === 0 ? (
          <div className="mt-6 rounded-panel border border-line bg-card p-10 text-center text-low">
            No graded {cfg.name} picks yet — check back when the season is active.{' '}
            <Link href="/results" className="text-gold underline decoration-gold/40 transition-colors hover:text-gold-light">Full record →</Link>
          </div>
        ) : (
          <>
            <ul className="mt-1">
              {recent.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <ResultLetter result={r.result ?? ''} />
                    <span className="truncate font-mono text-[13px] text-mid">{r.pick_text}</span>
                  </div>
                  <div className="tnum ml-3 flex shrink-0 items-center gap-3 font-mono text-[12px] text-low">
                    <span>{r.final_score}</span>
                    <span>{r.game_date}</span>
                  </div>
                </li>
              ))}
            </ul>
            {allTime.graded > 50 && (
              <p className="tnum mt-4 font-mono text-[12px] text-low">
                SHOWING LAST 50 OF {allTime.graded} GRADED PICKS
              </p>
            )}
          </>
        )}
      </section>

      <div className="mt-10 flex items-center gap-4">
        <Link href="/results" className="text-sm text-gold underline decoration-gold/40 transition-colors hover:text-gold-light">
          ← All sports record
        </Link>
        <Link href={`/picks/${cfg.slug}`} className="text-sm text-gold underline decoration-gold/40 transition-colors hover:text-gold-light">
          Today&apos;s {cfg.name} picks →
        </Link>
      </div>
    </main>
  );
}
