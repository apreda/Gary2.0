import { Disclosure } from '@/components/Disclosure';
import { ScoutRead } from '@/components/ScoutRead';
import { PropTailFadeRow } from '@/components/book/TailFadeRow';
import { isOverCall, oddsText, propCall, parseScoutSections } from '@/lib/gary/format';
import type { PropPick } from '@/lib/gary/types';

/**
 * The call, worded like a slip: "OVER 1.5 Total Bases  +135". OVER wears the
 * gold, UNDER goes silver — the app's rule, so direction reads before the
 * words do.
 */
export function PropCall({ prop, size = 'md' }: { prop: PropPick; size?: 'md' | 'lg' }) {
  const over = isOverCall(prop);
  const odds = oddsText(prop.odds);
  const text = size === 'lg' ? 'text-[14px]' : 'text-[12.5px]';
  return (
    <span
      className={`flex items-center justify-between gap-3 rounded-chip border bg-chip px-4 ${
        size === 'lg' ? 'py-3' : 'py-2.5'
      } ${over ? 'border-gold/60' : 'border-silver/55'}`}
    >
      <span className={`font-mono ${text} font-bold tracking-[0.03em] ${over ? 'text-gold' : 'text-silver'}`}>
        {propCall(prop)}
      </span>
      {odds && <span className={`tnum font-mono ${text} font-bold text-low`}>{odds}</span>}
    </span>
  );
}

/** The stat spine under a call — the numbers Gary leaned on, verbatim. */
export function KeyStats({ stats, max = 3 }: { stats?: string[]; max?: number }) {
  if (!Array.isArray(stats) || stats.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1.5">
      {stats.slice(0, max).map((s, i) => (
        <li key={i} className="flex gap-2 font-mono text-[11.5px] leading-[1.5] text-low">
          <span aria-hidden className="text-gold/50">·</span>
          <span>{s}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One prop inside its game's panel. The written read lives behind a caret so
 * a nine-prop game still scans in one screen — and opens in full, never
 * clipped: the board used to fade its rationale out mid-sentence.
 */
export function PropRow({ prop }: { prop: PropPick }) {
  const read = (prop.rationale ?? prop.analysis ?? '').trim();
  const hasRead = parseScoutSections(read).length > 0;
  const conf = prop.confidence ? Math.round(prop.confidence * 100) : null;

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
        <div className="min-w-0">
          <p className="font-display text-[clamp(1.15rem,3vw,1.45rem)] uppercase leading-tight text-hi">
            {prop.player}
          </p>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.05em] text-low">
            {[prop.team, prop.position].filter(Boolean).join(' · ')}
            {conf !== null && <span className="text-faint"> · {conf}% conf</span>}
          </p>
        </div>
        <div className="w-full shrink-0 sm:w-[300px]">
          <PropCall prop={prop} />
        </div>
      </div>

      <KeyStats stats={prop.key_stats} />

      {hasRead && (
        <Disclosure summary="Why Gary likes it" className="mt-3.5">
          <ScoutRead text={read} tone="tight" />
        </Disclosure>
      )}

      {/* Renders only inside a BookDayProvider — board pages opt in. */}
      <PropTailFadeRow player={prop.player ?? ''} prop={prop.prop ?? ''} commence={prop.commence_time} />
    </div>
  );
}
