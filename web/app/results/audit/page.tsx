import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/JsonLd';
import { ShareActions } from '@/components/ShareActions';
import { PageMasthead, StitchRule } from '@/components/Terminal';
import { confidenceAudit, monthlyGameAudit } from '@/lib/gary/ledger';
import { computePropsRecord, fetchAllGameResults, fetchAllPropResults } from '@/lib/gary/results';
import { resultsDataset } from '@/lib/gary/results-dataset';
import { pageMetadata, SITE_URL } from '@/lib/seo/metadata';

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({
  canonical: '/results/audit',
  title: 'Gary AI Model Audit — Monthly Results and Confidence Calibration',
  description:
    'Audit Gary AI sports picks by month and confidence band, with the complete public game and prop ledgers available for download.',
});

const fmtUnits = (units: number) => `${units >= 0 ? '+' : ''}${units.toFixed(1)}u`;

function monthLabel(month: string): string {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value - 1, 1)).toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'long', year: 'numeric',
  });
}


export default async function ResultsAuditPage() {
  const [games, props] = await Promise.all([fetchAllGameResults(), fetchAllPropResults()]);
  const months = monthlyGameAudit(games);
  const confidence = confidenceAudit(games);
  const propRecord = computePropsRecord(props);

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-12">
      <JsonLd data={resultsDataset(games, props)} />

      <PageMasthead
        title="Gary AI model audit"
        meta="PUBLIC LEDGER"
        sub="A recomputed view of the same results Gary publishes on the record: monthly performance, outcome calibration by confidence band, and the raw data behind both."
      />

      <div className="mt-6 flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-[0.05em]">
        <Link href="/results" className="text-gold underline decoration-gold/40 underline-offset-4">← Track record</Link>
        <a href="/results.csv" className="text-gold underline decoration-gold/40 underline-offset-4">Download CSV</a>
        <a href="/results.json" className="text-gold underline decoration-gold/40 underline-offset-4">Download JSON</a>
      </div>

      <ShareActions
        title="Gary AI model audit"
        text="See Gary AI's monthly results, confidence calibration, and complete public sports-picks ledger."
        url={`${SITE_URL}/results/audit`}
        surface="results_audit"
        contentType="dataset"
        itemId="public_results_ledger"
        className="mt-6"
      />

      <section className="mt-12">
        <h2 className="font-display text-2xl uppercase text-hi">Monthly game-pick tape</h2>
        <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-mid">
          Every decided game pick remains in its month. Units use flat one-unit stakes at the listed odds; pushes count as graded but not as decisions.
        </p>
        <StitchRule tone="faint" className="mt-4" />
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead className="font-mono text-[10px] uppercase tracking-[0.05em] text-low">
              <tr className="border-b border-line">
                <th className="px-3 py-3">Month</th><th className="px-3 py-3">Record</th>
                <th className="px-3 py-3">Win %</th><th className="px-3 py-3">Net</th><th className="px-3 py-3">Graded</th>
              </tr>
            </thead>
            <tbody>
              {months.map(({ month, record }) => (
                <tr key={month} className="border-b border-line font-mono text-[13px] text-mid last:border-0">
                  <td className="px-3 py-3 text-hi">{monthLabel(month)}</td>
                  <td className="tnum px-3 py-3">{record.wins}-{record.losses}{record.pushes ? `-${record.pushes}` : ''}</td>
                  <td className="tnum px-3 py-3">{record.pct}%</td>
                  <td className={`tnum px-3 py-3 ${record.netUnits >= 0 ? 'text-win' : 'text-loss'}`}>{fmtUnits(record.netUnits)}</td>
                  <td className="tnum px-3 py-3">{record.graded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-2xl uppercase text-hi">Confidence calibration</h2>
        <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-mid">
          Confidence is Gary&apos;s ranking signal, not a promise of win probability. This table shows what actually happened inside each displayed band.
        </p>
        <StitchRule tone="faint" className="mt-4" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {confidence.map(row => (
            <div key={row.floor} className="rounded-card border border-line bg-card p-5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">{row.label}% confidence</p>
              <p className="tnum mt-2 font-display text-3xl text-hi">{row.record.wins}-{row.record.losses}</p>
              <p className="tnum mt-1 font-mono text-[11px] text-low">
                {row.record.pct}% won · {row.count} graded · avg label {row.averageConfidence}%
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-panel border border-line bg-card p-6">
        <h2 className="font-display text-2xl uppercase text-hi">Player props</h2>
        <p className="tnum mt-2 font-mono text-[14px] text-mid">
          {propRecord.wins}-{propRecord.losses}{propRecord.pushes ? `-${propRecord.pushes}` : ''} · {propRecord.pct}% · {fmtUnits(propRecord.netUnits)} · {propRecord.graded} graded
        </p>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-low">
          This record starts September 2, 2026 and covers Gary&rsquo;s core player-prop
          board. Older core player-prop rows remain available in the raw CSV and
          JSON ledgers. The separate Home Run Threat lane is excluded from both
          this record and those downloads. Some winning rows
          have no recorded odds and use the disclosed 0.9-unit fallback in net-unit
          calculations; the exports retain the original missing values.
        </p>
      </section>

      <p className="mt-10 text-[13.5px] leading-relaxed text-low">
        Methodology, known corrections, and source policy are documented in the{' '}
        <Link href="/editorial-standards" className="text-gold underline decoration-gold/40 underline-offset-4">editorial standards</Link>,{' '}
        <Link href="/corrections" className="text-gold underline decoration-gold/40 underline-offset-4">corrections process</Link>, and{' '}
        <Link href="/data-sources" className="text-gold underline decoration-gold/40 underline-offset-4">data-source policy</Link>.
      </p>
    </main>
  );
}
