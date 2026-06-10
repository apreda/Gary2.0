import Link from 'next/link';
import Image from 'next/image';
import { StitchRule } from './Terminal';

const COLUMNS: { heading: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    heading: 'The Desk',
    links: [
      { href: '/picks', label: "Today's Picks" },
      { href: '/props', label: 'Player Props' },
      { href: '/hub', label: 'The Hub' },
      { href: '/results', label: 'Track Record' },
    ],
  },
  {
    heading: 'Product',
    links: [
      { href: '/app', label: 'Gary for iOS' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/how-it-works', label: 'How It Works' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '/press', label: 'Press & Brand' },
      { href: '/contact', label: 'Contact' },
      { href: '/terms', label: 'Terms' },
      { href: '/privacy', label: 'Privacy' },
      { href: 'https://x.com/BetwithGary', label: '@BetwithGary', external: true },
    ],
  },
];

const linkClass =
  'text-[13px] text-low transition-colors hover:text-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Colophon */}
          <div>
            <div className="flex items-center gap-2.5">
              <Image src="/brand/GaryIconBG.png" alt="" width={34} height={34} />
              <span className="font-mono text-[15px] uppercase tracking-[0.04em] text-gold">Gary A.I.</span>
            </div>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-low">
              Every game. Every day. On the record. Free picks for the full slate, with the
              reasoning behind them — and every result graded in public.
            </p>
          </div>

          {COLUMNS.map(col => (
            <nav key={col.heading} aria-label={col.heading}>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-gold">{col.heading}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map(l => (
                  <li key={l.href}>
                    {l.external ? (
                      <a href={l.href} className={linkClass}>{l.label}</a>
                    ) : (
                      <Link href={l.href} className={linkClass}>{l.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <StitchRule tone="faint" className="mt-10" />

        <p className="mt-6 text-[13px] leading-relaxed text-low">
          Gary is for informational and entertainment purposes only. We don&apos;t facilitate
          gambling, accept deposits, or place bets. 18+. If you or someone you know has a
          gambling problem, call 1-800-GAMBLER.
        </p>
        <p className="mt-4 font-mono text-[11px] text-faint">
          © {new Date().getFullYear()} Gary A.I. LLC · betwithgary.ai
        </p>
      </div>
    </footer>
  );
}
