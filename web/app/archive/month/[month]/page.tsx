import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/JsonLd';
import { PageMasthead } from '@/components/Terminal';
import {
  archiveDateLabel,
  archiveMonthLabel,
  fetchArchiveDateSummaries,
  isArchiveMonth,
  type ArchiveDateSummary,
} from '@/lib/gary/archive';
import { SITE_URL, pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 3600;

// Empty means every real month is generated on demand and then kept in ISR.
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ month: string }>;

function summaryLine(summary: ArchiveDateSummary): string {
  return [
    summary.hasGamePicks ? 'Game analysis' : null,
    summary.hasProps ? 'Player props' : null,
    summary.hasResearch ? 'Hub research' : null,
  ].filter(Boolean).join(' · ');
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { month } = await params;
  if (!isArchiveMonth(month)) {
    return pageMetadata({
      canonical: '/archive',
      title: 'Archive Month Not Found | Gary AI',
      description: 'That Gary AI archive month is not available.',
      robots: { index: false, follow: true },
    });
  }

  const dates = (await fetchArchiveDateSummaries()).filter(summary => summary.date.startsWith(`${month}-`));
  const label = archiveMonthLabel(month);
  return pageMetadata({
    canonical: `/archive/month/${month}`,
    title: `${label} Sports Picks Archive | Gary AI`,
    description: `Browse ${dates.length} stored Gary AI sports-pick board${dates.length === 1 ? '' : 's'} from ${label}, with original analysis and separately graded results.`,
    robots: dates.length > 0 ? undefined : { index: false, follow: true },
  });
}

export default async function ArchiveMonthPage({ params }: { params: Params }) {
  const { month } = await params;
  if (!isArchiveMonth(month)) notFound();

  const summaries = await fetchArchiveDateSummaries();
  const dates = summaries.filter(summary => summary.date.startsWith(`${month}-`));
  if (dates.length === 0) notFound();

  const months = [...new Set(summaries.map(summary => summary.date.slice(0, 7)))];
  const index = months.indexOf(month);
  const newer = index > 0 ? months[index - 1] : null;
  const older = index >= 0 ? months[index + 1] ?? null : null;
  const label = archiveMonthLabel(month);
  const canonical = `${SITE_URL}/archive/month/${month}`;

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
              { '@type': 'ListItem', position: 3, name: label, item: canonical },
            ],
          },
          {
            '@type': 'CollectionPage',
            '@id': `${canonical}#page`,
            url: canonical,
            name: `${label} sports picks archive`,
            description: `Gary AI's stored public sports-pick boards from ${label}.`,
            mainEntity: {
              '@type': 'ItemList',
              numberOfItems: dates.length,
              itemListElement: dates.map((summary, position) => ({
                '@type': 'ListItem',
                position: position + 1,
                name: archiveDateLabel(summary.date),
                url: `${SITE_URL}/archive/${summary.date}`,
              })),
            },
          },
        ],
      }} />

      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.05em] text-low">
        <Link href="/archive" className="text-gold underline decoration-gold/40 underline-offset-4">Pick archive</Link>
        <span aria-hidden>/</span>
        <span>{label}</span>
      </nav>

      <div className="mt-5">
        <PageMasthead
          title={`${label} sports picks archive`}
          meta={`${dates.length} stored day${dates.length === 1 ? '' : 's'}`}
          sub={`Every substantive Gary board stored for ${label}, with original picks and research kept separate from the graded record.`}
        />
      </div>

      <ol className="mt-8 grid gap-3 sm:grid-cols-2">
        {dates.map(summary => (
          <li key={summary.date}>
            <Link
              href={`/archive/${summary.date}`}
              className="block rounded-card border border-line bg-card px-5 py-4 transition-colors hover:border-gold/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            >
              <span className="block font-display text-xl uppercase text-hi">{archiveDateLabel(summary.date)}</span>
              <span className="mt-1 block font-mono text-[10.5px] uppercase tracking-[0.04em] text-low">
                {summaryLine(summary)}
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <nav aria-label="Archive month navigation" className="mt-10 flex items-center justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.05em]">
        {older ? (
          <Link href={`/archive/month/${older}`} className="text-gold underline decoration-gold/40 underline-offset-4">
            ← {archiveMonthLabel(older)}
          </Link>
        ) : <span />}
        {newer ? (
          <Link href={`/archive/month/${newer}`} className="text-gold underline decoration-gold/40 underline-offset-4">
            {archiveMonthLabel(newer)} →
          </Link>
        ) : <span />}
      </nav>
    </main>
  );
}
