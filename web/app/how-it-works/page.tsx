import type { Metadata } from 'next';
import Link from 'next/link';
import { Eyebrow } from '@/components/Eyebrow';
import { JsonLd } from '@/components/JsonLd';
import { AppStoreButton } from '@/components/AppStoreButton';

export const metadata: Metadata = {
  title: 'How Gary Works — Methodology | Gary AI',
  description:
    'How Gary AI produces free daily sports picks: a research agent investigates every matchup with live data, Gary evaluates the evidence and makes the call, numeric claims are audited, and every pick is graded the next morning.',
  alternates: { canonical: '/how-it-works' },
};

const faqItems = [
  {
    question: 'Is Gary free?',
    answer:
      'Yes — every pick, every day. The website publishes the full daily slate across all sports at no cost. The iOS app adds Winners, which is Gary\'s highest-conviction board, curated from the day\'s picks.',
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
    eyebrow: 'STEP 01',
    title: 'Research',
    body: `A research agent investigates every matchup before a pick is produced. It pulls live odds from multiple sportsbooks, season statistics and recent-game logs, injury reports with dates, platoon and matchup splits, ballpark and venue factors, and weather where applicable. The agent works through a structured investigation — it only reports what it can verify against the underlying data, and it flags gaps rather than filling them with assumptions.`,
  },
  {
    eyebrow: 'STEP 02',
    title: 'The Call',
    body: `Gary evaluates the research against a written constitution for each sport. MLB weighs starting pitching quality and market price. NCAAB accounts for guard-play dynamics, rest situations, and home-court context. Each sport has its own rules, and those rules stay consistent — Gary doesn't post a pick just because there's a game on the board. When Gary makes a call, he assigns a confidence rating from 50 to 100 percent and writes out the full reasoning in plain language. The rationale covers what the data showed, what Gary weighed, and why the line looks wrong.`,
  },
  {
    eyebrow: 'STEP 03',
    title: 'Fact-Check',
    body: `Before a pick is published, a second pass audits the numeric claims in the writeup against the underlying data that was actually fetched. If a rationale cites a player's recent average or a team's record in a specific situation, those numbers are verified. Picks that fail the audit are corrected or retried — they don't go out as written. This was added after a review of loss cases that traced back to stale or fabricated statistics.`,
  },
  {
    eyebrow: 'STEP 04',
    title: 'Grading',
    body: `Every pick is graded against official final scores the morning after — wins, losses, and pushes. There is no cherry-picking or restatement of the record. The complete history is public at betwithgary.ai/results, broken down by sport, with net units calculated at flat 1-unit stakes. Losing streaks stay on the record the same as winning streaks.`,
  },
];

export default function HowItWorksPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <JsonLd data={faqJsonLd} />

      <Eyebrow>METHODOLOGY</Eyebrow>
      <h1 className="mt-2 font-display text-4xl text-white/95">How Gary Works</h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-white/60">
        Gary covers NBA, NFL, NHL, MLB, NCAAB, NCAAF, and the 2026 World Cup. Every pick
        follows the same four-step process from research to graded result.
      </p>

      {/* Four-step methodology */}
      <div className="mt-10 space-y-6">
        {steps.map((step, i) => (
          <div
            key={i}
            className="rounded-[20px] border border-white/10 bg-card px-7 py-7"
          >
            <Eyebrow>{step.eyebrow}</Eyebrow>
            <h2 className="mt-2 font-display text-3xl text-white/95">{step.title}</h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/65">
              {step.body}
            </p>
          </div>
        ))}
      </div>

      {/* FAQ — visible section, also carries JSON-LD above */}
      <section className="mt-14">
        <Eyebrow>FAQ</Eyebrow>
        <h2 className="mt-2 font-display text-3xl text-white/95">Common Questions</h2>
        <div className="mt-6 space-y-4">
          {faqItems.map((item, i) => (
            <div
              key={i}
              className="rounded-[12px] border border-white/10 bg-card px-6 py-5"
            >
              <h3 className="font-display text-xl text-white/90">{item.question}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-white/60">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Record link + CTA */}
      <section className="mt-14 rounded-[20px] border border-white/10 bg-card px-7 py-8">
        <Eyebrow>THE RECORD</Eyebrow>
        <h2 className="mt-2 font-display text-2xl text-white/95">The full record is public</h2>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/60">
          Every graded pick — including losses — is on the record at{' '}
          <Link href="/results" className="text-white/80 underline hover:text-white/95">
            betwithgary.ai/results
          </Link>
          . Win-loss by sport, net units at flat stakes, and a full recent-results tape.
        </p>
        <div className="mt-6 flex flex-wrap gap-4">
          <AppStoreButton label="Get Gary on iOS" />
          <Link
            href="/results"
            className="inline-flex items-center rounded-xl border border-white/15 px-5 py-3 text-sm text-white/70 transition-colors hover:border-white/30 hover:text-white/90"
          >
            View Track Record
          </Link>
        </div>
      </section>
    </main>
  );
}
