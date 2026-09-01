import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PickCard } from '@/components/PickCard';
import { PropCard } from '@/components/PropCard';
import { PageMasthead, ResultLetter, StitchRule } from '@/components/Terminal';
import {
  fetchArchiveGamePicks,
  fetchArchiveGameResults,
  fetchArchiveInsights,
  fetchArchivePropPicks,
  fetchArchivePropResults,
  isArchiveDate,
} from '@/lib/gary/archive';
import { etDateLabel } from '@/lib/gary/format';
import type { GameResultRow, InsightRow, PropResultRow } from '@/lib/gary/types';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  if (!isArchiveDate(date)) {
    return pageMetadata({
      canonical: '/archive',
      title: 'Archive Date Not Found | Gary AI',
      description: 'That Gary AI archive date is not available.',
      robots: { index: false },
    });
  }
  return pageMetadata({
    canonical: `/archive/${date}`,
    title: `Gary AI Picks Archive — ${date}`,
    description: `Gary AI’s stored game picks, player props, Hub research, and graded results for ${date}.`,
  });
}

export default async function ArchiveDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!isArchiveDate(date)) notFound();

  const [picks, props, insights, gameResults, propResults] = await Promise.all([
    fetchArchiveGamePicks(date),
    fetchArchivePropPicks(date),
    fetchArchiveInsights(date),
    fetchArchiveGameResults(date),
    fetchArchivePropResults(date),
  ]);

  if (picks.length + props.length + insights.length + gameResults.length + propResults.length === 0) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-6xl px-5 pb-20 pt-12">
      <Link
        href="/archive"
        className="font-mono text-[11px] uppercase tracking-[0.05em] text-gold underline decoration-gold/40 underline-offset-4"
      >
        ← All archive dates
      </Link>
      <div className="mt-5">
        <PageMasthead
          title="Daily archive"
          meta={date}
          sub={`The stored Gary board for ${etDateLabel(date)}. Results are presented separately because older records do not all carry a durable source-pick ID.`}
        />
      </div>

      {picks.length > 0 && (
        <ArchiveSection title="Game picks" count={picks.length}>
          <div className="grid gap-5 md:grid-cols-2">
            {picks.map((pick, index) => (
              <PickCard
                key={pick.pick_id ?? `${pick.awayTeam}-${pick.homeTeam}-${pick.pick}-${index}`}
                pick={pick}
                expanded
              />
            ))}
          </div>
        </ArchiveSection>
      )}

      {props.length > 0 && (
        <ArchiveSection title="Player props" count={props.length}>
          <div className="grid gap-5 md:grid-cols-2">
            {props.map((prop, index) => (
              <PropCard
                key={`${prop.player}-${prop.prop}-${prop.line}-${index}`}
                prop={prop}
                expanded
              />
            ))}
          </div>
        </ArchiveSection>
      )}

      {insights.length > 0 && (
        <ArchiveSection title="Hub research" count={insights.length}>
          <ul className="grid gap-3 md:grid-cols-2">
            {insights.map(row => <ArchiveInsight key={row.id} row={row} />)}
          </ul>
        </ArchiveSection>
      )}

      {(gameResults.length > 0 || propResults.length > 0) && (
        <ArchiveSection title="Graded results" count={gameResults.length + propResults.length}>
          <div className="grid gap-5 lg:grid-cols-2">
            {gameResults.length > 0 && <GameResults rows={gameResults} />}
            {propResults.length > 0 && <PropResults rows={propResults} />}
          </div>
        </ArchiveSection>
      )}
    </main>
  );
}

function ArchiveSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[1.7rem] uppercase leading-none text-hi">{title}</h2>
        <span className="tnum font-mono text-[11px] text-low">{count}</span>
      </div>
      <StitchRule tone="faint" className="mb-6 mt-4" />
      {children}
    </section>
  );
}

function ArchiveInsight({ row }: { row: InsightRow }) {
  return (
    <li className="rounded-card border border-line bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.05em] text-gold">
          {row.category ?? row.league ?? 'Insight'}
        </span>
        <span className="tnum font-mono text-[10.5px] text-low">{row.game}</span>
      </div>
      <p className="mt-2 text-[15px] font-medium leading-snug text-hi">{row.headline}</p>
      {row.detail && <p className="mt-1.5 text-[13px] leading-relaxed text-mid">{row.detail}</p>}
      {row.result && (
        <p className="mt-3 flex items-center gap-2 font-mono text-[11px] text-low">
          <ResultLetter result={row.result} /> {row.result_note ?? row.result}
        </p>
      )}
    </li>
  );
}

function GameResults({ rows }: { rows: GameResultRow[] }) {
  return (
    <div className="rounded-panel border border-line bg-card p-5">
      <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.05em] text-gold">Games</h3>
      <ul className="mt-3">
        {rows.map((row, index) => (
          <li key={`${row.pick_text}-${index}`} className="flex items-start gap-3 border-b border-line py-3 last:border-0">
            <ArchiveResult result={row.result} />
            <div className="min-w-0 flex-1">
              <p className="break-words text-[13.5px] text-hi">{row.pick_text ?? row.matchup}</p>
              <p className="tnum mt-0.5 font-mono text-[10.5px] text-low">
                {[row.league, row.final_score].filter(Boolean).join(' · ')}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PropResults({ rows }: { rows: PropResultRow[] }) {
  return (
    <div className="rounded-panel border border-line bg-card p-5">
      <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.05em] text-gold">Props</h3>
      <ul className="mt-3">
        {rows.map((row, index) => (
          <li key={`${row.player_name}-${row.prop_type}-${index}`} className="flex items-start gap-3 border-b border-line py-3 last:border-0">
            <ArchiveResult result={row.result} />
            <div className="min-w-0 flex-1">
              <p className="break-words text-[13.5px] text-hi">
                {[row.player_name, row.bet ?? row.pick_text ?? row.prop_type].filter(Boolean).join(' · ')}
              </p>
              <p className="tnum mt-0.5 font-mono text-[10.5px] text-low">
                {[row.matchup, row.actual_value != null ? `Actual ${row.actual_value}` : null].filter(Boolean).join(' · ')}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArchiveResult({ result }: { result: string | null }) {
  if (!result?.trim()) {
    return <span aria-label="Ungraded" className="font-mono text-[13px] font-bold text-low">—</span>;
  }
  return <ResultLetter result={result} />;
}
