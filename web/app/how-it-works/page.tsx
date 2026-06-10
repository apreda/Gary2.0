import type { Metadata } from 'next';
import Link from 'next/link';
import { Eyebrow } from '@/components/Eyebrow';
import { JsonLd } from '@/components/JsonLd';
import { AppStoreButton } from '@/components/AppStoreButton';
import { PageMasthead, StitchRule, GhostLink } from '@/components/Terminal';

export const metadata: Metadata = {
  title: 'How Gary Works — Methodology | Gary AI',
  description:
    'How Gary AI makes free daily sports picks: live-data research, written reasoning for every call, audited stats, and every pick graded the next morning.',
  alternates: { canonical: '/how-it-works' },
};

const faqItems = [
  {
    question: 'Is Gary free?',
    answer:
      "The full slate is — every game's pick with the written reasoning, every day, plus the props board, the Hub, and the complete public track record. Winners, Gary's highest-conviction board, is the paid product: from $9.99/mo per sport in the iOS app, or All-Access for every board.",
  },
  {
    question: 'What sports does Gary cover?',
    answer:
      'NBA, NFL, NHL, MLB, NCAAB, NCAAF, and the 2026 FIFA World Cup. Game picks and player props are covered across all active seasons.',
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
    body: `A research agent investigates every matchup before a pick is produced. It pulls live odds from multiple sportsbooks, season statistics and recent-game logs, injury reports with dates, platoon and matchup splits, ballpark and venue factors, and weather where applicable. The agent works through a structured investigation — it only reports what it can verify against the underlying data, and it flags gaps rather than filling them with assumptions.`,
  },
  {
    num: '02',
    title: 'The call',
    body: `Gary evaluates the research against a written constitution for each sport. MLB weighs starting pitching quality and market price. NCAAB accounts for guard-play dynamics, rest situations, and home-court context. Each sport has its own rules, and those rules stay consistent — Gary doesn't post a pick just because there's a game on the board. When Gary makes a call, he assigns a confidence rating from 50 to 100 percent and writes out the full reasoning in plain language. The rationale covers what the data showed, what Gary weighed, and why the line looks wrong.`,
  },
  {
    num: '03',
    title: 'Fact-check',
    body: `Before a pick is published, a second pass audits the numeric claims in the writeup against the underlying data that was actually fetched. If a rationale cites a player's recent average or a team's record in a specific situation, those numbers are verified. Picks that fail the audit are corrected or retried — they don't go out as written. This was added after a review of loss cases that traced back to stale or fabricated statistics.`,
  },
  {
    num: '04',
    title: 'Grading',
    body: `Every pick is graded against official final scores the morning after — wins, losses, and pushes. There is no cherry-picking or restatement of the record. The complete history is public at betwithgary.ai/results, broken down by sport, with net units calculated at flat 1-unit stakes. Losing streaks stay on the record the same as winning streaks.`,
  },
];

export default function HowItWorksPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-14">
      <JsonLd data={faqJsonLd} />

      <PageMasthead
        title="How Gary works"
        meta="METHODOLOGY"
        sub="Gary covers NBA, NFL, NHL, MLB, NCAAB, NCAAF, and the 2026 World Cup. Every pick follows the same four-step process from research to graded result."
      />

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
