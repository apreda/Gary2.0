import type { Metadata } from 'next';
import { LaunchOffer } from '@/components/LaunchOffer';
import { ACTIVE_COVERAGE, FREE_OFFER, LAUNCH_OFFER } from '@/lib/gary/launch-offer';
import Link from 'next/link';
import { Eyebrow } from '@/components/Eyebrow';
import { JsonLd } from '@/components/JsonLd';
import { AppStoreButton } from '@/components/AppStoreButton';
import { AnalysisDisclosure } from '@/components/AnalysisDisclosure';
import { PageMasthead, StitchRule, GhostLink } from '@/components/Terminal';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({
  canonical: '/how-it-works',
  title: 'How Gary Works — Methodology | Gary AI',
  description:
    'How Gary AI makes free daily sports picks: available sports data, written reasoning, reviewed Winners selections, and a public graded record.',
});

const faqItems = [
  {
    question: 'Is Gary free?',
    answer:
      `${FREE_OFFER} ${LAUNCH_OFFER}`,
  },
  {
    question: 'What sports does Gary cover?',
    answer:
      ACTIVE_COVERAGE,
  },
  {
    question: 'Does Gary place bets?',
    answer:
      'No. Gary is for informational and entertainment purposes only. We do not facilitate gambling, accept deposits, or place bets on anyone\'s behalf.',
  },
  {
    question: 'How is the track record calculated?',
    answer:
      'Every graded pick is counted — wins, losses, and pushes. Win percentage is calculated on decided results only (pushes excluded). Units assume flat 1-unit stakes at the listed odds. The full record is public at betwithgary.ai/results.',
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.answer,
    },
  })),
};

const steps = [
  {
    num: '01',
    title: 'Research',
    body: `Gary starts with a sport-specific desk of available odds, season and recent-game statistics, dated injury reports and matchup context. MLB also uses a research assistant to investigate the supplied evidence and additional sources; football currently uses its prepared data desk. Coverage varies by sport and provider. Missing or stale information can limit a call, and automated research can still make mistakes.`,
  },
  {
    num: '02',
    title: 'The call',
    body: `Gary considers both sides of the matchup and the available price, then makes a call with written reasoning. The full game slate is the free resource; it is not a recommendation to bet every game. Confidence expresses Gary’s judgment, not a calibrated probability of winning. Read the assumptions and opposing evidence alongside the pick.`,
  },
  {
    num: '03',
    title: 'Winners review',
    body: `Winners is a separate shortlist of published picks. A review examines the original evidence, the exact line and odds, opposing evidence and unresolved assumptions before a ticket can qualify. There are at most six game selections and six props per league; spaces may remain empty. Once published, a Winners ticket is preserved. Review does not guarantee every factual claim is correct or that a ticket will win.`,
  },
  {
    num: '04',
    title: 'Grading',
    body: `Published picks are graded against final scores or player results when those results are available. Wins, losses and pushes stay visible. Delayed results remain pending; documented corrections can change a grade. The complete history is public at betwithgary.ai/results, broken down by sport, with net units calculated at flat 1-unit stakes. Losing streaks stay on the record the same as winning streaks.`,
  },
];

export default function HowItWorksPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-14">
      <JsonLd data={faqJsonLd} />

      <PageMasthead
        title="How Gary AI makes sports picks"
        meta="METHODOLOGY"
        sub={ACTIVE_COVERAGE}
      />

      <AnalysisDisclosure className="mt-7" />
      <LaunchOffer className="mt-7" />

      {/* Four-step methodology — numbered rail, not gray boxes */}
      <div className="mt-12">
        {steps.map((step, i) => (
          <div key={step.num}>
            {i > 0 && <StitchRule tone="faint" />}
            <div className="grid gap-4 py-10 md:grid-cols-[88px_1fr]">
              <span className="tnum font-mono text-[28px] font-bold leading-none text-gold">{step.num}</span>
              <div>
                <h2 className="font-display text-3xl uppercase leading-none text-hi">{step.title}</h2>
                <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-mid">{step.body}</p>
                {step.num === '03' && (
                  <p className="mt-3 text-[13px] text-low">
                    <Link
                      href="/corrections"
                      className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
                    >
                      How correction reports are handled →
                    </Link>
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* FAQ — visible section, also carries JSON-LD above */}
      <section className="mt-16">
        <Eyebrow>FAQ</Eyebrow>
        <h2 className="mt-2 font-display text-3xl uppercase text-hi">Common questions</h2>
        <div className="mt-6 space-y-4">
          {faqItems.map((item, i) => (
            <div key={i} className="quant-panel px-6 py-5">
              <h3 className="font-display text-xl text-hi">{item.question}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-mid">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Record link + CTA */}
      <section className="mt-16 rounded-panel border border-line bg-card px-7 py-9">
        <Eyebrow>THE RECORD</Eyebrow>
        <h2 className="mt-2 font-display text-2xl uppercase text-hi">The full record is public</h2>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-mid">
          Every graded pick — including losses — is on the record at{' '}
          <Link href="/results" className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold">
            betwithgary.ai/results
          </Link>
          . Win-loss by sport, net units at flat stakes, and a full recent-results tape.
        </p>
        <div className="mt-6 flex flex-wrap gap-4">
          <AppStoreButton label="Get Gary on iOS" surface="how_it_works" />
          <GhostLink href="/results">View track record</GhostLink>
        </div>
      </section>
    </main>
  );
}
