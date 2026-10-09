import Link from 'next/link';

export function StitchRule({ tone = 'gold', className = '' }: { tone?: 'gold' | 'faint'; className?: string }) {
  return <div aria-hidden className={`${tone === 'gold' ? 'site-rule-gold' : 'site-rule'} ${className}`} />;
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
  // The app's page header: the title in the display face with its date in
  // small type beside it, a gold hairline under the row.
  return (
    <header className="app-masthead">
      <div className="app-masthead-row">
        <h1>{title}</h1>
        {meta && <span>{meta}</span>}
      </div>
      {sub && <p className="app-masthead-sub">{sub}</p>}
      {children}
      <StitchRule className="mt-4" />
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
      <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-low">{label}</p>
      <p className={`tnum mt-1.5 font-display text-[42px] font-normal leading-none md:text-[48px] ${valueClassName}`}>
        {value}
      </p>
      {sub && <p className="tnum mt-1.5 text-[14px] text-low">{sub}</p>}
    </div>
  );
}

/** A secondary action in the app's style: gold words with a chevron, no outline (design.md). */
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
    <Link href={href} className={`app-action ${className}`}>
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
