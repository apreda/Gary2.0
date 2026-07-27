import Link from 'next/link';

export interface TabItem {
  href: string;
  label: string;
  active?: boolean;
}

/**
 * The app's tab grammar — a row of words with a gold rule under the live one
 * (TODAY / TOMORROW, GARY / YOU). Explicitly NOT rounded chips: pill buttons
 * are banned product-wide, and the league row on the picks board was the last
 * place they survived on the web.
 */
export function UnderlineTabs({ items, className = '' }: { items: TabItem[]; className?: string }) {
  return (
    <nav className={`rail-scroll -mx-5 overflow-x-auto px-5 ${className}`}>
      <div className="flex w-max items-end gap-6 border-b border-line pb-0">
        {items.map(t => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? 'page' : undefined}
            className={`-mb-px border-b-2 pb-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink ${
              t.active
                ? 'border-gold text-gold'
                : 'border-transparent text-low hover:border-gold/40 hover:text-hi'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
