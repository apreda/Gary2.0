import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-20 border-t border-white/8 px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-4">
        <p className="text-[13px] leading-relaxed text-white/55">
          Gary is for informational and entertainment purposes only. We don&apos;t facilitate
          gambling, accept deposits, or place bets. 18+. If you or someone you know has a
          gambling problem, call 1-800-GAMBLER.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-white/55">
          <Link href="/terms" className="hover:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink">Terms</Link>
          <Link href="/privacy" className="hover:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink">Privacy</Link>
          <Link href="/contact" className="hover:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink">Contact</Link>
          <Link href="/press" className="hover:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink">Press &amp; Brand</Link>
          <a href="https://x.com/BetwithGary" className="hover:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink">@BetwithGary</a>
        </div>
        <p className="text-[12px] text-white/50">© {new Date().getFullYear()} Gary A.I. LLC · betwithgary.ai</p>
      </div>
    </footer>
  );
}
