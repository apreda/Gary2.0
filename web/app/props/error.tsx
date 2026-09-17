'use client';

import Link from 'next/link';

export default function PropsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-5 text-center">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-gold">Temporary interruption</p>
      <h1 className="mt-3 font-display text-3xl text-hi">We couldn&apos;t load the player props.</h1>
      <p className="mt-2 text-[15px] text-mid">
        Try again, or read today&apos;s game picks and previous prop cards in the archive.
      </p>
      <button
        onClick={() => retry()}
        className="mt-6 rounded-card border border-gold/40 px-5 py-3 text-sm text-gold transition-colors hover:border-gold/70 hover:text-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
      >
        Try again
      </button>
      <p className="mt-5 flex gap-4 text-sm">
        <Link href="/picks" className="text-gold underline decoration-gold/40 underline-offset-4">Today&apos;s game picks</Link>
        <Link href="/archive" className="text-gold underline decoration-gold/40 underline-offset-4">Previous prop cards</Link>
      </p>
      <p className="mt-2 text-[13px] text-low">Archive cards are historical.</p>
    </main>
  );
}
