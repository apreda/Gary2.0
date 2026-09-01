import type { Metadata } from 'next';
import Link from 'next/link';
import { Eyebrow } from '@/components/Eyebrow';
import { PageMasthead, StitchRule } from '@/components/Terminal';
import { pageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = pageMetadata({
  canonical: '/corrections',
  title: 'Corrections — Report an Error to Gary AI',
  description:
    'How to report a factual, odds, schedule, player-status, or grading error in Gary AI sports-pick analysis and public results.',
});

const linkClass =
  'text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold';

const steps = [
  {
    num: '01',
    title: 'Send the exact page',
    body:
      'Include the URL, the pick or result involved, and the specific sentence or value you believe is wrong. A link to reliable supporting information is useful when available.',
  },
  {
    num: '02',
    title: 'We check the underlying record',
    body:
      'The report is checked against the analysis data, the published call, and the final result used for grading. Review timing depends on the detail and data available.',
  },
  {
    num: '03',
    title: 'Substantiated errors are corrected',
    body:
      'A supported correction can update the affected text, data label, or result grade. The original call and its actual outcome should remain part of the public record rather than being rewritten into a different prediction.',
  },
];

export default function CorrectionsPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <PageMasthead
        title="Corrections"
        meta="REPORT AN ERROR"
        sub="AI analysis can be wrong. If you find a factual or grading error, send enough detail for the published item to be checked."
      />

      <section className="mt-8 rounded-panel border border-gold/35 bg-card px-7 py-7">
        <Eyebrow>CONTACT</Eyebrow>
        <h2 className="mt-2 font-display text-2xl uppercase text-hi">Email a correction report</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-mid">
          Send reports to{' '}
          <a
            href="mailto:support@betwithgary.ai?subject=Correction%20report"
            className={linkClass}
          >
            support@betwithgary.ai
          </a>
          . Put “Correction report” in the subject and include the page URL.
        </p>
      </section>

      <section className="mt-10">
        {steps.map((step, index) => (
          <div key={step.num}>
            {index > 0 && <StitchRule tone="faint" />}
            <div className="grid gap-4 py-8 md:grid-cols-[76px_1fr]">
              <span className="tnum font-mono text-2xl font-bold text-gold">{step.num}</span>
              <div>
                <h2 className="font-display text-2xl uppercase text-hi">{step.title}</h2>
                <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-mid">{step.body}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <article className="quant-panel p-6">
          <Eyebrow>CORRECTION</Eyebrow>
          <h2 className="mt-2 font-display text-xl uppercase text-hi">Factual errors</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-mid">
            Incorrect statistics, teams, players, dates, market labels, displayed odds,
            schedule details, final scores, or result grades are appropriate to report.
          </p>
        </article>
        <article className="quant-panel p-6">
          <Eyebrow>NOT A CORRECTION</Eyebrow>
          <h2 className="mt-2 font-display text-xl uppercase text-hi">Outcome or opinion</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-mid">
            A line moving after publication, a reasonable disagreement with the analysis, or a
            pick losing does not by itself make the original factual snapshot incorrect.
          </p>
        </article>
      </section>

      <p className="mt-10 text-[15px] leading-relaxed text-mid">
        For the standards behind published analysis, see{' '}
        <Link href="/editorial-standards" className={linkClass}>Editorial Standards</Link>{' '}
        and <Link href="/data-sources" className={linkClass}>Data Sources</Link>.
      </p>
    </main>
  );
}
