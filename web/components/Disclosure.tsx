/**
 * The "read the rest" affordance — a native <details>, so the full text ships
 * in the HTML (crawlable, no client JS) while the card stays short.
 *
 * It is a text affordance with a caret, NOT a pill: rounded bubble buttons are
 * banned in this product. Gold marks the tappable, per the app's rule.
 */
export function Disclosure({
  summary,
  children,
  className = '',
}: {
  summary: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={`group ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-gold transition-colors hover:text-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="inline-block transition-transform duration-150 group-open:rotate-90"
        >
          ›
        </span>
        <span className="group-open:hidden">{summary}</span>
        <span className="hidden group-open:inline">Hide</span>
      </summary>
      <div className="mt-3.5">{children}</div>
    </details>
  );
}
