import Link from 'next/link';
import Image from 'next/image';
import { AppStoreButton } from './AppStoreButton';

const LINKS = [
  { href: '/picks', label: 'Picks' },
  { href: '/props', label: 'Props' },
  { href: '/hub', label: 'Hub' },
  { href: '/results', label: 'Results' },
  { href: '/how-it-works', label: 'How It Works' },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-ink/90 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink">
          <Image src="/brand/gary-head.png" alt="Gary" width={28} height={28} priority />
          <span className="font-display text-lg tracking-wide text-white/95">GARY A.I.</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-6 md:flex">
          {LINKS.map(l => (
            <Link key={l.href} href={l.href} className="text-sm text-white/60 transition-colors hover:text-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <AppStoreButton label="Get the App" />

          {/* Mobile disclosure menu — no JS */}
          <details className="relative md:hidden">
            <summary className="cursor-pointer list-none rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink">
              Menu
            </summary>
            <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-white/10 bg-card shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
              {LINKS.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="block px-4 py-3 text-sm text-white/70 transition-colors hover:text-white/95 first:rounded-t-xl last:rounded-b-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </nav>
    </header>
  );
}
