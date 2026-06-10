'use client';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-low">TEMPORARY OUTAGE</p>
      <h1 className="mt-3 font-display text-3xl text-hi">The board hit a bad feed.</h1>
      <p className="mt-2 text-[15px] text-mid">Gary&apos;s data source didn&apos;t answer. It usually clears in a minute.</p>
      <button
        onClick={reset}
        className="mt-6 rounded-card border border-line-strong px-5 py-3 text-sm text-mid hover:border-white/30 hover:text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
      >
        Try again
      </button>
    </main>
  );
}
