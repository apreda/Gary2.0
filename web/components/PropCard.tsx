import { Eyebrow } from './Eyebrow';
import { normalizeLeague } from '@/lib/gary/leagues';
import type { PropPick } from '@/lib/gary/types';

export function PropCard({ prop, expanded = false }: { prop: PropPick; expanded?: boolean }) {
  const league = normalizeLeague(prop.league, prop.sport) ?? '';
  const isOver = (prop.bet ?? '').toLowerCase() === 'over' || (prop.bet ?? '').toLowerCase() === 'yes';
  const callColor = isOver ? 'text-gold' : 'text-silver';
  const odds = prop.odds;
  const rationale = (prop.rationale ?? prop.analysis ?? '').trim();

  return (
    <article className="rounded-[20px] border border-silver/30 bg-card p-5 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between">
        <Eyebrow>{league}{prop.matchup ? ` · ${prop.matchup}` : ''}</Eyebrow>
      </div>
      <h3 className="mt-2 font-display text-xl text-white/95">{prop.player}</h3>
      {rationale && (
        <p className={`mt-2 text-[15px] leading-relaxed text-white/60 ${expanded ? '' : 'line-clamp-3'}`}>{rationale}</p>
      )}
      <div className="mt-4 flex items-center justify-between rounded-[10px] border border-silver/50 bg-chip px-4 py-2.5">
        <span className={`font-mono text-sm font-bold uppercase ${callColor}`}>
          {prop.bet} {prop.line} {prop.prop?.replace(/\s[\d.]+$/, '')}
        </span>
        {odds != null && <span className="font-mono text-sm text-white/55">{odds > 0 ? `+${odds}` : odds}</span>}
      </div>
      {Array.isArray(prop.key_stats) && prop.key_stats.length > 0 && (
        <ul className="mt-3 space-y-1">
          {prop.key_stats.slice(0, 3).map((s, i) => (
            <li key={i} className="font-mono text-[12px] text-white/55">· {s}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
