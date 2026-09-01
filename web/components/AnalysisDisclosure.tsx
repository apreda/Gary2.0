import Link from 'next/link';
import { Eyebrow } from '@/components/Eyebrow';

const linkClass =
  'text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold';

/**
 * Visible authorship/process disclosure for pages that publish Gary's analysis.
 * Keep this copy literal: Gary is an AI product and no human review is implied.
 */
export function AnalysisDisclosure({ className = '' }: { className?: string }) {
  return (
    <aside
      aria-label="About Gary's analysis"
      className={`rounded-panel border border-gold/30 bg-card px-6 py-5 ${className}`}
    >
      <Eyebrow>ANALYSIS DISCLOSURE</Eyebrow>
      <h2 className="mt-2 font-display text-2xl uppercase leading-tight text-hi">
        An AI product, with a public process
      </h2>
      <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-mid">
        Gary is an AI sports-analysis product and editorial persona, not a human
        handicapper. The published workflow uses an AI research agent and a separate
        check of numeric claims against the data fetched for the analysis. Unless a page
        explicitly says otherwise, the site does not claim that a human expert reviewed
        a pick.
      </p>
      <nav aria-label="Analysis transparency" className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
        <Link href="/how-it-works" className={linkClass}>Methodology</Link>
        <Link href="/editorial-standards" className={linkClass}>Editorial standards</Link>
        <Link href="/data-sources" className={linkClass}>Data sources</Link>
        <Link href="/corrections" className={linkClass}>Report an error</Link>
      </nav>
    </aside>
  );
}
