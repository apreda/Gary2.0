import type { Metadata } from 'next';
import Link from 'next/link';
import { Eyebrow } from '@/components/Eyebrow';
import { PageMasthead, StitchRule } from '@/components/Terminal';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = pageMetadata({
  canonical: '/editorial-standards',
  title: 'Editorial Standards — How Gary AI Publishes Picks',
  description:
    'Gary AI editorial standards covering AI authorship, research, numeric verification, confidence, public grading, corrections, and limitations.',
});

const linkClass =
  'text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold';

const standards = [
  {
    num: '01',
    title: 'State the authorship plainly',
    body:
      'Gary is an AI sports-analysis product and editorial persona. A Gary byline or first-person sentence is the product voice, not evidence that a human handicapper wrote or reviewed the analysis. We only describe human review on a page if it actually occurred and is identified there.',
  },
  {
    num: '02',
    title: 'Research before the call',
    body:
      'The workflow begins with an AI research agent that gathers available market, schedule, statistical, availability, matchup, venue, and weather context. Not every category applies to every sport or game, and a missing input should not be filled with an invented fact.',
  },
  {
    num: '03',
    title: 'Check factual numbers',
    body:
      'A separate pass checks numeric claims in the rationale against the data fetched for that analysis. A claim that does not survive that check is corrected or retried rather than knowingly published as verified.',
  },
  {
    num: '04',
    title: 'Keep the sport-specific rules consistent',
    body:
      'Gary applies a written set of considerations for each sport instead of treating every market alike. The weight of starting pitching, guard play, rest, venue, or other context depends on the sport and matchup.',
  },
  {
    num: '05',
    title: 'Show uncertainty',
    body:
      'Confidence is an estimate attached to the analysis, not a guarantee. When no call has posted, the board says that it is pending or that no call was posted instead of presenting a placeholder as a recommendation.',
  },
  {
    num: '06',
    title: 'Grade the outcome in public',
    body:
      'Published picks are graded against final scores as wins, losses, or pushes. Win percentage uses decided results, with pushes excluded, and unit results use flat one-unit stakes at the listed odds. Losing results remain part of the record.',
  },
];

export default function EditorialStandardsPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <PageMasthead
        title="Editorial standards"
        meta="PUBLISHING POLICY"
        sub="The rules we use to describe Gary's authorship, research, verification, confidence, grading, and mistakes."
      />

      <section className="mt-10">
        {standards.map((standard, index) => (
          <div key={standard.num}>
            {index > 0 && <StitchRule tone="faint" />}
            <div className="grid gap-4 py-8 md:grid-cols-[76px_1fr]">
              <span className="tnum font-mono text-2xl font-bold text-gold">{standard.num}</span>
              <div>
                <h2 className="font-display text-2xl uppercase text-hi">{standard.title}</h2>
                <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-mid">{standard.body}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-8 rounded-panel border border-line bg-card px-7 py-7">
        <Eyebrow>LIMITS</Eyebrow>
        <h2 className="mt-2 font-display text-2xl uppercase text-hi">What the process cannot promise</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-mid">
          Data can be delayed, incomplete, or later revised. Sportsbook prices can move after
          research. AI-generated analysis can still contain an error, and a well-supported call
          can still lose. Gary&apos;s content is informational and entertainment content, not a
          promise of profit or a substitute for checking current information yourself.
        </p>
      </section>

      <section className="mt-10">
        <Eyebrow>READ THE EVIDENCE</Eyebrow>
        <p className="mt-3 text-[15px] leading-relaxed text-mid">
          See the full <Link href="/how-it-works" className={linkClass}>methodology</Link>,
          learn which <Link href="/data-sources" className={linkClass}>data categories</Link>{' '}
          inform the work, inspect the <Link href="/results" className={linkClass}>public record</Link>,
          or <Link href="/corrections" className={linkClass}>report a factual error</Link>.
        </p>
      </section>
    </main>
  );
}
