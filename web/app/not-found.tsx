import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-gold">OFF THE BOARD</p>
      <h1 className="mt-3 font-display text-3xl text-hi">That page isn&apos;t on the slate.</h1>
      <p className="mt-2 text-[15px] text-mid">
        The link may be stale, or the page moved. Today&apos;s board is still live.
      </p>
      <Link
        href="/picks"
        className="mt-6 rounded-card border border-gold/40 px-5 py-3 text-sm text-gold transition-colors hover:border-gold/70 hover:text-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
      >
        See today&apos;s picks
      </Link>
    </main>
  );
}
