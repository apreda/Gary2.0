import type { Metadata } from 'next';
import Link from 'next/link';
import { PageMasthead } from '@/components/Terminal';
import { fetchArchiveDates } from '@/lib/gary/archive';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({
  canonical: '/archive',
  title: 'Daily Sports Pick Archive | Gary AI',
  description:
    'Browse Gary AI’s stored daily boards by date, including game picks, player props, Hub research, and separately graded results.',
});

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return `${MONTHS[month - 1] ?? ''} ${year}`.trim();
}

export default async function ArchivePage() {
  const dates = await fetchArchiveDates();
  const months = new Map<string, string[]>();
  for (const date of dates) {
    const key = date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), date]);
  }

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-12">
      <PageMasthead
        title="Pick archive"
        sub="A date-by-date view of Gary's stored public boards. Picks, props, research, and graded results remain separate so the historical record never implies a match the source data cannot prove."
      />

      {dates.length > 0 ? (
        <div className="mt-8 space-y-10">
          {[...months].map(([month, monthDates]) => (
            <section key={month}>
              <h2 className="font-display text-2xl uppercase text-hi">{monthLabel(month)}</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {monthDates.map(date => (
                  <Link
                    key={date}
                    href={`/archive/${date}`}
                    className="rounded-card border border-line bg-card px-4 py-3 font-mono text-[12px] text-mid transition-colors hover:border-gold/50 hover:text-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                  >
                    {date}
                  </Link>
                ))}
              </div>
            </section>
          ))}
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
