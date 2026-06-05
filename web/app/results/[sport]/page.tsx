import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eyebrow } from '@/components/Eyebrow';
import {
  fetchAllGameResults, computeRecord, currentStreak, sinceDate,
} from '@/lib/gary/results';
import { estDateStr } from '@/lib/gary/dates';
import { SPORTS, sportBySlug } from '@/lib/gary/leagues';

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
  const l30 = computeRecord(sinceDate(results, estDateStr(new Date(Date.now() - 30 * 86400000))));
  const streak = currentStreak(results);

  const recent = results
    .filter(r => {
      const nr = (r.result ?? '').trim().toLowerCase();
      return nr === 'won' || nr === 'lost' || nr === 'push';
    })
    .slice(0, 50);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Eyebrow accent={cfg.accent}>{cfg.code} · RESULTS</Eyebrow>
      <h1 className="mt-2 font-display text-4xl text-white/95">{cfg.longName} Track Record</h1>
      <p className="mt-2 max-w-2xl text-white/60">
        Every graded {cfg.name} pick — wins, losses, and pushes — on the public record.
        Units assume flat 1-unit stakes at the listed odds.
      </p>

      {/* Headline tiles: all-time / L30 / streak */}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {([
          ['ALL-TIME', `${allTime.wins}-${allTime.losses}-${allTime.pushes}`, `${allTime.pct}% · ${fmtUnits(allTime.netUnits)}`],
          ['LAST 30 DAYS', `${l30.wins}-${l30.losses}-${l30.pushes}`, `${l30.pct}% · ${fmtUnits(l30.netUnits)}`],
          ['STREAK', streak ? `${streak.count}${streak.kind === 'won' ? 'W' : 'L'}` : '—', streak?.kind === 'won' ? 'riding it' : streak ? 'owning it' : ''],
        ] as [string, string, string][]).map(([label, big, sub]) => (
          <div key={label} className="rounded-[12px] border border-white/10 bg-card p-5">
            <Eyebrow>{label}</Eyebrow>
            <p className="mt-2 font-display text-3xl text-white/95">{big}</p>
            {sub && <p className="mt-1 font-mono text-[12px] text-white/55">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Graded results list — last 50 */}
      <section className="mt-12">
        <h2 className="font-display text-2xl text-white/95">Graded Results</h2>
        {recent.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-white/10 bg-card p-10 text-center text-white/50">
            No graded {cfg.name} picks yet — check back when the season is active.{' '}
            <Link href="/results" className="text-white/75 underline">Full record →</Link>
          </div>
        ) : (
          <>
            <ul className="mt-4 space-y-2">
              {recent.map((r, i) => {
                const nr = (r.result ?? '').trim().toLowerCase();
                return (
                  <li key={i} className="flex items-center justify-between rounded-[10px] border border-white/8 bg-card px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`font-mono text-[12px] font-bold ${nr === 'won' ? 'text-win' : nr === 'lost' ? 'text-loss' : 'text-gold'}`}>
                        {nr === 'won' ? 'W' : nr === 'lost' ? 'L' : 'P'}
                      </span>
                      <span className="truncate font-mono text-[13px] text-white/80">{r.pick_text}</span>
                    </div>
                    <div className="ml-3 flex shrink-0 items-center gap-3 font-mono text-[12px] text-white/45">
                      <span>{r.final_score}</span>
                      <span>{r.game_date}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {allTime.graded > 50 && (
              <p className="mt-4 font-mono text-[12px] text-white/40">
                SHOWING LAST 50 OF {allTime.graded} GRADED PICKS
              </p>
            )}
          </>
        )}
      </section>

      <div className="mt-10 flex items-center gap-4">
        <Link href="/results" className="text-sm text-white/55 underline hover:text-white/85">
          ← All sports record
        </Link>
        <Link href={`/picks/${cfg.slug}`} className="text-sm text-white/55 underline hover:text-white/85">
          Today&apos;s {cfg.name} picks →
        </Link>
      </div>
    </main>
  );
}
