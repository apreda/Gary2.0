'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { AppStoreButton } from './AppStoreButton';

const LINKS = [
  { href: '/picks', label: 'Picks' },
  { href: '/props', label: 'Props' },
  { href: '/results', label: 'Results' },
  { href: '/hub', label: 'Hub' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/pricing', label: 'Pricing' },
];

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink';

export function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className={`flex items-center gap-2.5 ${focusRing}`}>
          <Image src="/brand/gary-head.png" alt="" aria-hidden width={30} height={30} />
          {/* The app's wordmark rule: mono, regular weight, gold, all caps —
              quiet weight + signature color beats bold + white. */}
          <span className="font-mono text-[15px] uppercase tracking-[0.04em] text-gold">Gary A.I.</span>
        </Link>

        {/* Desktop links — active route wears the 2px gold underline (the app's tab rule) */}
        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map(l => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={`relative py-1 text-[13.5px] transition-colors ${focusRing} ${
                  active ? 'text-hi' : 'text-mid hover:text-gold-light'
                }`}
              >
                {l.label}
                {active && <span aria-hidden className="absolute -bottom-0.5 left-0 h-0.5 w-full rounded-full bg-gold" />}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <AppStoreButton label="Get the App" surface="nav" />
          </div>

          {/* Mobile disclosure menu — no JS, real icon */}
          <details className="group relative md:hidden">
            <summary
              className={`flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-card border border-line-strong text-mid [&::-webkit-details-marker]:hidden ${focusRing}`}
              aria-label="Menu"
            >
              <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden>
                <path d="M1 1h14M1 6h14M1 11h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="group-open:opacity-0" />
                <path d="M2 1l12 10M14 1L2 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="opacity-0 group-open:opacity-100" />
              </svg>
            </summary>
            <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-panel border border-line bg-card shadow-card">
              {LINKS.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={e => e.currentTarget.closest('details')?.removeAttribute('open')}
                  aria-current={isActive(l.href) ? 'page' : undefined}
                  className={`block border-b border-line px-5 py-3.5 text-sm last:border-b-0 ${focusRing} ${
                    isActive(l.href)
                      ? 'text-gold underline decoration-gold underline-offset-4'
                      : 'text-mid hover:text-gold-light'
                  }`}
                >
                  {l.label}
                </Link>
              ))}
              <div className="px-5 py-3.5 sm:hidden">
                <AppStoreButton label="Get the App" surface="nav_mobile" />
              </div>
            </div>
          </details>
        </div>
      </nav>
    </header>
  );
}
