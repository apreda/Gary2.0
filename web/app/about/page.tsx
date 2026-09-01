import type { Metadata } from 'next';
import Link from 'next/link';
import { AnalysisDisclosure } from '@/components/AnalysisDisclosure';
import { Eyebrow } from '@/components/Eyebrow';
import { PageMasthead, StitchRule } from '@/components/Terminal';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = pageMetadata({
  canonical: '/about',
  title: 'About Gary AI — AI Sports Picks, Publicly Graded',
  description:
    'Learn who operates Gary AI, what the AI sports-analysis product publishes, how picks are checked and graded, and where to report an error.',
});

const linkClass =
  'text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold';

const publishing = [
  {
    title: 'Daily analysis',
    body:
      'Game picks and player-prop analysis across active MLB, NBA, NFL, NHL, NCAAB, and NCAAF schedules, with the completed 2026 World Cup preserved as an archive.',
  },
  {
    title: 'The reasoning',
    body:
      'A written rationale and confidence rating accompany published calls so the evidence and the uncertainty are visible, not hidden behind a result.',
  },
  {
    title: 'The record',
    body:
      'Completed picks are graded as wins, losses, or pushes. The public results and date-based archive keep both good and bad outcomes available to inspect.',
  },
];

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <PageMasthead
        title="About Gary AI"
        meta="PRODUCT & PUBLISHER"
        sub="Gary is an AI sports-analysis product built around visible reasoning and a public graded record."
      />

      <AnalysisDisclosure className="mt-7" />

      <section className="mt-12">
        <Eyebrow>WHO GARY IS</Eyebrow>
        <h2 className="mt-2 font-display text-3xl uppercase text-hi">The bear is the persona. The product is AI.</h2>
        <div className="mt-4 max-w-3xl space-y-4 text-[15px] leading-relaxed text-mid">
          <p>
            Gary AI is operated by Gary A.I. LLC. “Gary” is the product&apos;s editorial
            voice and bear character. The character is not a real person, and its
            first-person voice does not claim professional credentials or human review.
          </p>
          <p>
            The service publishes sports analysis for informational and entertainment
            purposes. It is not a sportsbook: it does not accept deposits, hold funds,
            facilitate wagering, or place bets for users.
          </p>
        </div>
      </section>

      <StitchRule tone="faint" className="my-12" />

      <section>
        <Eyebrow>WHAT WE PUBLISH</Eyebrow>
        <h2 className="mt-2 font-display text-3xl uppercase text-hi">Evidence, calls, and outcomes</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {publishing.map(item => (
            <article key={item.title} className="quant-panel p-5">
              <h3 className="font-display text-xl uppercase text-hi">{item.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-mid">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-panel border border-line bg-card px-7 py-7">
        <Eyebrow>ACCOUNTABILITY</Eyebrow>
        <h2 className="mt-2 font-display text-2xl uppercase text-hi">Inspect the work, not a promise</h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-mid">
          Read the <Link href="/how-it-works" className={linkClass}>methodology</Link>,
          review the <Link href="/results" className={linkClass}>graded record</Link>,
          browse the <Link href="/archive" className={linkClass}>pick archive</Link>, and
          check the <Link href="/editorial-standards" className={linkClass}>publishing standards</Link>.
          If something factual looks wrong, the <Link href="/corrections" className={linkClass}>corrections page</Link>{' '}
          explains what to send us.
        </p>
      </section>

      <section className="mt-12">
        <Eyebrow>CONTACT</Eyebrow>
        <h2 className="mt-2 font-display text-2xl uppercase text-hi">Gary A.I. LLC</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-mid">
          General questions and product support:{' '}
          <a href="mailto:support@betwithgary.ai" className={linkClass}>support@betwithgary.ai</a>.
          Press facts and approved brand materials are available in the{' '}
          <Link href="/press" className={linkClass}>press kit</Link>.
        </p>
      </section>
    </main>
  );
}
