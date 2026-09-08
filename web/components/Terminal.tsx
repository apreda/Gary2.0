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
  return (
    <header>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="font-display text-[clamp(3.5rem,7vw,5.75rem)] font-normal leading-none text-hi">
          {title}
        </h1>
        {meta && <span className="text-[14px] tracking-[0.04em] text-low">{meta}</span>}
      </div>
      {sub && <p className="mt-5 max-w-2xl text-[18px] leading-relaxed text-mid">{sub}</p>}
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
      <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-low">{label}</p>
      <p className={`tnum mt-1.5 font-display text-[42px] font-normal leading-none md:text-[48px] ${valueClassName}`}>
        {value}
      </p>
      {sub && <p className="tnum mt-1.5 text-[14px] text-low">{sub}</p>}
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
      className={`inline-flex items-center gap-1.5 rounded-card border border-gold/40 px-5 py-3 text-sm text-gold transition-colors hover:border-gold/70 hover:text-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink ${className}`}
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
