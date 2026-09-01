import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/JsonLd';
import { PageMasthead } from '@/components/Terminal';
import {
  archiveDateLabel,
  archiveMonthLabel,
  fetchArchiveDateSummaries,
  type ArchiveDateSummary,
} from '@/lib/gary/archive';
import { SITE_URL, pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({
  canonical: '/archive',
  title: 'Daily Sports Pick Archive | Gary AI',
  description:
    'Browse Gary AI’s stored daily boards by date, including game picks, player props, Hub research, and separately graded results.',
});

function summaryLine(summary: ArchiveDateSummary): string {
  return [
    summary.hasGamePicks ? 'Game analysis' : null,
    summary.hasProps ? 'Player props' : null,
    summary.hasResearch ? 'Hub research' : null,
  ].filter(Boolean).join(' · ');
}

export default async function ArchivePage() {
  const summaries = await fetchArchiveDateSummaries();
  const months = new Map<string, ArchiveDateSummary[]>();
  for (const summary of summaries) {
    const key = summary.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), summary]);
  }
  const recent = summaries.slice(0, 12);

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-12">
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Gary AI', item: `${SITE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'Pick archive', item: `${SITE_URL}/archive` },
            ],
          },
          {
            '@type': 'CollectionPage',
            '@id': `${SITE_URL}/archive#page`,
            url: `${SITE_URL}/archive`,
            name: 'Gary AI daily sports pick archive',
            description: 'Stored daily sports-pick boards with original analysis and separately graded results.',
            mainEntity: {
              '@type': 'ItemList',
              numberOfItems: summaries.length,
            },
          },
        ],
      }} />
      <PageMasthead
        title="Pick archive"
        meta={summaries.length > 0 ? `${summaries.length} stored day${summaries.length === 1 ? '' : 's'}` : undefined}
        sub="Browse Gary's stored public boards by day or month. Picks, props, research, and graded results remain separate so the historical record never implies a match the source data cannot prove."
      />

      {summaries.length > 0 ? (
        <div className="mt-10 space-y-12">
          <section aria-labelledby="latest-boards">
            <h2 id="latest-boards" className="font-display text-2xl uppercase text-hi">Latest boards</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {recent.map(summary => (
                <Link
                  key={summary.date}
                  href={`/archive/${summary.date}`}
                  className="rounded-card border border-line bg-card px-5 py-4 transition-colors hover:border-gold/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                >
                  <span className="block font-display text-xl uppercase text-hi">{archiveDateLabel(summary.date)}</span>
                  <span className="mt-1 block font-mono text-[10.5px] uppercase tracking-[0.04em] text-low">
                    {summaryLine(summary)}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section aria-labelledby="browse-by-month">
            <h2 id="browse-by-month" className="font-display text-2xl uppercase text-hi">Browse by month</h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-mid">
              Monthly shelves keep the archive fast to scan as Gary&apos;s public record grows.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {[...months].map(([month, monthDates]) => (
                  <Link
                    key={month}
                    href={`/archive/month/${month}`}
                    className="rounded-card border border-line bg-card px-4 py-3 font-mono text-[12px] text-mid transition-colors hover:border-gold/50 hover:text-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                  >
                    <span className="block text-hi">{archiveMonthLabel(month)}</span>
                    <span className="mt-1 block text-[10px] uppercase tracking-[0.04em] text-low">
                      {monthDates.length} day{monthDates.length === 1 ? '' : 's'}
                    </span>
                  </Link>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="mt-8 rounded-panel border border-line bg-card p-8 text-center">
          <p className="text-[14.5px] leading-relaxed text-mid">
            No stored board dates are available yet. Today&apos;s board and public results are still available.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-4">
            <Link href="/picks" className="text-sm text-gold underline decoration-gold/40 underline-offset-4">Today&apos;s picks</Link>
            <Link href="/results" className="text-sm text-gold underline decoration-gold/40 underline-offset-4">Track record</Link>
          </div>
        </div>
      )}
    </main>
  );
}
