import type { Metadata } from 'next';
import Link from 'next/link';
import { Eyebrow } from '@/components/Eyebrow';
import { PageMasthead } from '@/components/Terminal';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = pageMetadata({
  canonical: '/data-sources',
  title: 'Data Sources — What Informs Gary AI Sports Picks',
  description:
    'The market, schedule, statistics, availability, matchup, venue, weather, and final-score data categories used in Gary AI analysis.',
});

const linkClass =
  'text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold';

const categories = [
  {
    label: 'Markets',
    title: 'Sportsbook odds and lines',
    body:
      'Available prices and market lines gathered during the research window from multiple sportsbooks. A displayed price is a snapshot for the analysis, not a live quote or a guarantee that the same price remains available.',
  },
  {
    label: 'Schedule',
    title: 'Matchups and start times',
    body:
      'League schedules, opponents, venues, and scheduled start times provide the frame for each board. Postponements and late schedule changes can take time to appear.',
  },
  {
    label: 'Performance',
    title: 'Season statistics and recent logs',
    body:
      'Team and player performance data can include season totals, recent-game logs, records, and matchup or platoon splits when they are relevant and available.',
  },
  {
    label: 'Availability',
    title: 'Injuries and status reports',
    body:
      'Dated injury and availability information is considered where it affects the matchup. Late scratches, lineup changes, and reporting delays remain possible.',
  },
  {
    label: 'Context',
    title: 'Venue, conditions, and situation',
    body:
      'Depending on the sport, research can include ballpark or venue effects, weather, rest, travel, and other situational factors. Not every factor applies to every analysis.',
  },
  {
    label: 'Grading',
    title: 'Final scores and settled outcomes',
    body:
      'Completed game picks are graded against final scores. The results pages report wins, losses, pushes, win percentage on decided picks, and flat one-unit performance at the listed odds.',
  },
];

export default function DataSourcesPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <PageMasthead
        title="Data sources"
        meta="RESEARCH INPUTS"
        sub="Gary's research combines several kinds of sports and market data. This page describes the categories without claiming a provider that is not identified on the analysis itself."
      />

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        {categories.map(category => (
          <article key={category.label} className="quant-panel p-6">
            <Eyebrow>{category.label}</Eyebrow>
            <h2 className="mt-2 font-display text-2xl uppercase text-hi">{category.title}</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-mid">{category.body}</p>
          </article>
        ))}
      </section>

      <section className="mt-10 rounded-panel border border-gold/30 bg-card px-7 py-7">
        <Eyebrow>HOW TO READ A PICK</Eyebrow>
        <h2 className="mt-2 font-display text-2xl uppercase text-hi">A researched snapshot, not a live feed</h2>
        <div className="mt-3 max-w-3xl space-y-3 text-[15px] leading-relaxed text-mid">
          <p>
            A rationale reflects the evidence available during its research window. The exact
            sportsbook or retrieval time is not displayed on every analysis, so verify the
            current price, player status, and game conditions before relying on a factual detail.
          </p>
          <p>
            The numeric-claim check compares a writeup with the underlying data fetched for that
            analysis. It reduces unsupported claims; it does not make every input complete or
            guarantee that a source will not later update its data.
          </p>
        </div>
      </section>

      <section className="mt-10">
        <Eyebrow>QUESTIONS OR ERRORS</Eyebrow>
        <p className="mt-3 text-[15px] leading-relaxed text-mid">
          Read the <Link href="/how-it-works" className={linkClass}>full methodology</Link>{' '}
          and <Link href="/editorial-standards" className={linkClass}>editorial standards</Link>.
          If a source-dependent statement looks wrong, send the page URL and the disputed detail
          through the <Link href="/corrections" className={linkClass}>corrections process</Link>.
        </p>
      </section>
    </main>
  );
}
