import { Eyebrow } from './Eyebrow';

export interface TickerItem { league: string; pick: string; date: string }

/** Recent WINS reel — intentionally shows only winning picks (a marketing surface, not the record; /results is the honest ledger). */
export function RecordTicker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;
  const row = items.map(i => ({ ...i, pick: i.pick.length > 40 ? `${i.pick.slice(0, 40)}…` : i.pick }));
  return (
    <div className="overflow-hidden border-y border-white/8 bg-elev/60 py-2">
      <div className="flex w-max animate-[ticker_45s_linear_infinite]">
        {[...row, ...row].map((i, idx) => (
          <span key={idx} className="flex items-center gap-2 whitespace-nowrap pr-8">
            <Eyebrow>{i.league}</Eyebrow>
            <span className="font-mono text-[12px] text-white/75">{i.pick}</span>
            <span className="font-mono text-[12px] font-bold text-win">W</span>
          </span>
        ))}
      </div>
    </div>
  );
}
