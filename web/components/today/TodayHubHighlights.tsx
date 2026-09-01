import Link from 'next/link';
import { ClampFade } from '@/components/ClampFade';
import { LANES } from '@/lib/gary/hub';
import type { HubHighlight } from '@/lib/today/model';

export function TodayHubHighlights({
  highlights,
  unavailable = false,
}: {
  highlights: HubHighlight[];
  unavailable?: boolean;
}) {
  return (
    <section className="rounded-panel border border-line bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl uppercase text-hi">From the Hub</h2>
        <Link
          href="/hub"
          className="text-[13px] text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
        >
          All insights →
        </Link>
      </div>

      {unavailable ? (
        <p className="mt-4 text-[14px] leading-relaxed text-low">
          Today&apos;s research feed is temporarily unavailable. Open the Hub to try again.
        </p>
      ) : highlights.length > 0 ? (
        <ul className="mt-4">
          {highlights.map(({ lane, row }) => (
            <li key={row.id} className="border-b border-line py-3.5 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] text-gold">
                  {LANES[lane].chip}
                </span>
                <span className="tnum font-mono text-[10.5px] text-low">{row.game}</span>
              </div>
              <p className="mt-1.5 text-[14.5px] font-medium leading-snug text-hi">{row.headline}</p>
              {row.detail && (
                <ClampFade lines={3} className="mt-1 text-[13px] leading-relaxed text-mid">
                  {row.detail}
                </ClampFade>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-[14px] leading-relaxed text-low">
          Today&apos;s research lanes have not posted yet.
        </p>
      )}
    </section>
  );
}
