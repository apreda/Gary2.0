import Link from 'next/link';

/**
 * The Quant Terminal primitives, ported from iOS (Views.swift):
 * - StitchRule    = StitchLine — the dashed betting-slip seam (dash 4, gap 5)
 * - PageMasthead  = GaryPageHeader — mono gold ALL-CAPS title, quiet meta, gold stitch
 * - StatTile      = quantPanel KPI tile — micro label / big mono value / mono sub
 * - GhostLink     = the one secondary button style (hairline, never gold)
 * Gold marks what Gary says; everything else stays quiet.
 */

export function StitchRule({ tone = 'gold', className = '' }: { tone?: 'gold' | 'faint'; className?: string }) {
  return <div aria-hidden className={`${tone === 'gold' ? 'stitch-gold' : 'stitch-faint'} ${className}`} />;
}

export function PageMasthead({
  title,
  meta,
  sub,
  children,
}: {
  title: string;
  meta?: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <header>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="font-mono text-[22px] font-normal uppercase tracking-[0.04em] text-gold md:text-[26px]">
          {title}
        </h1>
        {meta && <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-low">{meta}</span>}
      </div>
      {sub && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-mid">{sub}</p>}
      {children}
      <StitchRule className="mt-5" />
    </header>
  );
}

export function StatTile({
  label,
  value,
  sub,
  valueClassName = 'text-hi',
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="quant-panel p-4">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-low">{label}</p>
      <p className={`tnum mt-1.5 font-mono text-[28px] font-bold leading-none md:text-[32px] ${valueClassName}`}>
        {value}
      </p>
      {sub && <p className="tnum mt-1.5 font-mono text-[11px] text-low">{sub}</p>}
    </div>
  );
}

export function GhostLink({
  href,
  children,
  className = '',
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-card border border-line-strong px-5 py-3 text-sm text-mid transition-colors hover:border-white/30 hover:text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink ${className}`}
    >
      {children}
    </Link>
  );
}

/** Colored mono result letter — no bubble (the app-wide result-tag rule). */
export function ResultLetter({ result }: { result: string }) {
  const r = result.trim().toLowerCase();
  const tone = r === 'won' || r === 'win' ? 'text-win' : r === 'lost' || r === 'loss' ? 'text-loss' : 'text-gold';
  const letter = r === 'won' || r === 'win' ? 'W' : r === 'lost' || r === 'loss' ? 'L' : 'P';
  return <span className={`font-mono text-[13px] font-bold ${tone}`}>{letter}</span>;
}
