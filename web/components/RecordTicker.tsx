import Link from 'next/link';
import { Eyebrow } from './Eyebrow';

export interface TickerItem { league: string; pick: string; date: string }

/** Recent WINS reel — intentionally shows only winning picks (a marketing surface, not the record; /results is the honest ledger). */
export function RecordTicker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;
  // No length cap: the reel scrolls horizontally, so a long pick simply rides
  // wider — truncation (and its "…") has no place on a scrolling surface.
  const row = items;
  return (
    <div className="border-y border-line bg-elev/60 py-2.5">
      <p className="px-5 pb-2 font-mono text-[10px] uppercase tracking-[0.04em] text-low">
        Recent wins ·{' '}
        <Link href="/results" className="text-gold/80 transition-colors hover:text-gold">
          Full record &rarr;
        </Link>
      </p>
      <div className="overflow-hidden">
        <div className="flex w-max animate-[ticker_45s_linear_infinite]">
          {[...row, ...row].map((i, idx) => (
            <span key={idx} className="flex items-center gap-2 whitespace-nowrap pr-10">
              <Eyebrow dim>{i.league}</Eyebrow>
              <span className="font-mono text-[12px] text-mid">{i.pick}</span>
              <span className="font-mono text-[12px] font-bold text-win">W</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
