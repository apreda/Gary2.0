import { subscribeToEmailUpdates } from '@/app/email/actions';
import { isEmailRuntimeReady } from '@/lib/email/config';

export function EmailSignup({ source = 'footer' }: { source?: string }) {
  if (!isEmailRuntimeReady()) return null;

  return (
    <section id="updates" aria-labelledby="updates-title" className="rounded-panel border border-gold/30 bg-card px-5 py-6 sm:px-7">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">Gary in your inbox</p>
      <h2 id="updates-title" className="mt-2 font-display text-2xl uppercase text-hi">Know when the board lands</h2>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-mid">
        Get a direct link when the free daily board posts, a Sunday receipt of Gary&rsquo;s public record, or both.
      </p>
      <form action={subscribeToEmailUpdates} className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
        <input type="hidden" name="source" value={source.slice(0, 100)} />
        <div className="absolute -left-[10000px]" aria-hidden="true">
          <label htmlFor={`website-${source}`}>Website</label>
          <input id={`website-${source}`} type="text" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <label className="sr-only" htmlFor={`email-${source}`}>Email address</label>
        <input
          id={`email-${source}`}
          type="email"
          name="email"
          required
          maxLength={320}
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          className="min-w-0 rounded-card border border-line bg-ink px-4 py-3 text-[14px] text-hi placeholder:text-faint focus:border-gold/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
        />
        <label className="sr-only" htmlFor={`cadence-${source}`}>Email frequency</label>
        <select
          id={`cadence-${source}`}
          name="cadence"
          defaultValue="both"
          className="rounded-card border border-line bg-ink px-4 py-3 text-[14px] text-hi focus:border-gold/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
        >
          <option value="both">Daily board + Sunday receipt</option>
          <option value="daily">Daily board only</option>
          <option value="weekly">Sunday receipt only</option>
        </select>
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-card bg-gold px-5 py-3 text-sm font-semibold text-ink shadow-card transition-[transform,opacity] duration-150 hover:-translate-y-px hover:opacity-95 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          Send me updates
        </button>
      </form>
      <p className="mt-3 text-[11px] leading-relaxed text-low">
        Free website updates only. We&rsquo;ll email once to confirm; every recurring message has an unsubscribe link. By subscribing, you agree to the{' '}
        <a href="/privacy" className="text-gold underline decoration-gold/40 underline-offset-2">privacy policy</a>.
      </p>
    </section>
  );
}
