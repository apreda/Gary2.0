import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/JsonLd';
import { PickCard } from '@/components/PickCard';
import { PropCard } from '@/components/PropCard';
import { PageMasthead, ResultLetter, StitchRule } from '@/components/Terminal';
import {
  adjacentArchiveDates,
  archiveDateLabel,
  archiveDayStats,
  archiveMonthLabel,
  fetchArchiveDateSummaries,
  fetchArchiveDay,
  isArchiveDate,
} from '@/lib/gary/archive';
import type { GameResultRow, InsightRow, PropResultRow } from '@/lib/gary/types';
import { SITE_URL, pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 3600;

// Empty means every valid date is generated on demand and then kept in ISR.
export function generateStaticParams() {
  return [];
}

function archiveDescription(
  label: string,
  counts: { gamePicks: number; propPicks: number; insights: number; gradedResults: number },
): string {
  const contents = [
    counts.gamePicks > 0 ? `${counts.gamePicks} game pick${counts.gamePicks === 1 ? '' : 's'}` : null,
    counts.propPicks > 0 ? `${counts.propPicks} player prop${counts.propPicks === 1 ? '' : 's'}` : null,
    counts.insights > 0 ? `${counts.insights} research note${counts.insights === 1 ? '' : 's'}` : null,
    counts.gradedResults > 0 ? `${counts.gradedResults} graded result${counts.gradedResults === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(', ');
  return `Review Gary AI's stored sports-pick board for ${label}${contents ? `: ${contents}` : ''}. Original analysis and graded results stay separate.`;
}

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

  const day = await fetchArchiveDay(date);
  const counts = archiveDayStats(day);
  const label = archiveDateLabel(date);
  return pageMetadata({
    canonical: `/archive/${date}`,
    title: `Sports Picks Archive — ${label} | Gary AI`,
    description: archiveDescription(label, counts),
    robots: counts.substantive ? undefined : { index: false, follow: true },
  });
}

export default async function ArchiveDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!isArchiveDate(date)) notFound();

  const [day, summaries] = await Promise.all([
    fetchArchiveDay(date),
    fetchArchiveDateSummaries(),
  ]);
  const { picks, props, insights, gameResults, propResults } = day;

  if (picks.length + props.length + insights.length + gameResults.length + propResults.length === 0) {
    notFound();
  }

  const counts = archiveDayStats(day);
  const label = archiveDateLabel(date);
  const month = date.slice(0, 7);
  const monthExists = summaries.some(summary => summary.date.startsWith(`${month}-`));
  const { previous, next } = adjacentArchiveDates(summaries.map(summary => summary.date), date);
  const canonical = `${SITE_URL}/archive/${date}`;
  const description = archiveDescription(label, counts);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-20 pt-12">
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Gary AI', item: `${SITE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'Pick archive', item: `${SITE_URL}/archive` },
              ...(monthExists ? [{
                '@type': 'ListItem',
                position: 3,
                name: archiveMonthLabel(month),
                item: `${SITE_URL}/archive/month/${month}`,
              }] : []),
              { '@type': 'ListItem', position: monthExists ? 4 : 3, name: label, item: canonical },
            ],
          },
          {
            '@type': 'CollectionPage',
            '@id': `${canonical}#page`,
            url: canonical,
            name: `Gary AI sports picks for ${label}`,
            description,
            mainEntity: {
              '@type': 'ItemList',
              numberOfItems: counts.totalItems,
            },
          },
        ],
      }} />

      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.05em] text-low">
        <Link href="/archive" className="text-gold underline decoration-gold/40 underline-offset-4">Pick archive</Link>
        {monthExists && (
          <>
            <span aria-hidden>/</span>
            <Link href={`/archive/month/${month}`} className="text-gold underline decoration-gold/40 underline-offset-4">
              {archiveMonthLabel(month)}
            </Link>
          </>
        )}
        <span aria-hidden>/</span>
        <span>{label}</span>
      </nav>
      <div className="mt-5">
        <PageMasthead
          title={`Sports picks for ${label}`}
          meta={`${counts.totalItems} stored item${counts.totalItems === 1 ? '' : 's'}`}
          sub="The stored Gary board for this day. Results are presented separately because older records do not all carry a durable source-pick ID."
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

      <nav aria-label="Archive date navigation" className="mt-12 grid grid-cols-3 items-center gap-3 font-mono text-[11px] uppercase tracking-[0.05em]">
        <div>
          {previous && (
            <Link href={`/archive/${previous}`} className="text-gold underline decoration-gold/40 underline-offset-4">
              ← {archiveDateLabel(previous)}
            </Link>
          )}
        </div>
        <Link
          href={monthExists ? `/archive/month/${month}` : '/archive'}
          className="text-center text-low underline decoration-white/20 underline-offset-4 hover:text-gold"
        >
          {monthExists ? archiveMonthLabel(month) : 'All dates'}
        </Link>
        <div className="text-right">
          {next && (
            <Link href={`/archive/${next}`} className="text-gold underline decoration-gold/40 underline-offset-4">
              {archiveDateLabel(next)} →
            </Link>
          )}
        </div>
      </nav>
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
