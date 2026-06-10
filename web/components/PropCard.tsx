import { Eyebrow } from './Eyebrow';
import { normalizeLeague } from '@/lib/gary/leagues';
import type { PropPick } from '@/lib/gary/types';

/**
 * The silver twin of the gold game card (iOS CompactPropRow): same skeleton,
 * silver stroke, and the call wears its direction — OVER stays gold, UNDER
 * goes silver. The only gold on an UNDER card is nothing at all.
 */
export function PropCard({ prop, expanded = false }: { prop: PropPick; expanded?: boolean }) {
  const league = normalizeLeague(prop.league, prop.sport) ?? '';
  const isOver = (prop.bet ?? '').toLowerCase() === 'over' || (prop.bet ?? '').toLowerCase() === 'yes';
  const callColor = isOver ? 'text-gold' : 'text-silver';
  const odds = prop.odds;
  const rationale = (prop.rationale ?? prop.analysis ?? '').trim();

  return (
    <article className="rounded-card border border-silver/40 bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <Eyebrow dim>{league}{prop.matchup ? ` · ${prop.matchup}` : ''}</Eyebrow>
      </div>
      <h3 className="mt-2.5 font-display text-xl leading-tight text-hi">{prop.player}</h3>
      {rationale && (
        <p className={`mt-2 text-[15px] leading-relaxed text-mid ${expanded ? '' : 'line-clamp-3'}`}>{rationale}</p>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-chip border border-silver/55 bg-chip px-4 py-2.5">
        <span className={`font-mono text-sm font-bold uppercase tracking-[0.04em] ${callColor}`}>
          {prop.bet} {prop.line} {prop.prop?.replace(/\s[\d.]+$/, '')}
        </span>
        {odds != null && (
          <span className="tnum font-mono text-sm font-bold text-silver-dim">{odds > 0 ? `+${odds}` : odds}</span>
        )}
      </div>
      {Array.isArray(prop.key_stats) && prop.key_stats.length > 0 && (
        <ul className="mt-3 space-y-1">
          {prop.key_stats.slice(0, 3).map((s, i) => (
            <li key={i} className="font-mono text-[12px] text-low">· {s}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
